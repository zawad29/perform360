import cuid from "cuid";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateToken } from "@/lib/tokens";
import { Direction } from "@prisma/client";
import { DIRECTION_KEYS, isValidDirection } from "@/lib/directions";
import { isCycleSubjectRole } from "@/lib/cycle-subjects";
import {
  resolveAssignmentForm,
  type SectionShape,
  type TemplateMeta,
} from "@/lib/template-routing";
export type { SectionShape, TemplateMeta };

type TxClient = Prisma.TransactionClient;

interface GeneratedAssignment {
  cycleId: string;
  templateId: string;
  subjectId: string;
  reviewerId: string;
  direction: Direction;
  token: string;
}

interface TeamMemberData {
  userId: string;
  role: "MANAGER" | "MEMBER" | "EXTERNAL" | "IMPERSONATOR";
  designationId: string | null;
  impersonatorDirections?: readonly Direction[] | readonly string[];
}

interface TeamWithMembers {
  id: string;
  members: TeamMemberData[];
}

export interface TeamTemplatesPair {
  teamId: string;
  templates: TemplateMeta[];
}

/**
 * Generate evaluation assignments from team structure for a cycle.
 *
 * Rules:
 *  - DOWNWARD: Manager → Member (one assignment per manager-member pair)
 *  - UPWARD:   Member → Manager
 *  - LATERAL:  Members ↔ Members; Managers ↔ Managers
 *  - SELF:     Each non-external/non-impersonator member reviews themselves
 *  - EXTERNAL: External users review all members and managers (one-way)
 *  - Impersonators take over the directions listed in their impersonatorDirections.
 *  - Deduplication across teams by (subjectId, reviewerId, templateId, direction).
 */
export function generateAssignmentsFromTeams(
  cycleId: string,
  teams: TeamWithMembers[],
  teamTemplatesMap: Map<string, TemplateMeta[]>
): GeneratedAssignment[] {
  const seen = new Set<string>();
  const assignments: GeneratedAssignment[] = [];

  function addAssignment(
    subjectId: string,
    reviewerId: string,
    direction: Direction,
    templateId: string
  ) {
    const key = `${subjectId}:${reviewerId}:${templateId}:${direction}`;
    if (seen.has(key)) return;
    seen.add(key);
    assignments.push({
      cycleId,
      templateId,
      subjectId,
      reviewerId,
      direction,
      token: generateToken(),
    });
  }

  // Track self-evaluations: (userId, templateId) pairs
  const selfEvalPairs = new Set<string>();

  for (const team of teams) {
    const templates = teamTemplatesMap.get(team.id) ?? [];
    if (templates.length === 0) continue;

    const managers = team.members.filter((m) => m.role === "MANAGER");
    const members = team.members.filter((m) => m.role === "MEMBER");
    const externals = team.members.filter((m) => m.role === "EXTERNAL");
    const impersonators = team.members.filter((m) => m.role === "IMPERSONATOR");

    // Directions handled by impersonators; SELF is never delegated.
    const handledDirections = new Set<Direction>();
    for (const imp of impersonators) {
      for (const dir of imp.impersonatorDirections ?? []) {
        if (!isValidDirection(dir) || dir === "SELF") continue;
        handledDirections.add(dir);
      }
    }

    const evaluableSubjects = [...managers, ...members];

    // ── Impersonator assignments ──
    for (const imp of impersonators) {
      for (const rawDirection of imp.impersonatorDirections ?? []) {
        if (!isValidDirection(rawDirection) || rawDirection === "SELF") continue;
        const direction = rawDirection;
        let subjects: typeof evaluableSubjects;
        switch (direction) {
          case "DOWNWARD":
            subjects = members;
            break;
          case "LATERAL":
            subjects = [...members, ...managers];
            break;
          case "UPWARD":
            subjects = managers;
            break;
          case "EXTERNAL":
          default:
            subjects = evaluableSubjects;
            break;
        }
        for (const subject of subjects) {
          const resolved = resolveAssignmentForm(templates, subject.designationId, direction);
          if (resolved) addAssignment(subject.userId, imp.userId, direction, resolved.templateId);
        }
      }
    }

    // ── Self-evaluations (non-external, non-impersonator) ──
    if (!handledDirections.has("SELF")) {
      for (const m of team.members) {
        if (m.role === "EXTERNAL" || m.role === "IMPERSONATOR") continue;
        const resolved = resolveAssignmentForm(templates, m.designationId, "SELF");
        if (resolved) selfEvalPairs.add(`${m.userId}:${resolved.templateId}`);
      }
    }

    // ── DOWNWARD: Manager evaluates each Member ──
    if (!handledDirections.has("DOWNWARD")) {
      for (const mgr of managers) {
        for (const member of members) {
          const resolved = resolveAssignmentForm(templates, member.designationId, "DOWNWARD");
          if (resolved) addAssignment(member.userId, mgr.userId, "DOWNWARD", resolved.templateId);
        }
      }
    }

    // ── UPWARD: Member evaluates each Manager ──
    if (!handledDirections.has("UPWARD")) {
      for (const member of members) {
        for (const mgr of managers) {
          const resolved = resolveAssignmentForm(templates, mgr.designationId, "UPWARD");
          if (resolved) addAssignment(mgr.userId, member.userId, "UPWARD", resolved.templateId);
        }
      }
    }

    // ── LATERAL: peer evaluations ──
    if (!handledDirections.has("LATERAL")) {
      for (const reviewer of members) {
        for (const subject of members) {
          if (reviewer.userId === subject.userId) continue;
          const resolved = resolveAssignmentForm(templates, subject.designationId, "LATERAL");
          if (resolved) addAssignment(subject.userId, reviewer.userId, "LATERAL", resolved.templateId);
        }
      }
      for (const reviewer of managers) {
        for (const subject of managers) {
          if (reviewer.userId === subject.userId) continue;
          const resolved = resolveAssignmentForm(templates, subject.designationId, "LATERAL");
          if (resolved) addAssignment(subject.userId, reviewer.userId, "LATERAL", resolved.templateId);
        }
      }
    }

    // ── EXTERNAL: external users review members and managers ──
    if (!handledDirections.has("EXTERNAL")) {
      for (const ext of externals) {
        for (const member of members) {
          const resolved = resolveAssignmentForm(templates, member.designationId, "EXTERNAL");
          if (resolved) addAssignment(member.userId, ext.userId, "EXTERNAL", resolved.templateId);
        }
        for (const mgr of managers) {
          const resolved = resolveAssignmentForm(templates, mgr.designationId, "EXTERNAL");
          if (resolved) addAssignment(mgr.userId, ext.userId, "EXTERNAL", resolved.templateId);
        }
      }
    }
  }

  selfEvalPairs.forEach((pair) => {
    const [userId, templateId] = pair.split(":");
    addAssignment(userId, userId, "SELF", templateId);
  });

  return assignments;
}

