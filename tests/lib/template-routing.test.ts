import { describe, it, expect } from "vitest";
import {
  resolveTemplateForSubject,
  filterSectionsForDirection,
  resolveAssignmentForm,
  type TemplateMeta,
  type SectionShape,
} from "@/lib/template-routing";

const wildcard: TemplateMeta = {
  id: "wild",
  designationIds: [],
  sections: [{ id: "s1", title: "S1", questions: [] }],
};
const senior: TemplateMeta = {
  id: "senior",
  designationIds: ["L-2", "L-3"],
  sections: [{ id: "s1", title: "S1", questions: [] }],
};
const junior: TemplateMeta = {
  id: "junior",
  designationIds: ["L-1"],
  sections: [{ id: "s1", title: "S1", questions: [] }],
};

describe("resolveTemplateForSubject", () => {
  it("returns null when no template covers", () => {
    expect(resolveTemplateForSubject([senior], "L-1")).toBeNull();
  });

  it("matches the wildcard when no specific level match exists", () => {
    const result = resolveTemplateForSubject([wildcard], "L-1");
    expect(result?.template.id).toBe("wild");
    expect(result?.tiedWith).toEqual([]);
  });

  it("prefers specific level over wildcard", () => {
    const result = resolveTemplateForSubject([wildcard, junior], "L-1");
    expect(result?.template.id).toBe("junior");
    expect(result?.tiedWith).toEqual([]);
  });

  it("returns ties when multiple specific templates cover the level", () => {
    const otherSenior: TemplateMeta = {
      id: "senior2",
      designationIds: ["L-3"],
      sections: [{ id: "s1", title: "S1", questions: [] }],
    };
    const result = resolveTemplateForSubject([senior, otherSenior], "L-3");
    expect(result?.template.id).toBe("senior");
    expect(result?.tiedWith.map((t) => t.id)).toEqual(["senior2"]);
  });

  it("only matches wildcard when subject has no level", () => {
    const result = resolveTemplateForSubject([wildcard, senior], null);
    expect(result?.template.id).toBe("wild");
  });

  it("returns null when subject has no level and no wildcard exists", () => {
    expect(resolveTemplateForSubject([senior, junior], null)).toBeNull();
  });
});

describe("filterSectionsForDirection", () => {
  const sections: SectionShape[] = [
    { id: "all", title: "All", questions: [] }, // no directions = all
    { id: "down", title: "Down", directions: ["DOWNWARD"], questions: [] },
    { id: "down-up", title: "Down/Up", directions: ["DOWNWARD", "UPWARD"], questions: [] },
    { id: "self", title: "Self", directions: ["SELF"], questions: [] },
  ];

  it("includes empty-directions sections for every direction", () => {
    const result = filterSectionsForDirection(sections, "EXTERNAL");
    expect(result.map((s) => s.id)).toEqual(["all"]);
  });

  it("matches direction-tagged sections when direction is in the list", () => {
    expect(filterSectionsForDirection(sections, "DOWNWARD").map((s) => s.id)).toEqual(["all", "down", "down-up"]);
    expect(filterSectionsForDirection(sections, "UPWARD").map((s) => s.id)).toEqual(["all", "down-up"]);
    expect(filterSectionsForDirection(sections, "SELF").map((s) => s.id)).toEqual(["all", "self"]);
  });

  it("preserves source order", () => {
    const result = filterSectionsForDirection(sections, "DOWNWARD");
    expect(result[0].id).toBe("all");
    expect(result[1].id).toBe("down");
    expect(result[2].id).toBe("down-up");
  });
});

describe("resolveAssignmentForm", () => {
  it("returns null when no template covers the level", () => {
    expect(resolveAssignmentForm([senior], "L-1", "DOWNWARD")).toBeNull();
  });

  it("returns null when level matches but no section renders for the direction", () => {
    const tpl: TemplateMeta = {
      id: "t",
      designationIds: ["L-1"],
      sections: [{ id: "s", title: "S", directions: ["LATERAL"], questions: [] }],
    };
    expect(resolveAssignmentForm([tpl], "L-1", "DOWNWARD")).toBeNull();
  });

  it("returns the template id when level + direction both match", () => {
    expect(resolveAssignmentForm([junior], "L-1", "DOWNWARD")).toEqual({ templateId: "junior" });
  });

  it("falls through to a tied template when the first has no matching section", () => {
    const a: TemplateMeta = {
      id: "a",
      designationIds: ["L-1"],
      sections: [{ id: "s", title: "S", directions: ["LATERAL"], questions: [] }],
    };
    const b: TemplateMeta = {
      id: "b",
      designationIds: ["L-1"],
      sections: [{ id: "s", title: "S", questions: [] }],
    };
    expect(resolveAssignmentForm([a, b], "L-1", "DOWNWARD")).toEqual({ templateId: "b" });
  });
});
