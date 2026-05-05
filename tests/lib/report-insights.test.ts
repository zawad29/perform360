import { describe, it, expect } from "vitest";
import {
  computeVariance,
  deriveSelfOtherGap,
  deriveRaterConsensus,
  deriveRelationshipPattern,
  deriveQuestionHighlights,
} from "@/lib/report-insights";
import type { DirectionScores, QuestionDetail } from "@/types/report";

// ─── Helpers ───

function makeQuestion(
  overrides: Partial<QuestionDetail> & { questionId: string }
): QuestionDetail {
  return {
    questionText: `Question ${overrides.questionId}`,
    type: "rating_scale",
    averageScore: null,
    distribution: {},
    responseCount: 0,
    ...overrides,
  };
}

function makeScores(
  overrides: Partial<DirectionScores> = {}
): DirectionScores {
  return {
    downward: null,
    lateral: null,
    upward: null,
    self: null,
    external: null,
    ...overrides,
  };
}

// ─── computeVariance ───

describe("computeVariance", () => {
  it("should return 0 for empty distribution", () => {
    expect(computeVariance({})).toBe(0);
  });

  it("should return 0 for single response", () => {
    expect(computeVariance({ "5": 1 })).toBe(0);
  });

  it("should return 0 when all responses are the same rating", () => {
    expect(computeVariance({ "4": 10 })).toBe(0);
  });

  it("should compute correct variance for uniform distribution", () => {
    // 1,2,3,4,5 each once → mean=3, variance = (4+1+0+1+4)/5 = 2.0
    const result = computeVariance({ "1": 1, "2": 1, "3": 1, "4": 1, "5": 1 });
    expect(result).toBeCloseTo(2.0, 5);
  });

  it("should compute correct variance for skewed distribution", () => {
    // All 5s except one 1 → mean = (1+5*4)/5 = 4.2, variance = ((1-4.2)^2 + 4*(5-4.2)^2)/5
    const result = computeVariance({ "1": 1, "5": 4 });
    const mean = (1 + 20) / 5;
    const expected =
      (1 * (1 - mean) ** 2 + 4 * (5 - mean) ** 2) / 5;
    expect(result).toBeCloseTo(expected, 5);
  });

  it("should compute low variance for tight distribution", () => {
    // Most ratings at 4, few at 3 and 5
    const result = computeVariance({ "3": 2, "4": 16, "5": 2 });
    expect(result).toBeLessThan(0.5);
  });

  it("should compute high variance for bimodal distribution", () => {
    // Half rate 1, half rate 5 — very high variance
    const result = computeVariance({ "1": 10, "5": 10 });
    expect(result).toBeGreaterThan(3.0);
  });
});

// ─── deriveSelfOtherGap ───

describe("deriveSelfOtherGap", () => {
  it("should return null when self score is null", () => {
    const scores = makeScores({ self: null, downward: 4.0, lateral: 3.5 });
    expect(deriveSelfOtherGap(scores)).toBeNull();
  });

  it("should return null when no other scores exist", () => {
    const scores = makeScores({ self: 4.0 });
    expect(deriveSelfOtherGap(scores)).toBeNull();
  });

  it("should return null when self score is 0", () => {
    const scores = makeScores({ self: 0, downward: 3.0 });
    expect(deriveSelfOtherGap(scores)).toBeNull();
  });

  it("should detect self-aware (small gap)", () => {
    const scores = makeScores({ self: 3.8, downward: 3.9, lateral: 3.7 });
    const result = deriveSelfOtherGap(scores)!;
    expect(result).not.toBeNull();
    expect(result.description).toBe("Strong self-awareness");
    expect(result.color).toBe("#34c759"); // green
  });

  it("should detect self rates higher (moderate)", () => {
    const scores = makeScores({ self: 4.5, downward: 3.5, lateral: 3.5 });
    const result = deriveSelfOtherGap(scores)!;
    expect(result.description).toBe("Self rates higher than others");
    expect(result.value).toBe("+1.0");
    expect(result.color).toBe("#ff3b30"); // red for >= 1.0
  });

  it("should detect self rates higher (small)", () => {
    const scores = makeScores({ self: 4.0, downward: 3.3, lateral: 3.4 });
    const result = deriveSelfOtherGap(scores)!;
    expect(result.description).toBe("Self rates higher than others");
    expect(result.color).toBe("#ff9f0a"); // amber for 0.5-1.0
  });

  it("should detect self rates lower", () => {
    const scores = makeScores({ self: 3.0, downward: 4.0, lateral: 4.5 });
    const result = deriveSelfOtherGap(scores)!;
    expect(result.description).toBe("Self rates lower than others");
    expect(result.iconName).toBe("trending-down");
  });

  it("should average only non-null other scores", () => {
    // Only manager has a score (4.0), self is 3.0 → gap = -1.0
    const scores = makeScores({ self: 3.0, downward: 4.0 });
    const result = deriveSelfOtherGap(scores)!;
    expect(result.value).toBe("-1.0");
  });
});

