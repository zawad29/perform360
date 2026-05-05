// Pure routing helpers — browser-safe. Imported by both server-side
// assignment generation (lib/assignments.ts) and client-side routing UI.

import type { Direction } from "@/lib/directions";

export interface SectionShape {
  id: string;
  title: string;
  description?: string;
  directions?: Direction[];
  questions: unknown[];
}

export interface TemplateMeta {
  id: string;
  levelIds: string[];
  sections: SectionShape[];
}

export interface ResolvedTemplate {
  template: TemplateMeta;
  // All other templates that tied for specificity. Empty when only one matched.
  // Lets the UI surface "tied with X — picked first by attachment order".
  tiedWith: TemplateMeta[];
}

/**
 * Pick the template that should score a subject given their level.
 * Tiebreak: specific (non-empty `levelIds`) beats wildcard (empty `levelIds`).
 * Returns null when no template covers the subject's level.
 */
export function resolveTemplateForSubject(
  teamTemplates: TemplateMeta[],
  subjectLevelId: string | null
): ResolvedTemplate | null {
  const levelMatches = teamTemplates.filter(
    (t) =>
      t.levelIds.length === 0 ||
      (subjectLevelId !== null && t.levelIds.includes(subjectLevelId))
  );
  if (levelMatches.length === 0) return null;

  const specific = levelMatches.filter((t) => t.levelIds.length > 0);
  const candidates = specific.length > 0 ? specific : levelMatches;

  return {
    template: candidates[0],
    tiedWith: candidates.slice(1),
  };
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

/**
 * Compose: pick the template by level, then verify at least one section
 * renders for this direction. Used by assignment generation — returns null
 * to skip an assignment that has no rendered content.
 */
export function resolveAssignmentForm(
  teamTemplates: TemplateMeta[],
  subjectLevelId: string | null,
  direction: Direction
): { templateId: string } | null {
  const resolved = resolveTemplateForSubject(teamTemplates, subjectLevelId);
  if (!resolved) return null;

  // Walk the candidate set: prefer the first that has a matching section.
  const candidates = [resolved.template, ...resolved.tiedWith];
  for (const tpl of candidates) {
    const matching = filterSectionsForDirection(tpl.sections ?? [], direction);
    if (matching.length > 0) return { templateId: tpl.id };
  }
  return null;
}
