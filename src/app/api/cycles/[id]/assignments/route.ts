import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { validateCuidParam } from "@/lib/validation";

interface AssignmentRow {
  id: string;
  token: string;
  templateId: string;
  subjectId: string;
  reviewerId: string;
  direction: string;
  status: "SUBMITTED" | "IN_PROGRESS" | "PENDING";
  subjectName: string;
  reviewerName: string;
  teamId: string;
  teamName: string;
  isImpersonator: boolean;
}

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
      token: true,
      templateId: true,
      subjectId: true,
      reviewerId: true,
      direction: true,
      status: true,
    },
  });

  // Batch-fetch user names, team memberships, and reviewer links in parallel
  const userIds = new Set<string>();
  for (const a of assignments) {
    userIds.add(a.subjectId);
    userIds.add(a.reviewerId);
  }

  const teamIds = cycle.cycleTeams.map((ct) => ct.team.id);

  const [users, memberships, reviewerLinks, subjectTemplates] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: Array.from(userIds) } },
      select: { id: true, name: true },
    }),
    prisma.teamMember.findMany({
      where: { teamId: { in: teamIds } },
      select: { userId: true, teamId: true, role: true },
    }),
    prisma.cycleReviewerLink.findMany({
      where: { cycleId },
      select: { reviewerId: true, token: true },
    }),
    prisma.cycleSubjectTemplate.findMany({
      where: { cycleId },
      select: { subjectId: true, teamId: true, templateId: true },
    }),
  ]);

  const reviewerLinkMap = new Map(reviewerLinks.map((rl) => [rl.reviewerId, rl.token]));

  const nameMap = new Map(users.map((u) => [u.id, u.name]));

  const teamNameById = new Map(cycle.cycleTeams.map((ct) => [ct.team.id, ct.team.name]));

  // Authoritative (subject, template) -> teamId from the cycle's template mapping.
  // Needed because a manually-assigned template isn't attached to the team, so it
  // can't be resolved via templateToTeams below.
  const subjectTemplateTeam = new Map<string, string>();
  for (const r of subjectTemplates) {
    if (!r.templateId) continue;
    const key = `${r.subjectId}:${r.templateId}`;
    if (!subjectTemplateTeam.has(key)) subjectTemplateTeam.set(key, r.teamId);
  }

  // Build templateId -> team mapping (fallback for legacy cycles w/o mapping rows).
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

  const assignmentsWithNames: AssignmentRow[] = assignments.map((a) => {
    // Prefer the authoritative (subject, template) -> team from the mapping. This
    // is the only way to place a manually-assigned template (not attached to the
    // team) — otherwise it falls through to "Unknown".
    // TODO: team is inferred from (subjectId, templateId) because assignments
    // don't store a teamId. This is ambiguous when a subject has the SAME template
    // in multiple teams. Proper fix: persist teamId on EvaluationAssignment at
    // generation time (schema + generateAssignmentsFromTeams change).
    let team: { teamId: string; teamName: string };
    const mappedTeamId = subjectTemplateTeam.get(`${a.subjectId}:${a.templateId}`);
    if (mappedTeamId) {
      team = { teamId: mappedTeamId, teamName: teamNameById.get(mappedTeamId) ?? "Unknown" };
    } else {
      const teams = templateToTeams.get(a.templateId) ?? [];
      team = teams[0] ?? { teamId: "", teamName: "Unknown" };
      if (teams.length > 1 && userTeamMap) {
        const subjectTeams = userTeamMap.get(a.subjectId);
        const match = teams.find((t) => subjectTeams?.has(t.teamId));
        if (match) team = match;
      }
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

  assignmentsWithNames.sort((a, b) => {
    const team = a.teamName.localeCompare(b.teamName, undefined, { sensitivity: "base" });
    if (team !== 0) return team;
    const reviewer = a.reviewerName.localeCompare(b.reviewerName, undefined, { sensitivity: "base" });
    if (reviewer !== 0) return reviewer;
    const subject = a.subjectName.localeCompare(b.subjectName, undefined, { sensitivity: "base" });
    if (subject !== 0) return subject;
    return a.direction.localeCompare(b.direction, undefined, { sensitivity: "base" });
  });

  const groupedByTeam = new Map<
    string,
    {
      teamId: string;
      teamName: string;
      reviewers: Map<
        string,
        {
          reviewerId: string;
          reviewerName: string;
          isImpersonator: boolean;
          reviewerLinkToken: string | null;
          assignments: AssignmentRow[];
        }
      >;
    }
  >();

  for (const assignment of assignmentsWithNames) {
    let teamGroup = groupedByTeam.get(assignment.teamId);
    if (!teamGroup) {
      teamGroup = {
        teamId: assignment.teamId,
        teamName: assignment.teamName,
        reviewers: new Map(),
      };
      groupedByTeam.set(assignment.teamId, teamGroup);
    }

    const existingReviewer = teamGroup.reviewers.get(assignment.reviewerId);
    if (existingReviewer) {
      existingReviewer.assignments.push(assignment);
      continue;
    }

    teamGroup.reviewers.set(assignment.reviewerId, {
      reviewerId: assignment.reviewerId,
      reviewerName: assignment.reviewerName,
      isImpersonator: assignment.isImpersonator,
      reviewerLinkToken: reviewerLinkMap.get(assignment.reviewerId) ?? null,
      assignments: [assignment],
    });
  }

  return NextResponse.json({
    success: true,
    data: Array.from(groupedByTeam.values()).map((team) => ({
      teamId: team.teamId,
      teamName: team.teamName,
      reviewers: Array.from(team.reviewers.values()),
    })),
  });
}
