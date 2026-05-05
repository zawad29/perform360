import { describe, it, expect } from "vitest";
import {
  buildCategoryScores,
  buildDirectionScores,
  buildQuestionDetails,
  buildTextFeedback,
  calculateOverallScore,
  resolveWeightsForSubject,
  applyWeightsToDirectionAverages,
} from "@/lib/reports";
import type { TemplateSection } from "@/types/evaluation";
import type { Direction } from "@/lib/directions";

const ratingQuestion = (id: string, text = "Q") => ({
  id,
  text,
  type: "rating_scale" as const,
  required: true,
  scaleMin: 1,
  scaleMax: 5,
});

const textQuestion = (id: string, text = "Comment") => ({
  id,
  text,
  type: "text" as const,
  required: false,
});

const sectionWith = (
  id: string,
  title: string,
  questions: TemplateSection["questions"]
): TemplateSection => ({
  id,
  title,
  directions: [],
  questions,
});

const decryptedResponse = (
  direction: Direction,
  templateId: string,
  answers: Record<string, number | string>
) => ({
  subjectId: "subj-1",
  reviewerId: "rev-1",
  direction,
  templateId,
  answers,
  submittedAt: new Date(),
});

describe("buildCategoryScores", () => {
  it("averages rating answers per section across responses", () => {
    const sections = [
      sectionWith("s1", "Communication", [ratingQuestion("q1"), ratingQuestion("q2")]),
      sectionWith("s2", "Leadership", [ratingQuestion("q3")]),
    ];
    const responses = [
      decryptedResponse("DOWNWARD", "tpl", { q1: 4, q2: 5, q3: 3 }),
      decryptedResponse("LATERAL", "tpl", { q1: 4, q2: 4, q3: 5 }),
    ];

    const scores = buildCategoryScores(responses, sections);
    expect(scores).toEqual([
      { category: "Communication", score: 4.25, maxScore: 5 },
      { category: "Leadership", score: 4, maxScore: 5 },
    ]);
  });

  it("returns score 0 for sections with no rating answers", () => {
    const sections = [sectionWith("s1", "Empty", [ratingQuestion("q1")])];
    const responses = [decryptedResponse("SELF", "tpl", {})];
    const scores = buildCategoryScores(responses, sections);
    expect(scores[0].score).toBe(0);
  });

  it("ignores sections with no rating questions", () => {
    const sections = [
      sectionWith("s1", "Comments only", [textQuestion("q1")]),
      sectionWith("s2", "Ratings", [ratingQuestion("q2")]),
    ];
    const responses = [decryptedResponse("DOWNWARD", "tpl", { q1: "nice", q2: 5 })];
    const scores = buildCategoryScores(responses, sections);
    expect(scores).toHaveLength(1);
    expect(scores[0].category).toBe("Ratings");
  });
});

describe("buildDirectionScores", () => {
  it("groups response averages by direction and rounds to 2dp", () => {
    const sections = [sectionWith("s1", "S", [ratingQuestion("q1"), ratingQuestion("q2")])];
    const responses = [
      decryptedResponse("DOWNWARD", "tpl", { q1: 4, q2: 4 }),
      decryptedResponse("DOWNWARD", "tpl", { q1: 3, q2: 5 }),
      decryptedResponse("LATERAL", "tpl", { q1: 5, q2: 5 }),
    ];

    const scores = buildDirectionScores(responses, sections);
    expect(scores.downward).toBe(4);
    expect(scores.lateral).toBe(5);
    expect(scores.upward).toBeNull();
    expect(scores.self).toBeNull();
    expect(scores.external).toBeNull();
  });
});

describe("calculateOverallScore", () => {
  it("averages all rating answers across all responses", () => {
    const sections = [sectionWith("s1", "S", [ratingQuestion("q1"), ratingQuestion("q2")])];
    const responses = [
      decryptedResponse("DOWNWARD", "tpl", { q1: 4, q2: 5 }),
      decryptedResponse("LATERAL", "tpl", { q1: 3, q2: 4 }),
    ];
    expect(calculateOverallScore(responses, sections)).toBe(4);
  });

  it("returns 0 when no rating answers exist", () => {
    const sections = [sectionWith("s1", "S", [ratingQuestion("q1")])];
    expect(calculateOverallScore([], sections)).toBe(0);
  });
});

describe("buildQuestionDetails", () => {
  it("builds per-question average + distribution for rating questions", () => {
    const sections = [sectionWith("s1", "S", [ratingQuestion("q1")])];
    const responses = [
      decryptedResponse("DOWNWARD", "tpl", { q1: 4 }),
      decryptedResponse("LATERAL", "tpl", { q1: 5 }),
      decryptedResponse("UPWARD", "tpl", { q1: 4 }),
    ];

    const details = buildQuestionDetails(responses, sections);
    expect(details).toHaveLength(1);
    expect(details[0].averageScore).toBe(4.33);
    expect(details[0].distribution).toEqual({ "4": 2, "5": 1 });
    expect(details[0].responseCount).toBe(3);
  });

  it("excludes text questions", () => {
    const sections = [sectionWith("s1", "S", [textQuestion("q1")])];
    const responses = [decryptedResponse("DOWNWARD", "tpl", { q1: "great" })];
    expect(buildQuestionDetails(responses, sections)).toEqual([]);
  });
});

