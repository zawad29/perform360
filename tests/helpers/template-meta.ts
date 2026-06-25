import type { Direction } from "@prisma/client";

interface TemplateMeta {
  id: string;
  designationIds: string[];
  sections: { id: string; title: string; directions: Direction[]; questions: unknown[] }[];
}

/** Build the new TemplateMeta[] map from a simple { teamId: templateId } shape. */
export function buildTemplatesMap(
  map: Record<string, string | null>
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
        designationIds: [],
        sections: [
          { id: `${tplId}-s1`, title: "All", directions: [], questions: [] },
        ],
      },
    ]);
  }
  return out;
}
