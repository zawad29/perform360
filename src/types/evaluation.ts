import type { Direction } from "@/lib/directions";

export interface QuestionOption {
  label: string;
  value: string;
}

export interface TemplateQuestion {
  id: string;
  text: string;
  type: "rating_scale" | "text" | "multiple_choice";
  required: boolean;
  guideline?: string;
  whatToLookFor?: string;
  options?: string[];
  scaleMin?: number;
  scaleMax?: number;
  scaleLabels?: string[];
  conditionalOn?: string;
}

export interface TemplateSection {
  id?: string;
  title: string;
  description?: string;
  /** Empty/missing = applies to all directions */
  directions?: Direction[];
  questions: TemplateQuestion[];
}

export interface EvaluationFormData {
  answers: Record<string, string | number | boolean>;
}
