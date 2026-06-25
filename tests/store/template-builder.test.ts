import { describe, it, expect, beforeEach } from "vitest";
import { useTemplateBuilder } from "@/store/template-builder";

describe("useTemplateBuilder store", () => {
  beforeEach(() => {
    useTemplateBuilder.getState().reset();
  });

  describe("initial state", () => {
    it("has correct default values", () => {
      const state = useTemplateBuilder.getState();
      expect(state.name).toBe("");
      expect(state.description).toBe("");
      expect(state.sections).toEqual([]);
      expect(state.activeSection).toBeNull();
      expect(state.activeQuestion).toBeNull();
      expect(state.isDirty).toBe(false);
    });
  });

  describe("setName / setDescription", () => {
    it("sets name and marks dirty", () => {
      useTemplateBuilder.getState().setName("Performance Review");
      expect(useTemplateBuilder.getState().name).toBe("Performance Review");
      expect(useTemplateBuilder.getState().isDirty).toBe(true);
    });

    it("sets description and marks dirty", () => {
      useTemplateBuilder.getState().setDescription("Annual review template");
      expect(useTemplateBuilder.getState().description).toBe("Annual review template");
      expect(useTemplateBuilder.getState().isDirty).toBe(true);
    });
  });

  describe("addSection", () => {
    it("adds a section with generated id and default title", () => {
      useTemplateBuilder.getState().addSection();
      const sections = useTemplateBuilder.getState().sections;
      expect(sections).toHaveLength(1);
      expect(sections[0].id).toBeTruthy();
      expect(sections[0].title).toBe("New Section");
      expect(sections[0].questions).toEqual([]);
      expect(useTemplateBuilder.getState().isDirty).toBe(true);
    });

    it("adds multiple sections incrementally", () => {
      const store = useTemplateBuilder.getState();
      store.addSection();
      store.addSection();
      store.addSection();
      const sections = useTemplateBuilder.getState().sections;
      expect(sections).toHaveLength(3);
      const ids = sections.map((s) => s.id);
      expect(new Set(ids).size).toBe(3);
    });
  });

  describe("updateSection", () => {
    it("updates only the target section", () => {
      const store = useTemplateBuilder.getState();
      store.addSection();
      store.addSection();
      const [s1, _s2] = useTemplateBuilder.getState().sections;

      store.updateSection(s1.id, { title: "Leadership" });
      const sections = useTemplateBuilder.getState().sections;
      expect(sections[0].title).toBe("Leadership");
      expect(sections[1].title).toBe("New Section");
    });

    it("updates description", () => {
      const store = useTemplateBuilder.getState();
      store.addSection();
      const [s1] = useTemplateBuilder.getState().sections;

      store.updateSection(s1.id, { description: "Evaluate leadership skills" });
      expect(useTemplateBuilder.getState().sections[0].description).toBe("Evaluate leadership skills");
    });
  });

  describe("removeSection", () => {
    it("removes the correct section", () => {
      const store = useTemplateBuilder.getState();
      store.addSection();
      store.addSection();
      store.addSection();
      const [s1, s2, s3] = useTemplateBuilder.getState().sections;

      store.removeSection(s2.id);
      const sections = useTemplateBuilder.getState().sections;
      expect(sections).toHaveLength(2);
      expect(sections.map((s) => s.id)).toEqual([s1.id, s3.id]);
    });
  });

  describe("moveSection", () => {
    it("moves section from first to last", () => {
      const store = useTemplateBuilder.getState();
      store.addSection();
      store.addSection();
      store.addSection();
      const ids = useTemplateBuilder.getState().sections.map((s) => s.id);

      store.moveSection(0, 2);
      const newIds = useTemplateBuilder.getState().sections.map((s) => s.id);
      expect(newIds).toEqual([ids[1], ids[2], ids[0]]);
    });

    it("moves section from last to first", () => {
      const store = useTemplateBuilder.getState();
      store.addSection();
      store.addSection();
      store.addSection();
      const ids = useTemplateBuilder.getState().sections.map((s) => s.id);

      store.moveSection(2, 0);
      const newIds = useTemplateBuilder.getState().sections.map((s) => s.id);
      expect(newIds).toEqual([ids[2], ids[0], ids[1]]);
    });

    it("swaps adjacent sections", () => {
      const store = useTemplateBuilder.getState();
      store.addSection();
      store.addSection();
      const ids = useTemplateBuilder.getState().sections.map((s) => s.id);

      store.moveSection(0, 1);
      const newIds = useTemplateBuilder.getState().sections.map((s) => s.id);
      expect(newIds).toEqual([ids[1], ids[0]]);
    });
  });

  describe("addQuestion", () => {
    it("adds question to correct section with defaults", () => {
      const store = useTemplateBuilder.getState();
      store.addSection();
      store.addSection();
      const [s1, _s2] = useTemplateBuilder.getState().sections;

      store.addQuestion(s1.id);
      const sections = useTemplateBuilder.getState().sections;
      expect(sections[0].questions).toHaveLength(1);
      expect(sections[1].questions).toHaveLength(0);

      const q = sections[0].questions[0];
      expect(q.id).toBeTruthy();
      expect(q.text).toBe("");
      expect(q.type).toBe("rating_scale");
      expect(q.required).toBe(true);
      expect(q.scaleMin).toBe(1);
      expect(q.scaleMax).toBe(5);
    });

    it("appends questions to existing list", () => {
      const store = useTemplateBuilder.getState();
      store.addSection();
      const [s1] = useTemplateBuilder.getState().sections;

      store.addQuestion(s1.id);
      store.addQuestion(s1.id);
      store.addQuestion(s1.id);

      const questions = useTemplateBuilder.getState().sections[0].questions;
      expect(questions).toHaveLength(3);
      const ids = questions.map((q) => q.id);
      expect(new Set(ids).size).toBe(3);
    });
  });

  describe("updateQuestion", () => {
    it("updates only the target question in the correct section", () => {
      const store = useTemplateBuilder.getState();
      store.addSection();
      store.addSection();
      const [s1, s2] = useTemplateBuilder.getState().sections;
      store.addQuestion(s1.id);
      store.addQuestion(s1.id);
      store.addQuestion(s2.id);

      const q1 = useTemplateBuilder.getState().sections[0].questions[0];

      store.updateQuestion(s1.id, q1.id, { text: "Rate leadership", type: "rating_scale" });

      const sections = useTemplateBuilder.getState().sections;
      expect(sections[0].questions[0].text).toBe("Rate leadership");
      expect(sections[0].questions[1].text).toBe("");
      expect(sections[1].questions[0].text).toBe("");
    });
  });

  describe("removeQuestion", () => {
    it("removes question from correct section", () => {
      const store = useTemplateBuilder.getState();
      store.addSection();
      const [s1] = useTemplateBuilder.getState().sections;
      store.addQuestion(s1.id);
      store.addQuestion(s1.id);
      const [q1, q2] = useTemplateBuilder.getState().sections[0].questions;

      store.removeQuestion(s1.id, q1.id);
      const questions = useTemplateBuilder.getState().sections[0].questions;
      expect(questions).toHaveLength(1);
      expect(questions[0].id).toBe(q2.id);
    });
  });

  describe("moveQuestion", () => {
    it("reorders questions within a section", () => {
      const store = useTemplateBuilder.getState();
      store.addSection();
      const [s1] = useTemplateBuilder.getState().sections;
      store.addQuestion(s1.id);
      store.addQuestion(s1.id);
      store.addQuestion(s1.id);
      const ids = useTemplateBuilder.getState().sections[0].questions.map((q) => q.id);

      store.moveQuestion(s1.id, 0, 2);
      const newIds = useTemplateBuilder.getState().sections[0].questions.map((q) => q.id);
      expect(newIds).toEqual([ids[1], ids[2], ids[0]]);
    });
  });

  describe("moveQuestionBetweenSections", () => {
    it("moves question from one section to another", () => {
      const store = useTemplateBuilder.getState();
      store.addSection();
      store.addSection();
      const [s1, s2] = useTemplateBuilder.getState().sections;
      store.addQuestion(s1.id);
      store.addQuestion(s1.id);
      store.addQuestion(s2.id);

      const movedQ = useTemplateBuilder.getState().sections[0].questions[0];
      store.moveQuestionBetweenSections(s1.id, s2.id, 0, 1);

      const sections = useTemplateBuilder.getState().sections;
      expect(sections[0].questions).toHaveLength(1);
      expect(sections[1].questions).toHaveLength(2);
      expect(sections[1].questions[1].id).toBe(movedQ.id);
    });

    it("does nothing with invalid section IDs", () => {
      const store = useTemplateBuilder.getState();
      store.addSection();
      const [s1] = useTemplateBuilder.getState().sections;
      store.addQuestion(s1.id);

      store.moveQuestionBetweenSections("invalid-from", s1.id, 0, 0);
      expect(useTemplateBuilder.getState().sections[0].questions).toHaveLength(1);

      store.moveQuestionBetweenSections(s1.id, "invalid-to", 0, 0);
      expect(useTemplateBuilder.getState().sections[0].questions).toHaveLength(1);
    });
  });

  describe("setActiveSection / setActiveQuestion", () => {
    it("sets active section", () => {
      useTemplateBuilder.getState().setActiveSection("s1");
      expect(useTemplateBuilder.getState().activeSection).toBe("s1");
    });

    it("sets active question", () => {
      useTemplateBuilder.getState().setActiveQuestion("q1");
      expect(useTemplateBuilder.getState().activeQuestion).toBe("q1");
    });

    it("clears active section with null", () => {
      useTemplateBuilder.getState().setActiveSection("s1");
      useTemplateBuilder.getState().setActiveSection(null);
      expect(useTemplateBuilder.getState().activeSection).toBeNull();
    });
  });

  describe("loadTemplate", () => {
    it("loads template data and sets isDirty to false", () => {
      useTemplateBuilder.getState().setName("dirty");

      useTemplateBuilder.getState().loadTemplate({
        name: "Loaded Template",
        description: "A loaded template",
        designationIds: [],
        weightPreset: null,
        weightsMember: null,
        weightsManager: null,
        sections: [
          {
            id: "s1",
            title: "Section 1",
            directions: [],
            questions: [
              { id: "q1", text: "Question 1", type: "rating_scale", required: true, scaleMin: 1, scaleMax: 5 },
            ],
          },
        ],
      });

      const state = useTemplateBuilder.getState();
      expect(state.name).toBe("Loaded Template");
      expect(state.description).toBe("A loaded template");
      expect(state.sections).toHaveLength(1);
      expect(state.sections[0].questions).toHaveLength(1);
      expect(state.isDirty).toBe(false);
    });
  });

  describe("reset", () => {
    it("clears everything", () => {
      const store = useTemplateBuilder.getState();
      store.setName("Test");
      store.setDescription("Desc");
      store.addSection();
      store.setActiveSection("s1");
      store.setActiveQuestion("q1");

      store.reset();

      const state = useTemplateBuilder.getState();
      expect(state.name).toBe("");
      expect(state.description).toBe("");
      expect(state.sections).toEqual([]);
      expect(state.activeSection).toBeNull();
      expect(state.activeQuestion).toBeNull();
      expect(state.useDirectionRouting).toBe(false);
      expect(state.isDirty).toBe(false);
    });
  });

  describe("useDirectionRouting", () => {
    it("defaults to false", () => {
      expect(useTemplateBuilder.getState().useDirectionRouting).toBe(false);
    });

    it("setUseDirectionRouting(false) clears all section directions", () => {
      const store = useTemplateBuilder.getState();
      store.loadTemplate({
        name: "T",
        description: "",
        designationIds: [],
        weightPreset: null,
        weightsMember: null,
        weightsManager: null,
        sections: [
          {
            id: "s1",
            title: "S1",
            directions: ["DOWNWARD", "LATERAL"],
            questions: [
              { id: "q1", text: "Q", type: "rating_scale", required: true, scaleMin: 1, scaleMax: 5 },
            ],
          },
          {
            id: "s2",
            title: "S2",
            directions: ["SELF"],
            questions: [
              { id: "q2", text: "Q", type: "rating_scale", required: true, scaleMin: 1, scaleMax: 5 },
            ],
          },
        ],
      });
      expect(useTemplateBuilder.getState().useDirectionRouting).toBe(true);

      useTemplateBuilder.getState().setUseDirectionRouting(false);

      const state = useTemplateBuilder.getState();
      expect(state.useDirectionRouting).toBe(false);
      expect(state.sections.every((s) => s.directions.length === 0)).toBe(true);
    });

    it("loadTemplate rehydrates useDirectionRouting from sections.directions", () => {
      useTemplateBuilder.getState().loadTemplate({
        name: "T",
        description: "",
        designationIds: [],
        weightPreset: null,
        weightsMember: null,
        weightsManager: null,
        sections: [
          {
            id: "s1",
            title: "S1",
            directions: [],
            questions: [
              { id: "q1", text: "Q", type: "rating_scale", required: true, scaleMin: 1, scaleMax: 5 },
            ],
          },
        ],
      });
      expect(useTemplateBuilder.getState().useDirectionRouting).toBe(false);

      useTemplateBuilder.getState().loadTemplate({
        name: "T",
        description: "",
        designationIds: [],
        weightPreset: null,
        weightsMember: null,
        weightsManager: null,
        sections: [
          {
            id: "s1",
            title: "S1",
            directions: ["UPWARD"],
            questions: [
              { id: "q1", text: "Q", type: "rating_scale", required: true, scaleMin: 1, scaleMax: 5 },
            ],
          },
        ],
      });
      expect(useTemplateBuilder.getState().useDirectionRouting).toBe(true);
    });
  });
});
