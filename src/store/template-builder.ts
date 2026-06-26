import { create } from "zustand";
import type { Direction, DirectionWeights, WeightPreset } from "@/lib/directions";
import type { TemplateApplicableRole } from "@/lib/template-routing";

interface TemplateQuestion {
  id: string;
  text: string;
  type: "rating_scale" | "text" | "multiple_choice";
  required: boolean;
  options?: string[];
  scaleMin?: number;
  scaleMax?: number;
  scaleLabels?: string[];
  conditionalOn?: string;
}

interface TemplateSection {
  id: string;
  title: string;
  description?: string;
  directions: Direction[];
  questions: TemplateQuestion[];
}

interface TemplateBuilderState {
  name: string;
  description: string;
  designationIds: string[];
  appliesToRole: TemplateApplicableRole;
  weightPreset: WeightPreset | null;
  weightsMember: DirectionWeights | null;
  weightsManager: DirectionWeights | null;
  sections: TemplateSection[];
  useDirectionRouting: boolean;
  activeSection: string | null;
  activeQuestion: string | null;
  isDirty: boolean;

  setName: (name: string) => void;
  setDescription: (description: string) => void;
  setDesignationIds: (ids: string[]) => void;
  setAppliesToRole: (role: TemplateApplicableRole) => void;
  setWeights: (next: {
    preset: WeightPreset | null;
    member: DirectionWeights | null;
    manager: DirectionWeights | null;
  }) => void;
  setUseDirectionRouting: (value: boolean) => void;
  addSection: () => void;
  updateSection: (sectionId: string, data: Partial<TemplateSection>) => void;
  removeSection: (sectionId: string) => void;
  moveSection: (fromIndex: number, toIndex: number) => void;
  addQuestion: (sectionId: string) => void;
  updateQuestion: (sectionId: string, questionId: string, data: Partial<TemplateQuestion>) => void;
  removeQuestion: (sectionId: string, questionId: string) => void;
  moveQuestion: (sectionId: string, fromIndex: number, toIndex: number) => void;
  moveQuestionBetweenSections: (
    fromSectionId: string,
    toSectionId: string,
    fromIndex: number,
    toIndex: number
  ) => void;
  setActiveSection: (sectionId: string | null) => void;
  setActiveQuestion: (questionId: string | null) => void;
  reset: () => void;
  loadTemplate: (data: {
    name: string;
    description: string;
    designationIds: string[];
    appliesToRole?: TemplateApplicableRole;
    weightPreset: WeightPreset | null;
    weightsMember: DirectionWeights | null;
    weightsManager: DirectionWeights | null;
    sections: TemplateSection[];
  }) => void;
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export const useTemplateBuilder = create<TemplateBuilderState>((set) => ({
  name: "",
  description: "",
  designationIds: [],
  appliesToRole: "ANY",
  weightPreset: null,
  weightsMember: null,
  weightsManager: null,
  sections: [],
  useDirectionRouting: false,
  activeSection: null,
  activeQuestion: null,
  isDirty: false,

  setName: (name) => set({ name, isDirty: true }),
  setDescription: (description) => set({ description, isDirty: true }),
  setDesignationIds: (designationIds) => set({ designationIds, isDirty: true }),
  setAppliesToRole: (appliesToRole) => set({ appliesToRole, isDirty: true }),
  setWeights: ({ preset, member, manager }) =>
    set({
      weightPreset: preset,
      weightsMember: member,
      weightsManager: manager,
      isDirty: true,
    }),
  setUseDirectionRouting: (value) =>
    set((state) => {
      if (state.useDirectionRouting === value) return state;
      const needsClear = !value && state.sections.some((s) => s.directions.length > 0);
      return {
        useDirectionRouting: value,
        sections: needsClear
          ? state.sections.map((s) => (s.directions.length === 0 ? s : { ...s, directions: [] }))
          : state.sections,
        isDirty: true,
      };
    }),

  addSection: () =>
    set((state) => ({
      sections: [
        ...state.sections,
        { id: generateId(), title: "New Section", directions: [], questions: [] },
      ],
      isDirty: true,
    })),

  updateSection: (sectionId, data) =>
    set((state) => ({
      sections: state.sections.map((s) => (s.id === sectionId ? { ...s, ...data } : s)),
      isDirty: true,
    })),

  removeSection: (sectionId) =>
    set((state) => ({
      sections: state.sections.filter((s) => s.id !== sectionId),
      isDirty: true,
    })),

  moveSection: (fromIndex, toIndex) =>
    set((state) => {
      const sections = [...state.sections];
      const [moved] = sections.splice(fromIndex, 1);
      sections.splice(toIndex, 0, moved);
      return { sections, isDirty: true };
    }),

  addQuestion: (sectionId) =>
    set((state) => ({
      sections: state.sections.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              questions: [
                ...s.questions,
                {
                  id: generateId(),
                  text: "",
                  type: "rating_scale" as const,
                  required: true,
                  scaleMin: 1,
                  scaleMax: 5,
                },
              ],
            }
          : s
      ),
      isDirty: true,
    })),

  updateQuestion: (sectionId, questionId, data) =>
    set((state) => ({
      sections: state.sections.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              questions: s.questions.map((q) =>
                q.id === questionId ? { ...q, ...data } : q
              ),
            }
          : s
      ),
      isDirty: true,
    })),

  removeQuestion: (sectionId, questionId) =>
    set((state) => ({
      sections: state.sections.map((s) =>
        s.id === sectionId
          ? { ...s, questions: s.questions.filter((q) => q.id !== questionId) }
          : s
      ),
      isDirty: true,
    })),

  moveQuestion: (sectionId, fromIndex, toIndex) =>
    set((state) => ({
      sections: state.sections.map((s) => {
        if (s.id !== sectionId) return s;
        const questions = [...s.questions];
        const [moved] = questions.splice(fromIndex, 1);
        questions.splice(toIndex, 0, moved);
        return { ...s, questions };
      }),
      isDirty: true,
    })),

  moveQuestionBetweenSections: (fromSectionId, toSectionId, fromIndex, toIndex) =>
    set((state) => {
      const sections = state.sections.map((s) => ({ ...s, questions: [...s.questions] }));
      const fromSection = sections.find((s) => s.id === fromSectionId);
      const toSection = sections.find((s) => s.id === toSectionId);
      if (!fromSection || !toSection) return state;
      const [moved] = fromSection.questions.splice(fromIndex, 1);
      toSection.questions.splice(toIndex, 0, moved);
      return { sections, isDirty: true };
    }),

  setActiveSection: (sectionId) => set({ activeSection: sectionId }),
  setActiveQuestion: (questionId) => set({ activeQuestion: questionId }),

  reset: () =>
    set({
      name: "",
      description: "",
      designationIds: [],
      appliesToRole: "ANY",
      weightPreset: null,
      weightsMember: null,
      weightsManager: null,
      sections: [],
      useDirectionRouting: false,
      activeSection: null,
      activeQuestion: null,
      isDirty: false,
    }),

  loadTemplate: (data) =>
    set({
      name: data.name,
      description: data.description,
      designationIds: data.designationIds,
      appliesToRole: data.appliesToRole ?? "ANY",
      weightPreset: data.weightPreset,
      weightsMember: data.weightsMember,
      weightsManager: data.weightsManager,
      sections: data.sections,
      useDirectionRouting: data.sections.some((s) => s.directions.length > 0),
      isDirty: false,
    }),
}));
