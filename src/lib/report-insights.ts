import type { DirectionScores, DirectionQuestionCounts, QuestionDetail, CategoryScore } from "@/types/report";

// ─── Variance ───

export function computeVariance(
  distribution: Record<string, number>
): number {
  const entries = Object.entries(distribution).map(
    ([k, v]) => [Number(k), v] as const
  );
  const total = entries.reduce((sum, [, c]) => sum + c, 0);
  if (total <= 1) return 0;
  const mean =
    entries.reduce((sum, [val, c]) => sum + val * c, 0) / total;
  return (
    entries.reduce((sum, [val, c]) => sum + c * (val - mean) ** 2, 0) / total
  );
}

// ─── Key Insights ───

export interface InsightTileData {
  label: string;
  value: string;
  description: string;
  color: string;
  iconName: "minus" | "trending-up" | "trending-down" | "message-circle" | "users" | "star" | "target";
  // Optional disclosure line shown beneath the description, e.g. "based on 12
  // questions across 4 reviewers". Used to defuse direction-asymmetry confusion
  // when section direction tags filter the question pool unevenly.
  footnote?: string;
}

export function deriveSelfOtherGap(
  scores: DirectionScores,
  questionCounts?: DirectionQuestionCounts
): InsightTileData | null {
  const selfScore = scores.self;
  const otherScores = (
    [scores.downward, scores.lateral, scores.upward, scores.external] as (
      | number
      | null
    )[]
  ).filter((s): s is number => s !== null && s > 0);

  if (selfScore === null || selfScore <= 0 || otherScores.length === 0) {
    return null;
  }

  const othersAvg = otherScores.reduce((a, b) => a + b, 0) / otherScores.length;
  const gap = selfScore - othersAvg;
  const absGap = Math.abs(gap);

  let color: string;
  let description: string;
  let iconName: InsightTileData["iconName"];

  if (absGap < 0.5) {
    color = "#34c759";
    description = "Strong self-awareness";
    iconName = "minus";
  } else if (gap > 0) {
    color = absGap >= 1.0 ? "#ff3b30" : "#ff9f0a";
    description = "Self rates higher than others";
    iconName = "trending-up";
  } else {
    color = absGap >= 1.0 ? "#ff9f0a" : "#0071e3";
    description = "Self rates lower than others";
    iconName = "trending-down";
  }

  // Disclose asymmetry if self saw a different question pool than others.
  let footnote: string | undefined;
  if (questionCounts) {
    const selfQ = questionCounts.SELF;
    const otherQs = [
      questionCounts.DOWNWARD,
      questionCounts.UPWARD,
      questionCounts.LATERAL,
      questionCounts.EXTERNAL,
    ].filter((n) => n > 0);
    if (otherQs.length > 0) {
      const otherAvgQ = otherQs.reduce((a, b) => a + b, 0) / otherQs.length;
      if (Math.abs(selfQ - otherAvgQ) >= 1) {
        footnote = `Self answered ${selfQ} questions; others averaged ${Math.round(otherAvgQ)}`;
      }
    }
  }

  return {
    label: "Self-Other Gap",
    value: `${gap > 0 ? "+" : ""}${gap.toFixed(1)}`,
    description,
    color,
    iconName,
    footnote,
  };
}

export function deriveRaterConsensus(
  questionDetails: QuestionDetail[]
): InsightTileData | null {
  const scored = questionDetails.filter(
    (q) => q.averageScore !== null && Object.keys(q.distribution).length > 0
  );

  if (scored.length === 0) return null;

  const variances = scored.map((q) => computeVariance(q.distribution));
  const avgVariance = variances.reduce((a, b) => a + b, 0) / variances.length;

  let color: string;
  let value: string;
  let description: string;

  if (avgVariance < 0.8) {
    color = "#34c759";
    value = "High";
    description = "Raters largely agree";
  } else if (avgVariance < 1.2) {
    color = "#ff9f0a";
    value = "Moderate";
    description = "Some variation in ratings";
  } else {
    color = "#ff3b30";
    value = "Low";
    description = "Raters disagree significantly";
  }

  return {
    label: "Rater Consensus",
    value,
    description,
    color,
    iconName: "message-circle",
  };
}