// ─── deriveRaterConsensus ───

describe("deriveRaterConsensus", () => {
  it("should return null when no scored questions exist", () => {
    const questions = [makeQuestion({ questionId: "q1" })];
    expect(deriveRaterConsensus(questions)).toBeNull();
  });

  it("should return null for questions with no distribution", () => {
    const questions = [
      makeQuestion({ questionId: "q1", averageScore: 4.0, distribution: {} }),
    ];
    expect(deriveRaterConsensus(questions)).toBeNull();
  });

  it("should return high consensus for tight distributions", () => {
    const questions = [
      makeQuestion({
        questionId: "q1",
        averageScore: 4.0,
        distribution: { "4": 18, "5": 2 },
        responseCount: 20,
      }),
      makeQuestion({
        questionId: "q2",
        averageScore: 3.9,
        distribution: { "3": 1, "4": 17, "5": 2 },
        responseCount: 20,
      }),
    ];
    const result = deriveRaterConsensus(questions)!;
    expect(result.value).toBe("High");
    expect(result.color).toBe("#34c759");
  });

  it("should return low consensus for high variance distributions", () => {
    const questions = [
      makeQuestion({
        questionId: "q1",
        averageScore: 3.0,
        distribution: { "1": 10, "5": 10 },
        responseCount: 20,
      }),
      makeQuestion({
        questionId: "q2",
        averageScore: 3.0,
        distribution: { "1": 8, "5": 12 },
        responseCount: 20,
      }),
    ];
    const result = deriveRaterConsensus(questions)!;
    expect(result.value).toBe("Low");
    expect(result.color).toBe("#ff3b30");
  });
});

// ─── deriveRelationshipPattern ───

describe("deriveRelationshipPattern", () => {
  it("should return null when fewer than 2 relationship types", () => {
    const scores = makeScores({ downward: 4.0 });
    expect(deriveRelationshipPattern(scores)).toBeNull();
  });

  it("should return null when all scores are null", () => {
    const scores = makeScores();
    expect(deriveRelationshipPattern(scores)).toBeNull();
  });

  it("should return consistent when spread is small", () => {
    const scores = makeScores({ downward: 4.0, lateral: 3.8, upward: 4.1 });
    const result = deriveRelationshipPattern(scores)!;
    expect(result.value).toBe("Consistent");
    expect(result.color).toBe("#34c759");
  });

  it("should identify highest rater when spread is significant", () => {
    const scores = makeScores({
      downward: 4.5,
      lateral: 3.2,
      upward: 3.0,
    });
    const result = deriveRelationshipPattern(scores)!;
    expect(result.description).toBe("Downward rate highest");
    expect(result.value).toBe("1.5 spread");
    expect(result.color).toBe("#ff9f0a"); // amber for >= 1.0
  });

  it("should identify moderate spread", () => {
    const scores = makeScores({
      downward: 4.0,
      lateral: 3.3,
    });
    const result = deriveRelationshipPattern(scores)!;
    expect(result.value).toBe("0.7 spread");
    expect(result.color).toBe("#0071e3"); // blue for 0.5-1.0
  });

  it("should exclude self score from relationship pattern", () => {
    // Self is highest at 5.0, but pattern only looks at non-self relationships
    const scores = makeScores({ self: 5.0, downward: 3.0, lateral: 4.0 });
    const result = deriveRelationshipPattern(scores)!;
    // Self is excluded, so it's Peers (4.0) vs Managers (3.0) → 1.0 spread
    expect(result.description).toBe("Lateral rate highest");
    expect(result.value).toBe("1.0 spread");
  });
});

// ─── deriveQuestionHighlights ───

