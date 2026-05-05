import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { validateCuidParam } from "@/lib/validation";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = applyRateLimit(request);
  if (rl) return rl;
  const { id: cycleId } = await params;
  const invalid = validateCuidParam(cycleId);
  if (invalid) return invalid;

  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  // Verify cycle belongs to company
  const cycle = await prisma.evaluationCycle.findFirst({
    where: { id: cycleId, companyId: authResult.companyId },
    select: {
      id: true,
      cycleTeams: {
        select: {
          teamId: true,
          team: { select: { id: true, name: true } },
          templates: {
            select: { template: { select: { id: true } } },
          },
        },
      },
    },
  });

  if (!cycle) {
    return NextResponse.json(
      { success: false, error: "Cycle not found", code: "NOT_FOUND" },
      { status: 404 }
    );
  }

  // Fetch assignments and resolve names in parallel
  const assignments = await prisma.evaluationAssignment.findMany({
    where: { cycleId },
    select: {
      id: true,
      templateId: true,
      subjectId: true,
      reviewerId: true,
      direction: true,
      status: true,
    },
  });

  // Batch-fetch user names and team memberships in parallel
  const userIds = new Set<string>();
  for (const a of assignments) {
    userIds.add(a.subjectId);
    userIds.add(a.reviewerId);
  }

  const teamIds = cycle.cycleTeams.map((ct) => ct.team.id);

  const [users, memberships] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: Array.from(userIds) } },
      select: { id: true, name: true },
    }),
    prisma.teamMember.findMany({
      where: { teamId: { in: teamIds } },
      select: { userId: true, teamId: true, role: true },
    }),
  ]);

  const nameMap = new Map(users.map((u) => [u.id, u.name]));

  // Build templateId -> team mapping
  const templateToTeams = new Map<string, { teamId: string; teamName: string }[]>();
  for (const ct of cycle.cycleTeams) {
    for (const ctt of ct.templates) {
      const arr = templateToTeams.get(ctt.template.id) ?? [];
      if (!arr.some((t) => t.teamId === ct.team.id)) {
        arr.push({ teamId: ct.team.id, teamName: ct.team.name });
      }
      templateToTeams.set(ctt.template.id, arr);
    }
  }

  // Disambiguation map (only built if needed)
  const needsDisambiguation = Array.from(templateToTeams.values()).some((t) => t.length > 1);
  let userTeamMap: Map<string, Set<string>> | null = null;
  if (needsDisambiguation) {
    userTeamMap = new Map<string, Set<string>>();
    for (const m of memberships) {
      const set = userTeamMap.get(m.userId) ?? new Set<string>();
      set.add(m.teamId);
      userTeamMap.set(m.userId, set);
    }
  }

  const impersonatorUserIds = new Set(
    memberships.filter((m) => m.role === "IMPERSONATOR").map((m) => m.userId)
  );

  const assignmentsWithNames = assignments.map((a) => {
    const teams = templateToTeams.get(a.templateId) ?? [];
    let team = teams[0] ?? { teamId: "", teamName: "Unknown" };
    if (teams.length > 1 && userTeamMap) {
      const subjectTeams = userTeamMap.get(a.subjectId);
      const match = teams.find((t) => subjectTeams?.has(t.teamId));
      if (match) team = match;
    }
    return {
      ...a,
      subjectName: nameMap.get(a.subjectId) ?? "Unknown",
      reviewerName: nameMap.get(a.reviewerId) ?? "Unknown",
      teamId: team.teamId,
      teamName: team.teamName,
      isImpersonator: impersonatorUserIds.has(a.reviewerId),
    };
  });

  return NextResponse.json({
    success: true,
    data: assignmentsWithNames,
  });
}