export interface CoverageGap {
  teamId: string;
  teamName: string;
  members: { userId: string; name: string; designationName: string | null }[];
}

export interface ValidatedTeamTemplates {
  pairs: TeamTemplatesPair[];
  templateMap: Map<string, TemplateMeta>;
  /** Empty when coverage is complete; non-empty payload should be returned to the client as a 400. */
  gaps: CoverageGap[];
}

/**
 * Validate that every team-member's designation is covered by at least one assigned
 * template (templates with empty designationIds satisfy any designation), and load the
 * template metadata needed to generate assignments.
 *
 * Used by both POST /api/cycles and PATCH /api/cycles/[id].
 *
 * Returns a discriminated result:
 *   - `{ ok: false, error, code? }` when teams/templates aren't found
 *   - `{ ok: true, data }` otherwise; if `data.gaps` is non-empty, the caller
 *     should return 400 COVERAGE_GAP without proceeding.
 */
export async function validateTeamTemplateCoverage(
  companyId: string,
  teamTemplates: { teamId: string; templateIds: string[] }[]
): Promise<
  | { ok: false; error: string; code: "NOT_FOUND" }
  | { ok: true; data: ValidatedTeamTemplates }
> {
  const teamIds = teamTemplates.map((tt) => tt.teamId);
  const allTemplateIds = Array.from(
    new Set(teamTemplates.flatMap((tt) => tt.templateIds))
  );

  const [teams, templates] = await Promise.all([
    prisma.team.findMany({
      where: { id: { in: teamIds }, companyId },
      include: {
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
    }),
    prisma.evaluationTemplate.findMany({
      where: {
        id: { in: allTemplateIds },
        OR: [{ companyId }, { isGlobal: true }],
        isArchived: false,
      },
      select: { id: true, designationIds: true, sections: true },
    }),
  ]);

  if (teams.length !== teamIds.length) {
    return { ok: false, error: "One or more teams not found", code: "NOT_FOUND" };
  }
  if (templates.length !== allTemplateIds.length) {
    return { ok: false, error: "One or more templates not found", code: "NOT_FOUND" };
  }

  const templateMap = new Map<string, TemplateMeta>(
    templates.map((t) => [
      t.id,
      {
        id: t.id,
        designationIds: t.designationIds,
        sections: t.sections as unknown as SectionShape[],
      },
    ])
  );
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  const gaps: CoverageGap[] = [];
  for (const tt of teamTemplates) {
    const team = teamMap.get(tt.teamId);
    if (!team) continue;
    const assigned = tt.templateIds
      .map((id) => templateMap.get(id))
      .filter((x): x is TemplateMeta => Boolean(x));

    const hasWildcard = assigned.some((t) => t.designationIds.length === 0);
    if (hasWildcard) continue;

    const coveredDesignations = new Set(assigned.flatMap((t) => t.designationIds));
    const missing: CoverageGap["members"] = [];
    for (const m of team.members) {
      if (!isCycleSubjectRole(m.role)) continue;
      if (m.designationId === null || !coveredDesignations.has(m.designationId)) {
        missing.push({
          userId: m.userId,
          name: m.user?.name ?? "Unknown",
          designationName: m.designation?.name ?? null,
        });
      }
    }
    if (missing.length > 0) {
      gaps.push({ teamId: team.id, teamName: team.name, members: missing });
    }
  }

  const pairs: TeamTemplatesPair[] = teamTemplates.map((tt) => ({
    teamId: tt.teamId,
    templates: tt.templateIds.map((id) => templateMap.get(id)!),
  }));

  return { ok: true, data: { pairs, templateMap, gaps } };
}

/**
 * Compute direction-coverage warnings: which directions had zero matching sections
 * across all templates assigned to a team. Soft signal — the cycle is still created.
 */
export function computeDirectionCoverageWarnings(
  teamTemplatesMap: Map<string, TemplateMeta[]>
): { teamId: string; missingDirections: Direction[] }[] {
  const warnings: { teamId: string; missingDirections: Direction[] }[] = [];
  for (const [teamId, templates] of teamTemplatesMap.entries()) {
    const missing: Direction[] = [];
    for (const direction of DIRECTION_KEYS) {
      const covered = templates.some((tpl) =>
        (tpl.sections ?? []).some((s: SectionShape) => {
          const dirs = s.directions ?? [];
          return dirs.length === 0 || dirs.includes(direction);
        })
      );
      if (!covered) missing.push(direction);
    }
    if (missing.length > 0) warnings.push({ teamId, missingDirections: missing });
  }
  return warnings;
}

/**
 * Create CycleTeam + CycleTeamTemplate rows for a cycle in a transaction.
 *
 * Pre-generates client-side cuids so both inserts can be batched into single
 * `createMany` calls (two round-trips total instead of 2N).
 */
export async function applyTeamTemplates(
  tx: TxClient,
  cycleId: string,
  teamTemplates: { teamId: string; templateIds: string[] }[]
): Promise<void> {
  const cycleTeams = teamTemplates.map((tt) => ({
    id: cuid(),
    cycleId,
    teamId: tt.teamId,
  }));

  const cycleTeamTemplates = teamTemplates.flatMap((tt, i) =>
    tt.templateIds.map((templateId) => ({
      cycleTeamId: cycleTeams[i].id,
      templateId,
    }))
  );

  await tx.cycleTeam.createMany({ data: cycleTeams });
  if (cycleTeamTemplates.length > 0) {
    await tx.cycleTeamTemplate.createMany({
      data: cycleTeamTemplates,
      skipDuplicates: true,
    });
  }
}

/**
 * Fetch teams + templates and persist the generated assignments in a transaction.
 */
export async function createAssignmentsForCycle(
  cycleId: string,
  companyId: string,
  teamTemplatesPairs: TeamTemplatesPair[]
): Promise<{ count: number; reviewerEmails: ReviewerInfo[] }> {
  const teamIds = teamTemplatesPairs.map((p) => p.teamId);

  const teams = await prisma.team.findMany({
    where: { id: { in: teamIds }, companyId },
    include: {
      members: {
        select: {
          userId: true,
          role: true,
          designationId: true,
          impersonatorDirections: true,
        },
      },
    },
  });

  if (teams.length === 0) {
    return { count: 0, reviewerEmails: [] };
  }

  const teamTemplatesMap = new Map<string, TemplateMeta[]>();
  for (const pair of teamTemplatesPairs) {
    teamTemplatesMap.set(pair.teamId, pair.templates);
  }

  const assignments = generateAssignmentsFromTeams(cycleId, teams, teamTemplatesMap);
  if (assignments.length === 0) return { count: 0, reviewerEmails: [] };

  const created = await prisma.evaluationAssignment.createMany({
    data: assignments,
    skipDuplicates: true,
  });

  const reviewerIds = Array.from(new Set(assignments.map((a) => a.reviewerId)));
  const users = await prisma.user.findMany({
    where: { id: { in: reviewerIds } },
    select: { id: true, email: true, name: true },
  });

  const userMap = new Map(users.map((u) => [u.id, u]));
  const reviewerInfoMap = new Map<string, ReviewerInfo>();

  for (const assignment of assignments) {
    const reviewer = userMap.get(assignment.reviewerId);
    if (!reviewer) continue;
    if (!reviewerInfoMap.has(reviewer.id)) {
      reviewerInfoMap.set(reviewer.id, {
        reviewerId: reviewer.id,
        email: reviewer.email,
        name: reviewer.name,
        assignments: [],
      });
    }
    const subjectUser = userMap.get(assignment.subjectId);
    reviewerInfoMap.get(reviewer.id)!.assignments.push({
      token: assignment.token,
      subjectName: subjectUser?.name ?? "Unknown",
      direction: assignment.direction,
    });
  }

  return {
    count: created.count,
    reviewerEmails: Array.from(reviewerInfoMap.values()),
  };
}

export interface ReviewerInfo {
  reviewerId: string;
  email: string;
  name: string;
  assignments: {
    token: string;
    subjectName: string;
    direction: Direction;
  }[];
}