export function deriveRelationshipPattern(
  scores: DirectionScores,
  questionCounts?: DirectionQuestionCounts
): InsightTileData | null {
  const relEntries = [
    { label: "Downward", score: scores.downward, count: questionCounts?.DOWNWARD ?? 0 },
    { label: "Lateral", score: scores.lateral, count: questionCounts?.LATERAL ?? 0 },
    { label: "Upward", score: scores.upward, count: questionCounts?.UPWARD ?? 0 },
    { label: "External", score: scores.external, count: questionCounts?.EXTERNAL ?? 0 },
  ].filter(
    (e): e is { label: string; score: number; count: number } => e.score !== null && e.score > 0
  );

  if (relEntries.length < 2) return null;

  const sorted = [...relEntries].sort((a, b) => b.score - a.score);
  const highest = sorted[0];
  const lowest = sorted[sorted.length - 1];
  const spread = highest.score - lowest.score;

  let color: string;
  let value: string;
  let description: string;

  if (spread <= 0.5) {
    color = "#34c759";
    value = "Consistent";
    description = "Similar scores across directions";
  } else {
    color = spread >= 1.0 ? "#ff9f0a" : "#0071e3";
    value = `${spread.toFixed(1)} spread`;
    description = `${highest.label} rate highest`;
  }

  // Flag asymmetric question coverage between the highest- and lowest-rated direction.
  let footnote: string | undefined;
  if (questionCounts && highest.count > 0 && lowest.count > 0 && highest.count !== lowest.count) {
    footnote = `${highest.label}: ${highest.count} questions · ${lowest.label}: ${lowest.count}`;
  }

  return {
    label: "Direction Pattern",
    value,
    description,
    color,
    iconName: "users",
    footnote,
  };
}

// ─── Question Insights ───

export interface ScoredQuestion extends QuestionDetail {
  averageScore: number;
  variance: number;
}

const HIGHLIGHT_N = 3;
const VARIANCE_THRESHOLD = 0.8;

export interface QuestionHighlights {
  strengths: ScoredQuestion[];
  growthAreas: ScoredQuestion[];
  splitOpinions: ScoredQuestion[];
  remaining: ScoredQuestion[];
  allSorted: ScoredQuestion[];
}

export function deriveQuestionHighlights(
  questions: QuestionDetail[]
): QuestionHighlights {
  const scored: ScoredQuestion[] = questions
    .filter(
      (q): q is QuestionDetail & { averageScore: number } =>
        q.averageScore !== null && q.averageScore > 0
    )
    .map((q) => ({
      ...q,
      variance: computeVariance(q.distribution),
    }));

  const byScore = [...scored].sort(
    (a, b) => b.averageScore - a.averageScore
  );

  if (byScore.length === 0) {
    return {
      strengths: [],
      growthAreas: [],
      splitOpinions: [],
      remaining: [],
      allSorted: [],
    };
  }

  const top = byScore.slice(0, HIGHLIGHT_N);
  const bottom = byScore.slice(-HIGHLIGHT_N).reverse();

  // Deduplicate: remove questions that appear in both top and bottom
  const topIds = new Set(top.map((q) => q.questionId));
  const deduplicatedBottom = bottom.filter(
    (q) => !topIds.has(q.questionId)
  );

  const usedIds = new Set([
    ...top.map((q) => q.questionId),
    ...deduplicatedBottom.map((q) => q.questionId),
  ]);

  // Split opinions: high variance, not already shown
  const splits = scored
    .filter(
      (q) => !usedIds.has(q.questionId) && q.variance > VARIANCE_THRESHOLD
    )
    .sort((a, b) => b.variance - a.variance)
    .slice(0, 2);

  const allUsedIds = new Set([
    ...usedIds,
    ...splits.map((q) => q.questionId),
  ]);

  const rest = byScore.filter((q) => !allUsedIds.has(q.questionId));

  return {
    strengths: top,
    growthAreas: deduplicatedBottom,
    splitOpinions: splits,
    remaining: rest,
    allSorted: byScore,
  };
}

// ─── Competency Insights ───

export function deriveStrongestCompetency(
  categories: CategoryScore[]
): InsightTileData | null {
  const scored = categories.filter((c) => c.score > 0);
  if (scored.length < 2) return null;

  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const best = sorted[0];

  return {
    label: "Top Competency",
    value: best.score.toFixed(1),
    description: best.category,
    color: "#34c759",
    iconName: "star",
  };
}

export function deriveBiggestGrowthArea(
  categories: CategoryScore[]
): InsightTileData | null {
  const scored = categories.filter((c) => c.score > 0);
  if (scored.length < 2) return null;

  const sorted = [...scored].sort((a, b) => a.score - b.score);
  const weakest = sorted[0];

  return {
    label: "Growth Area",
    value: weakest.score.toFixed(1),
    description: weakest.category,
    color: "#ff9f0a",
    iconName: "target",
  };
}