describe("deriveQuestionHighlights", () => {
  it("should return empty arrays when no scored questions", () => {
    const questions = [
      makeQuestion({ questionId: "q1", averageScore: null }),
    ];
    const result = deriveQuestionHighlights(questions);
    expect(result.allSorted).toHaveLength(0);
    expect(result.strengths).toHaveLength(0);
    expect(result.growthAreas).toHaveLength(0);
  });

  it("should sort questions by score descending", () => {
    const questions = [
      makeQuestion({ questionId: "q1", averageScore: 2.0, distribution: { "2": 5 }, responseCount: 5 }),
      makeQuestion({ questionId: "q2", averageScore: 4.5, distribution: { "5": 5 }, responseCount: 5 }),
      makeQuestion({ questionId: "q3", averageScore: 3.0, distribution: { "3": 5 }, responseCount: 5 }),
    ];
    const result = deriveQuestionHighlights(questions);
    expect(result.allSorted.map((q) => q.questionId)).toEqual(["q2", "q3", "q1"]);
  });

  it("should pick top 3 as strengths and bottom 3 as growth areas", () => {
    const questions = Array.from({ length: 10 }, (_, i) =>
      makeQuestion({
        questionId: `q${i}`,
        averageScore: 1.0 + i * 0.4,
        distribution: { [`${Math.round(1 + i * 0.4)}`]: 5 },
        responseCount: 5,
      })
    );
    const result = deriveQuestionHighlights(questions);
    expect(result.strengths).toHaveLength(3);
    expect(result.growthAreas).toHaveLength(3);
    // Strengths should be highest scores
    expect(result.strengths[0].averageScore).toBeGreaterThan(
      result.strengths[2].averageScore
    );
    // Growth areas should be lowest scores (reversed order)
    expect(result.growthAreas[0].averageScore).toBeLessThan(
      result.growthAreas[2].averageScore
    );
  });

  it("should deduplicate when questions appear in both top and bottom", () => {
    // Only 2 questions — both would be in top 3 AND bottom 3
    const questions = [
      makeQuestion({ questionId: "q1", averageScore: 4.0, distribution: { "4": 5 }, responseCount: 5 }),
      makeQuestion({ questionId: "q2", averageScore: 2.0, distribution: { "2": 5 }, responseCount: 5 }),
    ];
    const result = deriveQuestionHighlights(questions);
    expect(result.strengths).toHaveLength(2);
    // Growth areas should exclude items already in strengths
    const growthIds = result.growthAreas.map((q) => q.questionId);
    const strengthIds = result.strengths.map((q) => q.questionId);
    const overlap = growthIds.filter((id) => strengthIds.includes(id));
    expect(overlap).toHaveLength(0);
  });

  it("should identify split opinions from high variance questions", () => {
    const questions = [
      // Normal questions with tight distributions (low variance)
      ...Array.from({ length: 8 }, (_, i) =>
        makeQuestion({
          questionId: `q${i}`,
          averageScore: 2.5 + i * 0.3,
          distribution: { [`${Math.round(2.5 + i * 0.3)}`]: 10 },
          responseCount: 10,
        })
      ),
      // High variance question (bimodal) with mid-range score so it's not in top/bottom 3
      makeQuestion({
        questionId: "q_split",
        averageScore: 3.5,
        distribution: { "1": 5, "5": 5 },
        responseCount: 10,
      }),
    ];
    const result = deriveQuestionHighlights(questions);
    const splitIds = result.splitOpinions.map((q) => q.questionId);
    expect(splitIds).toContain("q_split");
  });

  it("should not include strength/growth questions in split opinions", () => {
    const questions = Array.from({ length: 10 }, (_, i) =>
      makeQuestion({
        questionId: `q${i}`,
        averageScore: 1.0 + i * 0.4,
        // Give all of them bimodal distributions
        distribution: { "1": 5, "5": 5 },
        responseCount: 10,
      })
    );
    const result = deriveQuestionHighlights(questions);
    const strengthIds = new Set(result.strengths.map((q) => q.questionId));
    const growthIds = new Set(result.growthAreas.map((q) => q.questionId));
    for (const q of result.splitOpinions) {
      expect(strengthIds.has(q.questionId)).toBe(false);
      expect(growthIds.has(q.questionId)).toBe(false);
    }
  });

  it("should limit split opinions to 2", () => {
    const questions = Array.from({ length: 12 }, (_, i) =>
      makeQuestion({
        questionId: `q${i}`,
        averageScore: 3.0 + (i % 3) * 0.1,
        distribution: { "1": 5, "5": 5 }, // all high variance
        responseCount: 10,
      })
    );
    const result = deriveQuestionHighlights(questions);
    expect(result.splitOpinions.length).toBeLessThanOrEqual(2);
  });

  it("should put remaining questions in the remaining array", () => {
    const questions = Array.from({ length: 12 }, (_, i) =>
      makeQuestion({
        questionId: `q${i}`,
        averageScore: 1.0 + i * 0.3,
        distribution: { [`${Math.round(1 + i * 0.3)}`]: 10 },
        responseCount: 10,
      })
    );
    const result = deriveQuestionHighlights(questions);
    const allIds = [
      ...result.strengths,
      ...result.growthAreas,
      ...result.splitOpinions,
      ...result.remaining,
    ].map((q) => q.questionId);
    // All scored questions should be accounted for
    expect(allIds).toHaveLength(result.allSorted.length);
    // No duplicates
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it("should exclude questions with averageScore of 0", () => {
    const questions = [
      makeQuestion({ questionId: "q1", averageScore: 0, distribution: { "0": 5 }, responseCount: 5 }),
      makeQuestion({ questionId: "q2", averageScore: 4.0, distribution: { "4": 5 }, responseCount: 5 }),
    ];
    const result = deriveQuestionHighlights(questions);
    expect(result.allSorted).toHaveLength(1);
    expect(result.allSorted[0].questionId).toBe("q2");
  });
});
