import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrHR, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { buildIndividualReport } from "@/lib/reports";
import { getDataKeyFromRequest } from "@/lib/encryption-session";
import { applyRateLimit } from "@/lib/rate-limit";
import { validateCuidParam } from "@/lib/validation";
import { writeAuditLog } from "@/lib/audit";
import type {
  PersonPerformanceProfile,
  PersonCycleSummary,
  CategoryScore,
  DirectionScores,
} from "@/types/report";
import { emptyDirectionScores } from "@/lib/directions";

type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const rl = applyRateLimit(request);
  if (rl) return rl;
  const { uid: userId } = await params;
  const invalidId = validateCuidParam(userId, "userId");
  if (invalidId) return invalidId;

  const authResult = await requireAdminOrHR();
  if (isAuthError(authResult)) return authResult;
  const { companyId } = authResult;

  const user = await prisma.user.findFirst({
    where: { id: userId, companyId },
    select: {
      id: true,
      name: true,
      email: true,
      avatar: true,
      role: true,
      teamMemberships: {
        select: {
          role: true,
          team: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!user) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "User not found", code: "NOT_FOUND" },
      { status: 404 }
    );
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { encryptionSetupAt: true, keyVersion: true },
  });
  if (!company?.encryptionSetupAt) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Encryption key was changed. Data from the previous encryption key cannot be viewed.", code: "ENCRYPTION_RESET" },
      { status: 403 }
    );
  }

  const dataKey = getDataKeyFromRequest(request, company.keyVersion);
  if (!dataKey) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Encryption locked. Enter your passphrase to view reports.", code: "ENCRYPTION_LOCKED" },
      { status: 403 }
    );
  }

  try {
    // Find all cycles where this user has submitted assignments as a subject
    const cycles = await prisma.evaluationCycle.findMany({
      where: {
        companyId,
        status: { in: ["ACTIVE", "CLOSED"] },
        assignments: {
          some: {
            subjectId: userId,
            status: "SUBMITTED",
          },
        },
      },
      select: {
        id: true,
        name: true,
        status: true,
        startDate: true,
        endDate: true,
      },
      orderBy: { startDate: "asc" },
    });

    // Parallel report generation across cycles
    const results = await Promise.allSettled(
      cycles.map(async (cycle) => {
        const report = await buildIndividualReport(cycle.id, userId, companyId, dataKey);
        // Distinct designations held during this cycle, gathered from the teams
        // the subject was on at report-build time (subjectContext.teams). The
        // designation captured here is "current" per team — close enough to
        // surface re-leveling across cycles when the same person appears with
        // different designations in different cycles' reports.
        const designations = Array.from(
          new Set(
            report.subjectContext.teams
              .map((t) => t.designation)
              .filter((d): d is string => !!d)
          )
        );
        return {
          cycleId: cycle.id,
          cycleName: cycle.name,
          cycleStatus: cycle.status,
          startDate: cycle.startDate.toISOString(),
          endDate: cycle.endDate.toISOString(),
          overallScore: report.overallScore,
          weightedOverallScore: report.weightedOverallScore,
          calibratedScore: report.calibratedScore,
          categoryScores: report.categoryScores,
          scoresByDirection: report.scoresByDirection,
          responseRate: report.responseRate,
          reviewerBreakdown: report.reviewerBreakdown,
          designations,
        } satisfies PersonCycleSummary;
      })
    );
    const cycleSummaries: PersonCycleSummary[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") cycleSummaries.push(r.value);
    }

    // Aggregate KPIs
    const scores = cycleSummaries.map((c) => c.overallScore).filter((s) => s > 0);
    const latestScore = scores.length > 0 ? scores[scores.length - 1] : null;
    const previousScore = scores.length > 1 ? scores[scores.length - 2] : null;
    const averageScore = scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
      : null;
    const highestScore = scores.length > 0 ? Math.max(...scores) : null;
    const lowestScore = scores.length > 0 ? Math.min(...scores) : null;
    const scoreTrend = latestScore !== null && previousScore !== null
      ? Math.round((latestScore - previousScore) * 100) / 100
      : null;

    const responseRates = cycleSummaries.map((c) => c.responseRate.rate);
    const avgResponseRate = responseRates.length > 0
      ? Math.round(responseRates.reduce((a, b) => a + b, 0) / responseRates.length)
      : 0;

    // Cross-cycle category averages
    const categoryMap = new Map<string, { total: number; count: number; maxScore: number }>();
    for (const cycle of cycleSummaries) {
      for (const cat of cycle.categoryScores) {
        const existing = categoryMap.get(cat.category);
        if (existing) {
          existing.total += cat.score;
          existing.count += 1;
        } else {
          categoryMap.set(cat.category, { total: cat.score, count: 1, maxScore: cat.maxScore });
        }
      }
    }
    const avgCategoryScores: CategoryScore[] = Array.from(categoryMap.entries()).map(
      ([category, { total, count, maxScore }]) => ({
        category,
        score: Math.round((total / count) * 100) / 100,
        maxScore,
      })
    );

    const avgDirectionScores: DirectionScores = emptyDirectionScores();
    for (const key of Object.keys(avgDirectionScores) as (keyof DirectionScores)[]) {
      const vals = cycleSummaries
        .map((c) => c.scoresByDirection[key])
        .filter((v): v is number => v !== null);
      if (vals.length > 0) {
        avgDirectionScores[key] = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
      }
    }

    const profile: PersonPerformanceProfile = {
      userId: user.id,
      userName: user.name,
      email: user.email,
      avatar: user.avatar,
      role: user.role,
      teamMemberships: user.teamMemberships.map((tm) => ({
        teamId: tm.team.id,
        teamName: tm.team.name,
        role: tm.role,
      })),
      cycleCount: cycleSummaries.length,
      latestScore,
      averageScore,
      highestScore,
      lowestScore,
      scoreTrend,
      avgResponseRate,
      cycles: cycleSummaries,
      avgCategoryScores,
      avgDirectionScores,
    };

    await writeAuditLog({
      companyId,
      userId: authResult.userId,
      action: "decryption",
      target: `user:${userId}`,
      metadata: { type: "person_performance_profile", cycleCount: cycleSummaries.length },
    });

    return NextResponse.json<ApiResponse<PersonPerformanceProfile>>({
      success: true,
      data: profile,
    });
  } catch (error) {
    console.error("Person performance profile error:", error);
    const message = error instanceof Error ? error.message : "Failed to generate profile";
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
