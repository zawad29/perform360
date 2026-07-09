import type { AnswerMap, TemplateSection } from "@/types/evaluation";

/**
 * True when a required answer is absent. Shared by the client nav/submit
 * gates and the submit API route — keep both sides on this one predicate.
 */
export function isAnswerMissing(value: string | number | boolean | undefined): boolean {
  return value === undefined || value === "";
}

/** Ids of required questions in a section that have no usable answer. */
export function requiredUnanswered(section: TemplateSection, answers: AnswerMap): string[] {
  return section.questions
    .filter((q) => q.required && isAnswerMissing(answers[q.id]))
    .map((q) => q.id);
}

/**
 * First section in [from, to) with unanswered required questions, or -1.
 * Gates forward navigation only — the target section itself is not checked,
 * and backward ranges (from >= to) are always allowed.
 */
export function firstBlockedSection(
  sections: TemplateSection[],
  answers: AnswerMap,
  from: number,
  to: number
): number {
  for (let i = from; i < to; i++) {
    if (requiredUnanswered(sections[i], answers).length > 0) return i;
  }
  return -1;
}
