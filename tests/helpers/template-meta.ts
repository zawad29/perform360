import type { TemplateMeta, TemplateApplicableRole } from "@/lib/template-routing";

/**
 * Build the TemplateMeta[] map from a simple { teamId: templateId } shape.
 * Templates default to designation-wildcard + role-agnostic (ANY) so existing
 * tests behave as before. Pass `roles`/`designationIds` to exercise role routing.
 */
export function buildTemplatesMap(
  map: Record<string, string | null>,
  opts?: {
    roles?: Record<string, TemplateApplicableRole>;
    designationIds?: Record<string, string[]>;
  }
): Map<string, TemplateMeta[]> {
  const out = new Map<string, TemplateMeta[]>();
  for (const [teamId, tplId] of Object.entries(map)) {
    if (tplId == null) {
      out.set(teamId, []);
      continue;
    }
    out.set(teamId, [
      {
        id: tplId,
        designationIds: opts?.designationIds?.[tplId] ?? [],
        appliesToRole: opts?.roles?.[tplId] ?? "ANY",
        sections: [
          { id: `${tplId}-s1`, title: "All", directions: [], questions: [] },
        ],
      },
    ]);
  }
  return out;
}

/** Build a single TemplateMeta[] list for one team (multiple templates). */
export function buildTemplateList(
  templates: Array<{
    id: string;
    designationIds?: string[];
    appliesToRole?: TemplateApplicableRole;
  }>
): TemplateMeta[] {
  return templates.map((t) => ({
    id: t.id,
    designationIds: t.designationIds ?? [],
    appliesToRole: t.appliesToRole ?? "ANY",
    sections: [{ id: `${t.id}-s1`, title: "All", directions: [], questions: [] }],
  }));
}
