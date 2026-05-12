import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminOrHR, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { buildCycleReport } from "@/lib/reports";
import { getDataKeyFromRequest } from "@/lib/encryption-session";
import { applyRateLimit } from "@/lib/rate-limit";
import { validateCuidParam } from "@/lib/validation";
import { writeAuditLog } from "@/lib/audit";

type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

interface CalibrationSubject {
  subjectId: string;
  subjectName: string;
  teamId: string;
  teamName: string;
  rawScore: number;
  calibratedScore: number | null;
  justification: string | null;
  adjustedByName: string | null;
  updatedAt: string | null;
}

interface TeamCalibrationSummary {
  teamId: string;
  teamName: string;
  avgRawScore: number;
  avgCalibratedScore: number | null;
  calibrationOffset: number | null;
  calibrationJustification: string | null;
  memberCount: number;
}

interface CalibrationData {
  cycleId: string;
  cycleName: string;
  subjects: CalibrationSubject[];
  teamSummaries: TeamCalibrationSummary[];
}

// ─── GET: Fetch calibration data for a cycle ───

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = applyRateLimit(request);
  if (rl) return rl;
  const { id: cycleId } = await params;
  const invalid = validateCuidParam(cycleId);
  if (invalid) return invalid;

  const authResult = await requireAdminOrHR();
  if (isAuthError(authResult)) return authResult;
  const { companyId } = authResult;

  const cycle = await prisma.evaluationCycle.findFirst({
    where: { id: cycleId, companyId },
    select: { id: true, name: true, status: true },
  });

  if (!cycle) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Cycle not found", code: "NOT_FOUND" },
      { status: 404 }
    );
  }

  if (cycle.status !== "CLOSED" && cycle.status !== "ARCHIVED") {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Calibration is only available for closed cycles", code: "INVALID_STATUS" },
      { status: 400 }
    );
  }

  // Encryption gate
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
      { success: false, error: "Encryption locked. Enter your passphrase to view calibration data.", code: "ENCRYPTION_LOCKED" },
      { status: 403 }
    );
  }

  try {
    const report = await buildCycleReport(cycleId, companyId, dataKey);

    // Fetch existing calibration adjustments
    const calibrations = await prisma.calibrationAdjustment.findMany({
      where: { cycleId },
      include: { adjuster: { select: { name: true } } },
    });
    const calibMap = new Map(
      calibrations.map((c) => [`${c.subjectId}:${c.teamId}`, c])
    );

    // Fetch cycle teams with offsets and member info
    const cycleTeams = await prisma.cycleTeam.findMany({
      where: { cycleId },
      select: {
        teamId: true,
        calibrationOffset: true,
        calibrationJustification: true,
        calibrationAdjustedBy: true,
        team: {
          select: {
            id: true,
            name: true,
            members: {
              select: {
                userId: true,
                role: true,
                user: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });

    // Build subject-level data grouped by team
    const subjects: CalibrationSubject[] = [];
    const teamSummaries: TeamCalibrationSummary[] = [];

    // Build a raw score map from the cycle report
    const rawScoreMap = new Map(
      report.individualSummaries.map((s) => [s.subjectId, s.weightedOverallScore ?? s.overallScore])
    );

    for (const ct of cycleTeams) {
      const memberScores: { raw: number; calibrated: number | null }[] = [];

      for (const member of ct.team.members) {
        const rawScore = rawScoreMap.get(member.user.id) ?? 0;
        const calib = calibMap.get(`${member.user.id}:${ct.teamId}`);

        let calibratedScore: number | null = null;
        if (calib) {
          calibratedScore = calib.calibratedScore;
        } else if (ct.calibrationOffset !== null) {
          calibratedScore = parseFloat(Math.min(5, Math.max(0, rawScore + ct.calibrationOffset)).toFixed(2));
        }

        subjects.push({
          subjectId: member.user.id,
          subjectName: member.user.name,
          teamId: ct.teamId,
          teamName: ct.team.name,
          rawScore,
          calibratedScore,
          justification: calib?.justification ?? null,
          adjustedByName: calib?.adjuster.name ?? null,
          updatedAt: calib?.updatedAt.toISOString() ?? null,
        });

        memberScores.push({ raw: rawScore, calibrated: calibratedScore });
      }

      const memberCount = memberScores.length;
      const avgRaw = memberCount > 0
        ? parseFloat((memberScores.reduce((s, m) => s + m.raw, 0) / memberCount).toFixed(2))
        : 0;
      const calibScores = memberScores.filter((m) => m.calibrated !== null);
      const avgCalibrated = calibScores.length > 0
        ? parseFloat((calibScores.reduce((s, m) => s + m.calibrated!, 0) / calibScores.length).toFixed(2))
        : null;

      teamSummaries.push({
        teamId: ct.teamId,
        teamName: ct.team.name,
        avgRawScore: avgRaw,
        avgCalibratedScore: avgCalibrated,
        calibrationOffset: ct.calibrationOffset,
        calibrationJustification: ct.calibrationJustification,
        memberCount,
      });
    }

    await writeAuditLog({
      companyId,
      userId: authResult.userId,
      action: "decryption",
      target: `cycle:${cycleId}`,
      metadata: { type: "calibration_view" },
    });

    return NextResponse.json<ApiResponse<CalibrationData>>({
      success: true,
      data: { cycleId, cycleName: cycle.name, subjects, teamSummaries },
    });
  } catch (error) {
    console.error("Calibration data error:", error);
    const message = error instanceof Error ? error.message : "Failed to load calibration data";
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// ─── PUT: Save team offsets + member calibrations ───

const teamCalibrationSchema = z.object({
  teamId: z.string().min(1),
  offset: z.number().min(-5).max(5),
  justification: z.string().min(1).max(1000),
});

const memberCalibrationSchema = z.object({
  subjectId: z.string().min(1),
  teamId: z.string().min(1),
  rawScore: z.number().min(0).max(5),
  calibratedScore: z.number().min(0).max(5),
  justification: z.string().min(1).max(1000),
});

const calibrationBodySchema = z.object({
  teamAdjustments: z.array(teamCalibrationSchema).optional().default([]),
  memberAdjustments: z.array(memberCalibrationSchema).optional().default([]),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = applyRateLimit(request);
  if (rl) return rl;
  const { id: cycleId } = await params;
  const invalid = validateCuidParam(cycleId);
  if (invalid) return invalid;

  const authResult = await requireAdminOrHR();
  if (isAuthError(authResult)) return authResult;
  const { companyId, userId } = authResult;

  const cycle = await prisma.evaluationCycle.findFirst({
    where: { id: cycleId, companyId },
    select: { id: true, status: true },
  });

  if (!cycle) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Cycle not found", code: "NOT_FOUND" },
      { status: 404 }
    );
  }

  if (cycle.status !== "CLOSED") {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Calibration can only be performed on closed cycles", code: "INVALID_STATUS" },
      { status: 400 }
    );
  }

  let body: z.infer<typeof calibrationBodySchema>;
  try {
    const raw = await request.json();
    body = calibrationBodySchema.parse(raw);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "Validation failed", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Apply team-level offsets
      for (const ta of body.teamAdjustments) {
        await tx.cycleTeam.update({
          where: { cycleId_teamId: { cycleId, teamId: ta.teamId } },
          data: {
            calibrationOffset: ta.offset,
            calibrationJustification: ta.justification,
            calibrationAdjustedBy: userId,
          },
        });
      }

      // Upsert member-level calibrations
      for (const ma of body.memberAdjustments) {
        await tx.calibrationAdjustment.upsert({
          where: {
            cycleId_teamId_subjectId: {
              cycleId,
              teamId: ma.teamId,
              subjectId: ma.subjectId,
            },
          },
          create: {
            cycleId,
            teamId: ma.teamId,
            subjectId: ma.subjectId,
            adjustedBy: userId,
            rawScore: ma.rawScore,
            calibratedScore: ma.calibratedScore,
            justification: ma.justification,
          },
          update: {
            adjustedBy: userId,
            rawScore: ma.rawScore,
            calibratedScore: ma.calibratedScore,
            justification: ma.justification,
          },
        });
      }
    });

    // Audit log
    for (const ta of body.teamAdjustments) {
      await writeAuditLog({
        companyId,
        userId,
        action: "calibration_adjust",
        target: `team:${ta.teamId}`,
        metadata: { cycleId, offset: ta.offset, type: "team_offset" },
      });
    }
    for (const ma of body.memberAdjustments) {
      await writeAuditLog({
        companyId,
        userId,
        action: "calibration_adjust",
        target: `user:${ma.subjectId}`,
        metadata: { cycleId, teamId: ma.teamId, rawScore: ma.rawScore, calibratedScore: ma.calibratedScore, type: "member_override" },
      });
    }

    return NextResponse.json<ApiResponse<{ saved: boolean }>>({
      success: true,
      data: { saved: true },
    });
  } catch (error) {
    console.error("Calibration save error:", error);
    const message = error instanceof Error ? error.message : "Failed to save calibration";
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
