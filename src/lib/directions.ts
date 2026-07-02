import { Direction, WeightPreset } from "@prisma/client";

export { Direction, WeightPreset };

export interface DirectionMeta {
  key: Direction;
  label: string;
  glyph: string;
  description: string;
}

export type SubjectRole = "MANAGER" | "MEMBER";
export type TemplatePreviewAudience = SubjectRole | "EXTERNAL_REVIEWER";

export const DIRECTIONS: readonly DirectionMeta[] = [
  {
    key: "DOWNWARD",
    label: "Downward",
    glyph: "↓",
    description: "Manager → Member",
  },
  {
    key: "UPWARD",
    label: "Upward",
    glyph: "↑",
    description: "Member → Manager",
  },
  {
    key: "LATERAL",
    label: "Lateral",
    glyph: "↔",
    description: "Member → Member",
  },
  {
    key: "SELF",
    label: "Self",
    glyph: "↻",
    description: "Self-assessment",
  },
  {
    key: "EXTERNAL",
    label: "External",
    glyph: "→",
    description: "External → Everyone",
  },
] as const;

export const DIRECTION_KEYS: readonly Direction[] = DIRECTIONS.map((d) => d.key);

export const DIRECTION_LABELS: Record<Direction, string> = Object.fromEntries(
  DIRECTIONS.map((d) => [d.key, d.label])
) as Record<Direction, string>;

export const DIRECTION_GLYPHS: Record<Direction, string> = Object.fromEntries(
  DIRECTIONS.map((d) => [d.key, d.glyph])
) as Record<Direction, string>;

export const SUBJECT_DIRECTIONS: Record<SubjectRole, readonly Direction[]> = {
  MEMBER: ["DOWNWARD", "LATERAL", "SELF", "EXTERNAL"],
  MANAGER: ["UPWARD", "LATERAL", "SELF", "EXTERNAL"],
};

export function getDirectionsForSubjectRole(role: SubjectRole): readonly Direction[] {
  return SUBJECT_DIRECTIONS[role];
}

export function getDirectionMetaForSubjectRole(
  role: SubjectRole,
  availableDirections?: readonly Direction[]
): DirectionMeta[] {
  const allowed = new Set(getDirectionsForSubjectRole(role));
  return DIRECTIONS.filter(
    (direction) =>
      allowed.has(direction.key) &&
      (!availableDirections || availableDirections.includes(direction.key))
  );
}

export function getDirectionMetaForTemplatePreview(
  audience: TemplatePreviewAudience
): DirectionMeta[] {
  if (audience === "EXTERNAL_REVIEWER") {
    return DIRECTIONS.filter((direction) => direction.key === "EXTERNAL");
  }
  return getDirectionMetaForSubjectRole(audience);
}

// Monochrome palette used by report charts (score, trend, comparison).
// Single source of truth so palette changes don't drift across charts.
export const DIRECTION_REPORT_COLORS: Record<Direction, string> = {
  DOWNWARD: "#111111",
  UPWARD: "#888888",
  LATERAL: "#DDDDDD",
  SELF: "#888888",
  EXTERNAL: "#111111",
};

export interface DirectionWeights {
  downward: number;
  upward: number;
  lateral: number;
  self: number;
  external: number;
}

export interface DirectionScores {
  downward: number | null;
  upward: number | null;
  lateral: number | null;
  self: number | null;
  external: number | null;
}

export const WEIGHT_FIELD_BY_DIRECTION: Record<Direction, keyof DirectionWeights> = {
  DOWNWARD: "downward",
  UPWARD: "upward",
  LATERAL: "lateral",
  SELF: "self",
  EXTERNAL: "external",
};

export const WEIGHT_PRESETS: Record<
  WeightPreset,
  { label: string; description: string; member: DirectionWeights; manager: DirectionWeights }
> = {
  equal: {
    label: "Equal",
    description: "All directions weighted equally",
    member: { downward: 25, lateral: 25, upward: 0, self: 25, external: 25 },
    manager: { downward: 0, lateral: 25, upward: 35, self: 25, external: 15 },
  },
  supervisor_focus: {
    label: "Supervisor Focus",
    description: "Emphasizes downward / upward feedback",
    member: { downward: 45, lateral: 25, upward: 0, self: 15, external: 15 },
    manager: { downward: 0, lateral: 20, upward: 45, self: 20, external: 15 },
  },
  peer_focus: {
    label: "Peer Focus",
    description: "Emphasizes lateral peer feedback",
    member: { downward: 15, lateral: 45, upward: 0, self: 20, external: 20 },
    manager: { downward: 0, lateral: 45, upward: 25, self: 15, external: 15 },
  },
  custom: {
    label: "Custom",
    description: "Define your own weights",
    member: { downward: 35, lateral: 30, upward: 0, self: 15, external: 20 },
    manager: { downward: 0, lateral: 30, upward: 35, self: 20, external: 15 },
  },
  default: {
    label: "Default",
    description: "Team lead weighted, with self, peer & stakeholder input",
    member: { downward: 50, lateral: 20, upward: 0, self: 10, external: 20 },
    manager: { downward: 0, lateral: 20, upward: 50, self: 10, external: 20 },
  },
};

export function getWeightSum(weights: DirectionWeights): number {
  return weights.downward + weights.lateral + weights.upward + weights.self + weights.external;
}

export function isValidDirection(value: unknown): value is Direction {
  return typeof value === "string" && (DIRECTION_KEYS as readonly string[]).includes(value);
}

export function emptyDirectionScores(): DirectionScores {
  return { downward: null, upward: null, lateral: null, self: null, external: null };
}

export function emptyDirectionGroups(): Record<Direction, number[]> {
  return { DOWNWARD: [], UPWARD: [], LATERAL: [], SELF: [], EXTERNAL: [] };
}

export function emptyDirectionCounts(): Record<Direction, number> {
  return { DOWNWARD: 0, UPWARD: 0, LATERAL: 0, SELF: 0, EXTERNAL: 0 };
}

export function emptyDirectionWeights(): DirectionWeights {
  return { downward: 0, upward: 0, lateral: 0, self: 0, external: 0 };
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function roundedMean(values: number[]): number | null {
  const m = mean(values);
  return m === null ? null : parseFloat(m.toFixed(2));
}
