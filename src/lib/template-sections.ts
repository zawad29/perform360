import { sanitizeRichText } from "@/lib/rich-text";

interface TemplateQuestionShape {
  guideline?: string;
}

interface TemplateSectionShape {
  questions: TemplateQuestionShape[];
}

export function normalizeTemplateSections<T extends TemplateSectionShape>(sections: T[]): T[] {
  return sections.map((section) => ({
    ...section,
    questions: section.questions.map((question) => ({
      ...question,
      ...(question.guideline !== undefined
        ? { guideline: sanitizeRichText(question.guideline) }
        : {}),
    })),
  }));
}
