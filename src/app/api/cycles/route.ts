import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, requireAdminOrHR, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  applyTeamTemplates,
  createAssignmentsForCycle,
  computeDirectionCoverageWarnings,
  validateTeamTemplateCoverage,
} from "@/lib/assignments";
import { applyRateLimit } from "@/lib/rate-limit";
import { parsePaginationParams, buildPaginationMeta } from "@/lib/utils";
import { errorResponse, zodErrorResponse, internalErrorResponse } from "@/lib/api-responses";
import type { CycleStatus } from "@prisma/client";

const teamTemplatesSchema = z.object({
  teamId: z.string().min(1, "Team ID is required"),
  templateIds: z.array(z.string().min(1)).min(1, "At least one template per team"),
});

const createCycleSchema = z.object({
  name: z.string().min(1, "Cycle name is required"),
  startDate: z.string().refine((d) => !isNaN(Date.parse(d)), "Invalid start date"),
  endDate: z.string().refine((d) => !isNaN(Date.parse(d)), "Invalid end date"),
  teamTemplates: z.array(teamTemplatesSchema).min(1, "At least one team is required"),
});

export async function GET(request: NextRequest) {
  const rl = applyRateLimit(request);
  if (rl) return rl;

  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const { searchParams } = new URL(request.url);
  const { page, limit, search } = parsePaginationParams(searchParams, 12);
  const statusParam = searchParams.get("status");

  const statusFilter: { status?: CycleStatus | { in: CycleStatus[] } } = {};
  if (statusParam) {
    const statuses = statusParam.split(",") as CycleStatus[];
    statusFilter.status = statuses.length === 1 ? statuses[0] : { in: statuses };
  }

  const where = {
    companyId: authResult.companyId,
    ...statusFilter,
    ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
  };

  const [cycles, total] = await Promise.all([
    prisma.evaluationCycle.findMany({
      where,
      include: {
        _count: { select: { assignments: true } },
        assignments: { select: { status: true } },
        cycleTeams: {
          include: {
            team: { select: { id: true, name: true } },
            templates: {
              include: {
                template: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.evaluationCycle.count({ where }),
  ]);

  const cyclesWithCounts = cycles.map(({ assignments, ...cycle }) => ({
    ...cycle,
    submittedCount: assignments.filter((a) => a.status === "SUBMITTED").length,
    pendingCount: assignments.filter((a) => a.status !== "SUBMITTED").length,
  }));

  return NextResponse.json({
    success: true,
    data: cyclesWithCounts,
    pagination: buildPaginationMeta(page, limit, total),
  });
}

export async function POST(request: NextRequest) {
  const rl = applyRateLimit(request);
  if (rl) return rl;

  const authResult = await requireAdminOrHR();
  if (isAuthError(authResult)) return authResult;

  try {
    const body = await request.json();
    const validated = createCycleSchema.parse(body);

    const startDate = new Date(validated.startDate);
    const endDate = new Date(validated.endDate);

    if (endDate <= startDate) {
      return errorResponse("End date must be after start date", "VALIDATION_ERROR", 400);
    }

    const teamIds = validated.teamTemplates.map((tt) => tt.teamId);
    if (new Set(teamIds).size !== teamIds.length) {
      return errorResponse("Duplicate teams are not allowed", "VALIDATION_ERROR", 400);
    }

    const validation = await validateTeamTemplateCoverage(
      authResult.companyId,
      validated.teamTemplates
    );
    if (!validation.ok) {
      return errorResponse(validation.error, validation.code, 404);
    }
    // Coverage gaps no longer block creation — uncovered subjects simply get no
    // assignments. The gap is surfaced as a soft warning and persisted (recomputed)
    // on the cycle detail page so an admin can resolve it while the cycle is DRAFT.
    const { pairs, gaps } = validation.data;

    const cycle = await prisma.$transaction(async (tx) => {
      const created = await tx.evaluationCycle.create({
        data: {
          name: validated.name,
          companyId: authResult.companyId,
          startDate,
          endDate,
          status: "DRAFT",
        },
      });

      await applyTeamTemplates(tx, created.id, validated.teamTemplates);

      return created;
    });

    const directionWarnings = computeDirectionCoverageWarnings(
      new Map(pairs.map((p) => [p.teamId, p.templates]))
    );

    const { count } = await createAssignmentsForCycle(
      cycle.id,
      authResult.companyId,
      pairs
    );

    const cycleWithRelations = await prisma.evaluationCycle.findUniqueOrThrow({
      where: { id: cycle.id },
      include: {
        _count: { select: { assignments: true } },
        cycleTeams: {
          include: {
            team: { select: { id: true, name: true } },
            templates: {
              include: { template: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: { ...cycleWithRelations, assignmentsCreated: count },
        warnings:
          directionWarnings.length > 0 || gaps.length > 0
            ? {
                directionCoverage: directionWarnings.length > 0 ? directionWarnings : undefined,
                coverageGaps: gaps.length > 0 ? gaps : undefined,
              }
            : undefined,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) return zodErrorResponse(error);
    return internalErrorResponse(error);
  }
}
