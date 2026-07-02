import cuid from "cuid";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateToken } from "@/lib/tokens";
import { Direction } from "@prisma/client";
import { DIRECTION_KEYS, isValidDirection } from "@/lib/directions";
import { isCycleSubjectRole } from "@/lib/cycle-subjects";
import {
  computeCoverageGaps,
  filterSectionsForDirection,
  resolveAssignmentForm,
  resolveTemplateForSubject,
  type CoverageGap,
  type SectionShape,
  type SubjectRole,
  type TemplateMeta,
} from "@/lib/template-routing";
export type { CoverageGap, SectionShape, TemplateMeta };

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
 *
 * When `subjectTemplateMap` (keyed `"subjectId:teamId"`) is supplied it is the
 * authoritative source of each subject's form — the cycle's mapping table. A
 * missing/null entry means that subject has no form in that team, so no reviews
 * are generated for them there. Section→direction filtering still applies. When
 * omitted, forms are resolved live from team designation routing (legacy path,
 * kept for existing tests).
 */
export function generateAssignmentsFromTeams(
  cycleId: string,
  teams: TeamWithMembers[],
  teamTemplatesMap: Map<string, TemplateMeta[]>,
  subjectTemplateMap?: Map<string, TemplateMeta | null>
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
    // With a mapping, a team may have members but no attached templates (all
    // forms set manually), so only skip on the legacy routing path.
    if (!subjectTemplateMap && templates.length === 0) continue;

    // Resolve a subject's form for a direction. Mapping wins when present
    // (missing/empty entry ⇒ no review); otherwise fall back to live routing.
    const formFor = (
      userId: string,
      designationId: string | null,
      role: SubjectRole,
      direction: Direction
    ): string | null => {
      if (subjectTemplateMap) {
        const meta = subjectTemplateMap.get(`${userId}:${team.id}`) ?? null;
        if (!meta) return null;
        return filterSectionsForDirection(meta.sections ?? [], direction).length > 0
          ? meta.id
          : null;
      }
      const resolved = resolveAssignmentForm(templates, designationId, direction, role);
      return resolved?.templateId ?? null;
    };

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
          // Impersonator subjects are drawn from members/managers, so role is
          // always a cycle-subject role.
          const tid = formFor(subject.userId, subject.designationId, subject.role as SubjectRole, direction);
          if (tid) addAssignment(subject.userId, imp.userId, direction, tid);
        }
      }
    }

    // ── Self-evaluations (non-external, non-impersonator) ──
    if (!handledDirections.has("SELF")) {
      for (const m of team.members) {
        if (m.role === "EXTERNAL" || m.role === "IMPERSONATOR") continue;
        const tid = formFor(m.userId, m.designationId, m.role as SubjectRole, "SELF");
        if (tid) selfEvalPairs.add(`${m.userId}:${tid}`);
      }
    }

    // ── DOWNWARD: Manager evaluates each Member ──
    if (!handledDirections.has("DOWNWARD")) {
      for (const mgr of managers) {
        for (const member of members) {
          const tid = formFor(member.userId, member.designationId, "MEMBER", "DOWNWARD");
          if (tid) addAssignment(member.userId, mgr.userId, "DOWNWARD", tid);
        }
      }
    }

    // ── UPWARD: Member evaluates each Manager ──
    if (!handledDirections.has("UPWARD")) {
      for (const member of members) {
        for (const mgr of managers) {
          const tid = formFor(mgr.userId, mgr.designationId, "MANAGER", "UPWARD");
          if (tid) addAssignment(mgr.userId, member.userId, "UPWARD", tid);
        }
      }
    }

    // ── LATERAL: peer evaluations ──
    if (!handledDirections.has("LATERAL")) {
      for (const reviewer of members) {
        for (const subject of members) {
          if (reviewer.userId === subject.userId) continue;
          const tid = formFor(subject.userId, subject.designationId, "MEMBER", "LATERAL");
          if (tid) addAssignment(subject.userId, reviewer.userId, "LATERAL", tid);
        }
      }
      for (const reviewer of managers) {
        for (const subject of managers) {
          if (reviewer.userId === subject.userId) continue;
          const tid = formFor(subject.userId, subject.designationId, "MANAGER", "LATERAL");
          if (tid) addAssignment(subject.userId, reviewer.userId, "LATERAL", tid);
        }
      }
    }

    // ── EXTERNAL: external users review members and managers ──
    if (!handledDirections.has("EXTERNAL")) {
      for (const ext of externals) {
        for (const member of members) {
          const tid = formFor(member.userId, member.designationId, "MEMBER", "EXTERNAL");
          if (tid) addAssignment(member.userId, ext.userId, "EXTERNAL", tid);
        }
        for (const mgr of managers) {
          const tid = formFor(mgr.userId, mgr.designationId, "MANAGER", "EXTERNAL");
          if (tid) addAssignment(mgr.userId, ext.userId, "EXTERNAL", tid);
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
 *   - `{ ok: true, data }` otherwise. `data.gaps` lists uncovered subjects — a
 *     soft warning (surfaced on the cycle detail page), not a blocker.
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
      select: { id: true, designationIds: true, appliesToRole: true, sections: true },
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
        appliesToRole: t.appliesToRole,
        sections: t.sections as unknown as SectionShape[],
      },
    ])
  );
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  // A subject is covered only if a template matches BOTH their team-role and
  // designation. (A wildcard MEMBER template doesn't cover a MANAGER, so the
  // old "any wildcard → fully covered" short-circuit no longer applies.)
  // Shared with the wizard preview + detail page via computeCoverageGaps.
  const gaps: CoverageGap[] = computeCoverageGaps(
    teamTemplates
      .map((tt) => {
        const team = teamMap.get(tt.teamId);
        if (!team) return null;
        const assigned = tt.templateIds
          .map((id) => templateMap.get(id))
          .filter((x): x is TemplateMeta => Boolean(x));
        return {
          teamId: team.id,
          teamName: team.name,
          members: team.members.map((m) => ({
            userId: m.userId,
            name: m.user?.name ?? "Unknown",
            role: m.role,
            designationId: m.designationId,
            designationName: m.designation?.name ?? null,
          })),
          templates: assigned.map((t) => ({
            id: t.id,
            designationIds: t.designationIds,
            appliesToRole: t.appliesToRole,
          })),
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
  );

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

/** Load a cycle's teams (with members) from its CycleTeam rows. */
async function loadCycleTeams(cycleId: string, companyId: string): Promise<TeamWithMembers[]> {
  const cycleTeams = await prisma.cycleTeam.findMany({
    where: { cycleId },
    select: {
      team: {
        select: {
          id: true,
          companyId: true,
          members: {
            select: {
              userId: true,
              role: true,
              designationId: true,
              impersonatorDirections: true,
            },
          },
        },
      },
    },
  });
  return cycleTeams
    .map((ct) => ct.team)
    .filter((t) => t.companyId === companyId)
    .map((t) => ({ id: t.id, members: t.members }));
}

/**
 * Build the `"subjectId:teamId" → TemplateMeta | null` map from a cycle's
 * CycleSubjectTemplate rows, loading the referenced templates' metadata (which
 * may be company/global templates not attached to any team).
 */
async function loadSubjectTemplateMap(
  cycleId: string
): Promise<Map<string, TemplateMeta | null>> {
  const rows = await prisma.cycleSubjectTemplate.findMany({
    where: { cycleId },
    select: { subjectId: true, teamId: true, templateId: true },
  });
  const templateIds = Array.from(
    new Set(rows.map((r) => r.templateId).filter((id): id is string => Boolean(id)))
  );
  const templates = templateIds.length
    ? await prisma.evaluationTemplate.findMany({
        where: { id: { in: templateIds } },
        select: { id: true, designationIds: true, appliesToRole: true, sections: true },
      })
    : [];
  const metaById = new Map<string, TemplateMeta>(
    templates.map((t) => [
      t.id,
      {
        id: t.id,
        designationIds: t.designationIds,
        appliesToRole: t.appliesToRole,
        sections: t.sections as unknown as SectionShape[],
      },
    ])
  );
  const map = new Map<string, TemplateMeta | null>();
  for (const r of rows) {
    map.set(`${r.subjectId}:${r.teamId}`, r.templateId ? metaById.get(r.templateId) ?? null : null);
  }
  return map;
}

/**
 * Regenerate a cycle's assignments from its subject-template mapping: wipe the
 * existing assignments and recreate them. Reused by Edit Setup and the Templates
 * tab. DRAFT-only callers must enforce that guard.
 */
export async function regenerateCycleAssignments(
  cycleId: string,
  companyId: string
): Promise<{ count: number; reviewerEmails: ReviewerInfo[] }> {
  await prisma.evaluationAssignment.deleteMany({ where: { cycleId } });
  return createAssignmentsForCycle(cycleId, companyId);
}

/**
 * Generate + persist a cycle's assignments from its subject-template mapping.
 * The mapping must already be synced (see `syncSubjectTemplateMap`).
 */
export async function createAssignmentsForCycle(
  cycleId: string,
  companyId: string
): Promise<{ count: number; reviewerEmails: ReviewerInfo[] }> {
  const teams = await loadCycleTeams(cycleId, companyId);
  if (teams.length === 0) {
    return { count: 0, reviewerEmails: [] };
  }

  const subjectTemplateMap = await loadSubjectTemplateMap(cycleId);

  const assignments = generateAssignmentsFromTeams(
    cycleId,
    teams,
    new Map(),
    subjectTemplateMap
  );
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

/**
 * Fill/refresh a cycle's CycleSubjectTemplate rows from team routing. For each
 * (subject, team) in the cycle, upsert an AUTO row with the routed template (or
 * null when nothing matches). MANUAL rows are preserved; rows for (subject, team)
 * pairs no longer in the cycle are removed. Runs after applyTeamTemplates and
 * before any assignment (re)generation.
 */
export async function syncSubjectTemplateMap(
  cycleId: string,
  companyId: string,
  teamTemplatesMap: Map<string, TemplateMeta[]>
): Promise<void> {
  const teams = await loadCycleTeams(cycleId, companyId);
  const existing = await prisma.cycleSubjectTemplate.findMany({ where: { cycleId } });
  const existingByKey = new Map(existing.map((r) => [`${r.subjectId}:${r.teamId}`, r]));
  const validKeys = new Set<string>();

  for (const team of teams) {
    const templates = teamTemplatesMap.get(team.id) ?? [];
    for (const m of team.members) {
      if (!isCycleSubjectRole(m.role)) continue;
      const key = `${m.userId}:${team.id}`;
      validKeys.add(key);
      const row = existingByKey.get(key);
      if (row?.source === "MANUAL") continue; // admin choice wins
      const resolved = resolveTemplateForSubject(templates, m.designationId, m.role);
      const templateId = resolved?.template.id ?? null;
      if (!row) {
        await prisma.cycleSubjectTemplate.create({
          data: { cycleId, teamId: team.id, subjectId: m.userId, templateId, source: "AUTO" },
        });
      } else if (row.templateId !== templateId) {
        await prisma.cycleSubjectTemplate.update({
          where: { id: row.id },
          data: { templateId },
        });
      }
    }
  }

  const staleIds = existing
    .filter((r) => !validKeys.has(`${r.subjectId}:${r.teamId}`))
    .map((r) => r.id);
  if (staleIds.length) {
    await prisma.cycleSubjectTemplate.deleteMany({ where: { id: { in: staleIds } } });
  }
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