describe("buildTextFeedback", () => {
  it("groups text answers by question and direction; trims whitespace", () => {
    const sections = [sectionWith("s1", "S", [textQuestion("q1", "Strengths?")])];
    const responses = [
      decryptedResponse("DOWNWARD", "tpl", { q1: "  great communicator " }),
      decryptedResponse("LATERAL", "tpl", { q1: "" }),
      decryptedResponse("LATERAL", "tpl", { q1: "team player" }),
    ];

    const groups = buildTextFeedback(responses, sections);
    expect(groups).toEqual([
      { questionId: "q1", questionText: "Strengths?", direction: "DOWNWARD", responses: ["great communicator"] },
      { questionId: "q1", questionText: "Strengths?", direction: "LATERAL", responses: ["team player"] },
    ]);
  });
});

describe("resolveWeightsForSubject", () => {
  const member = { downward: 25, upward: 25, lateral: 25, self: 25, external: 0 };
  const manager = { downward: 0, upward: 50, lateral: 25, self: 25, external: 0 };

  it("returns manager weights for MANAGER role when manager set", () => {
    expect(resolveWeightsForSubject(member, manager, "MANAGER")).toEqual(manager);
  });

  it("returns member weights for non-MANAGER roles when manager set", () => {
    expect(resolveWeightsForSubject(member, manager, "MEMBER")).toEqual(member);
    expect(resolveWeightsForSubject(member, manager, null)).toEqual(member);
  });

  it("returns member weights when manager weights are null", () => {
    expect(resolveWeightsForSubject(member, null, "MANAGER")).toEqual(member);
  });
});

describe("applyWeightsToDirectionAverages", () => {
  const equalWeights = { downward: 25, upward: 25, lateral: 25, self: 25, external: 0 };

  it("returns null when weights are null", () => {
    const groups = { DOWNWARD: [4], UPWARD: [], LATERAL: [], SELF: [], EXTERNAL: [] };
    expect(applyWeightsToDirectionAverages(groups, null)).toBeNull();
  });

  it("returns score 0 with empty applied weights when all directions absent", () => {
    const empty = { DOWNWARD: [], UPWARD: [], LATERAL: [], SELF: [], EXTERNAL: [] };
    const result = applyWeightsToDirectionAverages(empty, equalWeights);
    expect(result).not.toBeNull();
    expect(result!.score).toBe(0);
    expect(result!.appliedWeights).toEqual({ downward: 0, upward: 0, lateral: 0, self: 0, external: 0 });
  });

  it("redistributes absent direction weights proportionally to present ones", () => {
    // Only DOWNWARD and LATERAL have data. Each was 25%; absent (UPWARD+SELF) sums to 50%.
    // Each present gets 25% + (25/50) * 50% = 50%.
    const groups = {
      DOWNWARD: [4],
      UPWARD: [],
      LATERAL: [3],
      SELF: [],
      EXTERNAL: [],
    };
    const result = applyWeightsToDirectionAverages(groups, equalWeights)!;
    expect(result.appliedWeights.downward).toBeCloseTo(50, 5);
    expect(result.appliedWeights.lateral).toBeCloseTo(50, 5);
    expect(result.appliedWeights.upward).toBe(0);
    expect(result.appliedWeights.self).toBe(0);
    // weighted score = (4*50 + 3*50) / 100 = 3.5
    expect(result.score).toBe(3.5);
  });

  it("uses uniform split when present directions all have zero configured weight", () => {
    const zeroExcept = { downward: 0, upward: 0, lateral: 0, self: 0, external: 100 };
    const groups = {
      DOWNWARD: [4],
      UPWARD: [4],
      LATERAL: [],
      SELF: [],
      EXTERNAL: [],
    };
    // External (100%) is absent; downward and upward (0% each) are present.
    // presentSum = 0 → fallback to uniform: each present gets 100/2 = 50%.
    const result = applyWeightsToDirectionAverages(groups, zeroExcept)!;
    expect(result.appliedWeights.downward).toBe(50);
    expect(result.appliedWeights.upward).toBe(50);
    expect(result.score).toBe(4);
  });

  it("preserves boundary scores 1 and 5", () => {
    const groups = {
      DOWNWARD: [1, 1, 1],
      UPWARD: [5, 5],
      LATERAL: [],
      SELF: [],
      EXTERNAL: [],
    };
    const result = applyWeightsToDirectionAverages(groups, equalWeights)!;
    // DOWNWARD avg = 1, UPWARD avg = 5; each gets 50% applied weight after redistribution
    expect(result.score).toBe(3);
  });
});
