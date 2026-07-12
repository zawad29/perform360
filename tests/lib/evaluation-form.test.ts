import { describe, it, expect } from "vitest";
import { isAnswerMissing, requiredUnanswered, firstBlockedSection } from "@/lib/evaluation-form";
import type { TemplateSection } from "@/types/evaluation";

const q = (id: string, required = true): TemplateSection["questions"][number] => ({
  id,
  text: id,
  type: "rating_scale",
  required,
});

const sections: TemplateSection[] = [
  { title: "S1", questions: [q("q1"), q("q2")] },
  { title: "S2", questions: [q("q3"), q("q4", false)] },
  { title: "S3", questions: [q("q5")] },
];

describe("isAnswerMissing", () => {
  it("treats undefined and empty string as missing", () => {
    expect(isAnswerMissing(undefined)).toBe(true);
    expect(isAnswerMissing("")).toBe(true);
  });

  it("treats 0, false, and non-empty values as answered", () => {
    expect(isAnswerMissing(0)).toBe(false);
    expect(isAnswerMissing(false)).toBe(false);
    expect(isAnswerMissing("text")).toBe(false);
  });
});

describe("requiredUnanswered", () => {
  it("returns ids of required questions with no answer", () => {
    expect(requiredUnanswered(sections[0], {})).toEqual(["q1", "q2"]);
  });

  it("treats empty string as unanswered", () => {
    expect(requiredUnanswered(sections[0], { q1: "", q2: 4 })).toEqual(["q1"]);
  });

  it("ignores optional questions", () => {
    expect(requiredUnanswered(sections[1], { q3: 5 })).toEqual([]);
  });

  it("accepts falsy but valid answers (0, false)", () => {
    expect(requiredUnanswered(sections[0], { q1: 0, q2: false })).toEqual([]);
  });
});

describe("firstBlockedSection", () => {
  const complete = { q1: 5, q2: 4, q3: 3, q5: 2 };

  it("returns -1 when all sections in range are complete", () => {
    expect(firstBlockedSection(sections, complete, 0, 2)).toBe(-1);
  });

  it("blocks forward jump on current incomplete section", () => {
    expect(firstBlockedSection(sections, {}, 0, 2)).toBe(0);
  });

  it("blocks on first incomplete intermediate section when skipping ahead", () => {
    // S1 done, S2 missing q3 → jump 0→2 must stop at 1
    expect(firstBlockedSection(sections, { q1: 5, q2: 4 }, 0, 2)).toBe(1);
  });

  it("does not validate the target section itself", () => {
    // q5 (S3) unanswered, but jumping TO S3 only needs S1+S2 complete
    expect(firstBlockedSection(sections, { q1: 5, q2: 4, q3: 3 }, 0, 2)).toBe(-1);
  });

  it("returns -1 for backward or same-section range (from >= to)", () => {
    expect(firstBlockedSection(sections, {}, 2, 0)).toBe(-1);
    expect(firstBlockedSection(sections, {}, 1, 1)).toBe(-1);
  });
});
