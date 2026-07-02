import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminOrHR, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { validateCuidParam } from "@/lib/validation";
import { errorResponse, zodErrorResponse, internalErrorResponse } from "@/lib/api-responses";
import { regenerateCycleAssignments } from "@/lib/assignments";
import { resolveTemplateForSubject, type TemplateMeta } from "@/lib/template-routing";
import { isCycleSubjectRole } from "@/lib/cycle-subjects";

/**
 * Per-team person→template mapping for a cycle. Powers the Templates tab.
 * GET lists all subjects (grouped by team) with their effective template;
 * PUT pins a template (MANUAL); DELETE resets a subject to automatic. Writes
 * require the cycle to be DRAFT and regenerate the cycle's assignments.
 */

interface CycleForMapping {
  id: string;
  status: "DRAFT" | "ACTIVE" | "CLOSED" | "ARCHIVED";
  cycleTeams: {
    team: {
      id: string;
      name: string;
      members: {
        userId: string;
        role: "MANAGER" | "MEMBER" | "EXTERNAL" | "IMPERSONATOR";
        designationId: string | null;
        user: { name: string };
        designation: { name: string } | null;
      }[];
    };
    templates: {
      template: {
        id: string;
        name: string;
        designationIds: string[];
        appliesToRole: "MANAGER" | "MEMBER" | "ANY";
        sections: unknown;
      };
    }[];
  }[];
}

async function loadCycleForMapping(
  id: string,
  companyId: string
): Promise<CycleForMapping | null> {
  return prisma.evaluationCycle.findFirst({
    where: { id, companyId },
    select: {
      id: true,
      status: true,
      cycleTeams: {
        select: {
          team: {
            select: {
              id: true,
              name: true,
              members: {
                select: {
                  userId: true,
                  role: true,
                  designationId: true,
                  user: { select: { name: true } },
                  designation: { select: { name: true } },
                },
              },
            },
          },
          templates: {
            select: {
              template: {
                select: {
                  id: true,
                  name: true,
                  designationIds: true,
                  appliesToRole: true,
                  sections: true,
                },
              },
            },
          },
        },
      },
    },
  }) as Promise<CycleForMapping | null>;
}

function teamMetas(team: CycleForMapping["cycleTeams"][number]): TemplateMeta[] {
  return team.templates.map((t) => ({
    id: t.template.id,
    designationIds: t.template.designationIds,
    appliesToRole: t.template.appliesToRole,
    sections: [],
  }));
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

  const authResult = await requireAdminOrHR();
  if (isAuthError(authResult)) return authResult;

  const cycle = await loadCycleForMapping(id, authResult.companyId);
  if (!cycle) return errorResponse("Cycle not found", "NOT_FOUND", 404);

  const rows = await prisma.cycleSubjectTemplate.findMany({
    where: { cycleId: id },
    select: { subjectId: true, teamId: true, templateId: true, source: true },
  });
  const rowByKey = new Map(rows.map((r) => [`${r.subjectId}:${r.teamId}`, r]));

  // Template name lookup: team templates + any manually-pinned templates.
  const nameById = new Map<string, string>();
  for (const ct of cycle.cycleTeams) {
    for (const t of ct.templates) nameById.set(t.template.id, t.template.name);
  }
  const missingNameIds = Array.from(
    new Set(
      rows
        .map((r) => r.templateId)
        .filter((tid): tid is string => Boolean(tid) && !nameById.has(tid as string))
    )
  );
  if (missingNameIds.length) {
    const extra = await prisma.evaluationTemplate.findMany({
      where: { id: { in: missingNameIds } },
      select: { id: true, name: true },
    });
    for (const t of extra) nameById.set(t.id, t.name);
  }

  const currentKeys = new Set<string>();
  const teams = cycle.cycleTeams.map((ct) => {
    const metas = teamMetas(ct);
    const subjects = ct.team.members
      .filter((m) => isCycleSubjectRole(m.role))
      .map((m) => {
        const key = `${m.userId}:${ct.team.id}`;
        currentKeys.add(key);
        const row = rowByKey.get(key);
        // No row yet (legacy) → show the routed template as AUTO.
        const templateId = row
          ? row.templateId
          : resolveTemplateForSubject(metas, m.designationId, m.role as "MANAGER" | "MEMBER")
              ?.template.id ?? null;
        const source = row?.source ?? "AUTO";
        return {
          subjectId: m.userId,
          name: m.user.name,
          role: m.role,
          designationName: m.designation?.name ?? null,
          templateId,
          templateName: templateId ? nameById.get(templateId) ?? null : null,
          source,
          covered: templateId !== null,
        };
      });
    return { teamId: ct.team.id, teamName: ct.team.name, subjects };
  });

  // Drift signal (DRAFT only): rows vs current subject-members.
  let membershipOutOfDate = false;
  if (cycle.status === "DRAFT" && rows.length > 0) {
    const rowKeys = new Set(rows.map((r) => `${r.subjectId}:${r.teamId}`));
    membershipOutOfDate =
      [...currentKeys].some((k) => !rowKeys.has(k)) ||
      [...rowKeys].some((k) => !currentKeys.has(k));
  }

  return NextResponse.json({
    success: true,
    data: { status: cycle.status, membershipOutOfDate, teams },
  });
}

