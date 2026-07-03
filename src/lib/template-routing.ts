// Pure routing helpers — browser-safe. Imported by both server-side
// assignment generation (lib/assignments.ts) and client-side routing UI.

import type { Direction } from "@/lib/directions";
import { isCycleSubjectRole } from "@/lib/cycle-subjects";

export interface SectionShape {
  id: string;
  title: string;
  description?: string;
  directions?: Direction[];
  questions: unknown[];
}

// Which team-role a template serves. Mirrors the Prisma `TemplateRole` enum.
export type TemplateApplicableRole = "MANAGER" | "MEMBER" | "ANY";

// The team-role of the subject being routed. Externals/impersonators are never
// subjects, so the only routable roles are MANAGER and MEMBER.
export type SubjectRole = "MANAGER" | "MEMBER";

export interface TemplateMeta {
  id: string;
  designationIds: string[];
  appliesToRole: TemplateApplicableRole;
  sections: SectionShape[];
}

export interface ResolvedTemplate {
  template: TemplateMeta;
  // All other templates that tied for specificity. Empty when only one matched.
  // Lets the UI surface "tied with X — picked first by attachment order".
  tiedWith: TemplateMeta[];
}

/** Keep templates whose designation set covers the subject (or is a wildcard). */
function designationCovers(t: TemplateMeta, subjectDesignationId: string | null): boolean {
  return (
    t.designationIds.length === 0 ||
    (subjectDesignationId !== null && t.designationIds.includes(subjectDesignationId))
  );
}

/**
 * Pick the template that should score a subject given their team-role and designation.
 *
 * Routing prefers, in order, the first tier that yields a designation match:
 *  1. Role-matching templates whose `appliesToRole` equals the subject's role AND cover the
 *     subject's designation. (Role wins: a working-lead MANAGER whose designation appears on
 *     a manager template gets that manager template, not the member one.)
 *  2. Role-agnostic (`ANY`) templates that cover the designation — the fallback when no
 *     role-specific template covers the subject (e.g. corporate managers under a single
 *     all-roles template).
 * When `subjectRole` is omitted, every template is eligible (pre-feature, role-agnostic
 * behavior). Within the chosen tier, specific (non-empty `designationIds`) beats wildcard.
 *
 * Returns null when no template covers the subject.
 */
export function resolveTemplateForSubject(
  teamTemplates: TemplateMeta[],
  subjectDesignationId: string | null,
  subjectRole?: SubjectRole
): ResolvedTemplate | null {
  const pickFrom = (pool: TemplateMeta[]): ResolvedTemplate | null => {
    const matches = pool.filter((t) => designationCovers(t, subjectDesignationId));
    if (matches.length === 0) return null;
    const specific = matches.filter((t) => t.designationIds.length > 0);
    const candidates = specific.length > 0 ? specific : matches;
    return { template: candidates[0], tiedWith: candidates.slice(1) };
  };

  if (!subjectRole) return pickFrom(teamTemplates);

  // Tier 1: role-matching templates. Tier 2 (fallback): role-agnostic ANY templates.
  return (
    pickFrom(teamTemplates.filter((t) => t.appliesToRole === subjectRole)) ??
    pickFrom(teamTemplates.filter((t) => t.appliesToRole === "ANY"))
  );
}

/**
 * Filter sections to those that should render for a given assignment direction.
 * Empty/missing `directions` on a section = applies to all directions.
 */
export function filterSectionsForDirection<T extends { directions?: Direction[] }>(
  sections: T[],
  direction: Direction
): T[] {
  return sections.filter((s) => {
    const dirs = s.directions ?? [];
    return dirs.length === 0 || dirs.includes(direction);
  });
}

// ─── Coverage gaps ───
// Shared detection of subjects who have no matching template. Used by the
// create/edit wizard preview, the server GET /api/cycles/[id] response, and
// server-side validation — all resolve coverage with the same rule so the
// client preview and server truth never diverge.

export interface CoverageGapMemberInput {
  userId: string;
  name: string;
  role: string;
  designationId: string | null;
  designationName: string | null;
}

export interface CoverageGapTemplateInput {
  id: string;
  designationIds: string[];
  appliesToRole: TemplateApplicableRole;
}

export interface CoverageGapTeamInput {
  teamId: string;
  teamName: string;
  members: CoverageGapMemberInput[];
  templates: CoverageGapTemplateInput[];
}

export interface CoverageGap {
  teamId: string;
  teamName: string;
  members: { userId: string; name: string; designationName: string | null }[];
}

/**
 * For each team, collect the cycle subjects (MANAGER/MEMBER) that no assigned
 * template covers for BOTH their role and designation. Teams fully covered are
 * omitted. Pure — safe on both client and server.
 */
export function computeCoverageGaps(teams: CoverageGapTeamInput[]): CoverageGap[] {
  const gaps: CoverageGap[] = [];
  for (const team of teams) {
    if (team.templates.length === 0) continue;
    const metas: TemplateMeta[] = team.templates.map((t) => ({
      id: t.id,
      designationIds: t.designationIds,
      appliesToRole: t.appliesToRole,
      sections: [],
    }));

    const missing = team.members
      .filter((m) => isCycleSubjectRole(m.role))
      .filter((m) => !resolveTemplateForSubject(metas, m.designationId, m.role as SubjectRole))
      .map((m) => ({
        userId: m.userId,
        name: m.name,
        designationName: m.designationName,
      }));

    if (missing.length > 0) {
      gaps.push({ teamId: team.teamId, teamName: team.teamName, members: missing });
    }
  }
  return gaps;
}

/**
 * Compose: pick the template by designation, then verify at least one section
 * renders for this direction. Used by assignment generation — returns null
 * to skip an assignment that has no rendered content.
 */
export function resolveAssignmentForm(
  teamTemplates: TemplateMeta[],
  subjectDesignationId: string | null,
  direction: Direction,
  subjectRole?: SubjectRole
): { templateId: string } | null {
  const resolved = resolveTemplateForSubject(teamTemplates, subjectDesignationId, subjectRole);
  if (!resolved) return null;

  // Walk the candidate set: prefer the first that has a matching section.
  const candidates = [resolved.template, ...resolved.tiedWith];
  for (const tpl of candidates) {
    const matching = filterSectionsForDirection(tpl.sections ?? [], direction);
    if (matching.length > 0) return { templateId: tpl.id };
  }
  return null;
}
