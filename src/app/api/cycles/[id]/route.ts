import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, requireAdminOrHR, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  applyTeamTemplates,
  createAssignmentsForCycle,
  computeDirectionCoverageWarnings,
  validateTeamTemplateCoverage,
  type TeamTemplatesPair,
} from "@/lib/assignments";
import { computeCoverageGaps, type CoverageGap } from "@/lib/template-routing";
import { applyRateLimit } from "@/lib/rate-limit";
import { validateCuidParam } from "@/lib/validation";
import { errorResponse, zodErrorResponse, internalErrorResponse } from "@/lib/api-responses";

const teamTemplatesSchema = z.object({
  teamId: z.string().min(1),
  templateIds: z.array(z.string().min(1)).min(1),
});

const updateCycleSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "CLOSED", "ARCHIVED"]).optional(),
  startDate: z.string().refine((d) => !isNaN(Date.parse(d)), "Invalid start date").optional(),
  endDate: z.string().refine((d) => !isNaN(Date.parse(d)), "Invalid end date").optional(),
  teamTemplates: z.array(teamTemplatesSchema).min(1).optional(),
});

const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["ACTIVE"],
  ACTIVE: ["CLOSED"],
  CLOSED: ["ACTIVE", "ARCHIVED"],
  ARCHIVED: [],
};