const putSchema = z.object({
  teamId: z.string().min(1),
  subjectId: z.string().min(1),
  // null = deliberately remove the template (subject won't be reviewed).
  templateId: z.string().min(1).nullable(),
});

export async function PUT(
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
    const { teamId, subjectId, templateId } = putSchema.parse(await request.json());

    const cycle = await loadCycleForMapping(id, authResult.companyId);
    if (!cycle) return errorResponse("Cycle not found", "NOT_FOUND", 404);
    if (cycle.status !== "DRAFT") {
      return errorResponse(
        "Templates can only be changed while the cycle is a draft",
        "INVALID_STATUS",
        400
      );
    }

    // Subject must be a reviewable member of that cycle team.
    const team = cycle.cycleTeams.find((ct) => ct.team.id === teamId);
    const member = team?.team.members.find(
      (m) => m.userId === subjectId && isCycleSubjectRole(m.role)
    );
    if (!team || !member) {
      return errorResponse("Subject is not a member of that team", "NOT_FOUND", 404);
    }

    // A non-null template must be visible to the company (own or global) and not
    // archived. null is a valid "remove" — the subject gets no reviews.
    if (templateId !== null) {
      const template = await prisma.evaluationTemplate.findFirst({
        where: {
          id: templateId,
          isArchived: false,
          OR: [{ companyId: authResult.companyId }, { isGlobal: true }],
        },
        select: { id: true },
      });
      if (!template) return errorResponse("Template not found", "NOT_FOUND", 404);
    }

    await prisma.cycleSubjectTemplate.upsert({
      where: { cycleId_subjectId_teamId: { cycleId: id, subjectId, teamId } },
      create: { cycleId: id, teamId, subjectId, templateId, source: "MANUAL" },
      update: { templateId, source: "MANUAL" },
    });

    await regenerateCycleAssignments(id, authResult.companyId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) return zodErrorResponse(error);
    return internalErrorResponse(error);
  }
}

const deleteSchema = z.object({
  teamId: z.string().min(1),
  subjectId: z.string().min(1),
});

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

  try {
    const { teamId, subjectId } = deleteSchema.parse(await request.json());

    const cycle = await loadCycleForMapping(id, authResult.companyId);
    if (!cycle) return errorResponse("Cycle not found", "NOT_FOUND", 404);
    if (cycle.status !== "DRAFT") {
      return errorResponse(
        "Templates can only be changed while the cycle is a draft",
        "INVALID_STATUS",
        400
      );
    }

    const team = cycle.cycleTeams.find((ct) => ct.team.id === teamId);
    const member = team?.team.members.find(
      (m) => m.userId === subjectId && isCycleSubjectRole(m.role)
    );
    if (!team || !member) {
      return errorResponse("Subject is not a member of that team", "NOT_FOUND", 404);
    }

    // Reset to automatic: recompute the routed template for this team.
    const routed =
      resolveTemplateForSubject(teamMetas(team), member.designationId, member.role as "MANAGER" | "MEMBER")
        ?.template.id ?? null;

    await prisma.cycleSubjectTemplate.upsert({
      where: { cycleId_subjectId_teamId: { cycleId: id, subjectId, teamId } },
      create: { cycleId: id, teamId, subjectId, templateId: routed, source: "AUTO" },
      update: { templateId: routed, source: "AUTO" },
    });

    await regenerateCycleAssignments(id, authResult.companyId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) return zodErrorResponse(error);
    return internalErrorResponse(error);
  }
}