function isValidTransition(from: string, to: string): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = applyRateLimit(request);
  if (rl) return rl;
  const { id } = await params;
  const invalid = validateCuidParam(id);
  if (invalid) return invalid;

  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const [cycle, assignmentCounts] = await Promise.all([
    prisma.evaluationCycle.findFirst({
      where: { id, companyId: authResult.companyId },
      select: {
        id: true,
        name: true,
        status: true,
        startDate: true,
        endDate: true,
        createdAt: true,
        updatedAt: true,
        companyId: true,
        cycleTeams: {
          include: {
            team: {
              select: {
                id: true,
                name: true,
                // Members + level needed by the routing matrix on the
                // Overview tab (DRAFT only). Cheap join on the same row.
                members: {
                  select: {
                    userId: true,
                    role: true,
                    designationId: true,
                    user: { select: { id: true, name: true } },
                    designation: { select: { id: true, name: true } },
                  },
                },
              },
            },
            templates: {
              include: {
                template: {
                  select: {
                    id: true,
                    name: true,
                    description: true,
                    designationIds: true,
                    appliesToRole: true,
                    weightPreset: true,
                    weightsMember: true,
                    weightsManager: true,
                    sections: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.evaluationAssignment.groupBy({
      by: ["status"],
      where: { cycleId: id },
      _count: true,
    }),
  ]);

  if (!cycle) {
    return errorResponse("Cycle not found", "NOT_FOUND", 404);
  }

  const statusCounts: Record<string, number> = {};
  for (const g of assignmentCounts) statusCounts[g.status] = g._count;
  const totalAssignments = Object.values(statusCounts).reduce((s, c) => s + c, 0);
  const submittedAssignments = statusCounts["SUBMITTED"] ?? 0;
  const inProgressAssignments = statusCounts["IN_PROGRESS"] ?? 0;
  const pendingAssignments = statusCounts["PENDING"] ?? 0;
  const completionRate =
    totalAssignments > 0 ? Math.round((submittedAssignments / totalAssignments) * 100) : 0;

  const teamTemplates = cycle.cycleTeams.map((ct) => ({
    teamId: ct.team.id,
    teamName: ct.team.name,
    members: ct.team.members.map((m) => ({
      userId: m.userId,
      name: m.user.name,
      role: m.role,
      designationId: m.designationId,
      designationName: m.designation?.name ?? null,
    })),
    templates: ct.templates.map((ctt) => ({
      id: ctt.template.id,
      name: ctt.template.name,
      description: ctt.template.description,
      designationIds: ctt.template.designationIds,
      appliesToRole: ctt.template.appliesToRole,
      weightPreset: ctt.template.weightPreset,
      weightsMember: ctt.template.weightsMember,
      weightsManager: ctt.template.weightsManager,
      sections: ctt.template.sections,
    })),
  }));

  // Recompute coverage gaps on read so the detail page always reflects current
  // team membership / template routing (no stored snapshot to drift).
  const coverageGaps = computeCoverageGaps(
    teamTemplates.map((tt) => ({
      teamId: tt.teamId,
      teamName: tt.teamName,
      members: tt.members,
      templates: tt.templates.map((t) => ({
        id: t.id,
        designationIds: t.designationIds,
        appliesToRole: t.appliesToRole,
      })),
    }))
  );

  return NextResponse.json({
    success: true,
    data: {
      ...cycle,
      teamTemplates,
      coverageGaps,
      stats: {
        totalAssignments,
        submittedAssignments,
        inProgressAssignments,
        pendingAssignments,
        completionRate,
      },
    },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = applyRateLimit(request);
  if (rl) return rl;
  const { id } = await params;
  const invalid = validateCuidParam(id);
  if (invalid) return invalid;

  const authResult = await requireAdminOrHR();
  if (isAuthError(authResult)) return authResult;

  try {
    const body = await request.json();
    const validated = updateCycleSchema.parse(body);

    const existing = await prisma.evaluationCycle.findFirst({
      where: { id, companyId: authResult.companyId },
    });
    if (!existing) {
      return errorResponse("Cycle not found", "NOT_FOUND", 404);
    }

    if (validated.status && validated.status !== existing.status) {
      if (!isValidTransition(existing.status, validated.status)) {
        return errorResponse(
          `Cannot transition from ${existing.status} to ${validated.status}.`,
          "INVALID_STATUS",
          400
        );
      }
    }

    // Reopening (CLOSED → ACTIVE) requires a future end date so auto-close
    // doesn't immediately re-close the cycle.
    if (existing.status === "CLOSED" && validated.status === "ACTIVE") {
      if (!validated.endDate) {
        return errorResponse(
          "A new end date is required to reopen a cycle.",
          "VALIDATION_ERROR",
          400
        );
      }
      const newEnd = new Date(validated.endDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (newEnd < today) {
        return errorResponse(
          "End date must be today or in the future.",
          "VALIDATION_ERROR",
          400
        );
      }
    }

    if (validated.teamTemplates && existing.status !== "DRAFT") {
      return errorResponse(
        "Team-template assignments can only be changed while cycle is in DRAFT",
        "INVALID_STATUS",
        400
      );
    }

    let pairs: TeamTemplatesPair[] = [];
    let coverageGaps: CoverageGap[] = [];

    if (validated.teamTemplates) {
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
      // Gaps no longer block — surfaced as a soft warning and persisted (recomputed)
      // on the detail page. Uncovered subjects just get no regenerated assignments.
      coverageGaps = validation.data.gaps;
      pairs = validation.data.pairs;
    }

    const updateData: Record<string, unknown> = {};
    if (validated.name) updateData.name = validated.name;
    if (validated.status) updateData.status = validated.status;
    if (validated.startDate) updateData.startDate = new Date(validated.startDate);
    if (validated.endDate) updateData.endDate = new Date(validated.endDate);

    await prisma.$transaction(async (tx) => {
      await tx.evaluationCycle.update({ where: { id }, data: updateData });

      if (validated.teamTemplates) {
        await tx.evaluationAssignment.deleteMany({ where: { cycleId: id } });
        // CycleTeamTemplate cascades via CycleTeam delete
        await tx.cycleTeam.deleteMany({ where: { cycleId: id } });
        await applyTeamTemplates(tx, id, validated.teamTemplates);
      }
    });

    let directionWarnings: { teamId: string; missingDirections: string[] }[] = [];
    if (validated.teamTemplates && pairs.length > 0) {
      directionWarnings = computeDirectionCoverageWarnings(
        new Map(pairs.map((p) => [p.teamId, p.templates]))
      );
      await createAssignmentsForCycle(id, authResult.companyId, pairs);
    }

    const cycleWithRelations = await prisma.evaluationCycle.findUniqueOrThrow({
      where: { id },
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

    return NextResponse.json({
      success: true,
      data: cycleWithRelations,
      warnings:
        directionWarnings.length > 0 || coverageGaps.length > 0
          ? {
              directionCoverage: directionWarnings.length > 0 ? directionWarnings : undefined,
              coverageGaps: coverageGaps.length > 0 ? coverageGaps : undefined,
            }
          : undefined,
    });
  } catch (error) {
    if (error instanceof z.ZodError) return zodErrorResponse(error);
    return internalErrorResponse();
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = applyRateLimit(request);
  if (rl) return rl;
  const { id } = await params;
  const invalid = validateCuidParam(id);
  if (invalid) return invalid;

  const authResult = await requireAdminOrHR();
  if (isAuthError(authResult)) return authResult;

  const cycle = await prisma.evaluationCycle.findFirst({
    where: { id, companyId: authResult.companyId },
  });
  if (!cycle) {
    return errorResponse("Cycle not found", "NOT_FOUND", 404);
  }
  if (cycle.status !== "DRAFT") {
    return errorResponse("Only DRAFT cycles can be deleted", "INVALID_STATUS", 400);
  }

  await prisma.$transaction([
    prisma.otpSession.deleteMany({ where: { assignment: { cycleId: id } } }),
    prisma.evaluationResponse.deleteMany({ where: { assignment: { cycleId: id } } }),
    prisma.evaluationAssignment.deleteMany({ where: { cycleId: id } }),
    prisma.cycleTeam.deleteMany({ where: { cycleId: id } }),
    prisma.evaluationCycle.delete({ where: { id } }),
  ]);

  return NextResponse.json({ success: true, data: { deleted: true } });
}
