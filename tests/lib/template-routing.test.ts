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
  appliesToRole: "ANY",
  sections: [{ id: "s1", title: "S1", questions: [] }],
};
const senior: TemplateMeta = {
  id: "senior",
  designationIds: ["L-2", "L-3"],
  appliesToRole: "ANY",
  sections: [{ id: "s1", title: "S1", questions: [] }],
};
const junior: TemplateMeta = {
  id: "junior",
  designationIds: ["L-1"],
  appliesToRole: "ANY",
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
      appliesToRole: "ANY",
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

describe("resolveTemplateForSubject — role + designation routing", () => {
  // Same discipline ("SE"), two role-specific templates that share the same IC
  // designation L-1. A working lead (MANAGER) at L-1 should get the lead template.
  const memberTpl: TemplateMeta = {
    id: "se-member",
    designationIds: ["L-1", "L-2"],
    appliesToRole: "MEMBER",
    sections: [{ id: "s", title: "S", questions: [] }],
  };
  const leadTpl: TemplateMeta = {
    id: "se-lead",
    designationIds: ["L-1", "L-2"],
    appliesToRole: "MANAGER",
    sections: [{ id: "s", title: "S", questions: [] }],
  };
  const corporate: TemplateMeta = {
    id: "corp",
    designationIds: [],
    appliesToRole: "ANY",
    sections: [{ id: "s", title: "S", questions: [] }],
  };

  it("routes a MANAGER with an IC designation to the lead template (role wins)", () => {
    const r = resolveTemplateForSubject([memberTpl, leadTpl], "L-1", "MANAGER");
    expect(r?.template.id).toBe("se-lead");
  });

  it("routes a MEMBER with the same designation to the member template", () => {
    const r = resolveTemplateForSubject([memberTpl, leadTpl], "L-1", "MEMBER");
    expect(r?.template.id).toBe("se-member");
  });

  it("falls back to an ANY template when no role-specific template matches", () => {
    // Only a MEMBER template + an ANY template exist; a MANAGER gets ANY.
    const r = resolveTemplateForSubject([memberTpl, corporate], "L-9", "MANAGER");
    expect(r?.template.id).toBe("corp");
  });

  it("prefers a role-matching template over an ANY wildcard for the same subject", () => {
    const r = resolveTemplateForSubject([corporate, leadTpl], "L-1", "MANAGER");
    expect(r?.template.id).toBe("se-lead");
  });

  it("returns null for a MANAGER when only a MEMBER template covers the designation", () => {
    // Role filter keeps only MEMBER (role-matched empty → ANY fallback, but no ANY exists).
    expect(resolveTemplateForSubject([memberTpl], "L-1", "MANAGER")).toBeNull();
  });

  it("omitting subjectRole keeps legacy role-agnostic behavior", () => {
    // Without a role, both role-specific templates are eligible; first wins by order.
    const r = resolveTemplateForSubject([memberTpl, leadTpl], "L-1");
    expect(r?.template.id).toBe("se-member");
    expect(r?.tiedWith.map((t) => t.id)).toEqual(["se-lead"]);
  });

  it("keeps specific-over-wildcard tiebreak within the role set", () => {
    const leadWildcard: TemplateMeta = {
      id: "lead-wild",
      designationIds: [],
      appliesToRole: "MANAGER",
      sections: [{ id: "s", title: "S", questions: [] }],
    };
    // Both are MANAGER templates; the specific-designation one beats the wildcard.
    const r = resolveTemplateForSubject([leadWildcard, leadTpl], "L-1", "MANAGER");
    expect(r?.template.id).toBe("se-lead");
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
      appliesToRole: "ANY",
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
      appliesToRole: "ANY",
      sections: [{ id: "s", title: "S", directions: ["LATERAL"], questions: [] }],
    };
    const b: TemplateMeta = {
      id: "b",
      designationIds: ["L-1"],
      appliesToRole: "ANY",
      sections: [{ id: "s", title: "S", questions: [] }],
    };
    expect(resolveAssignmentForm([a, b], "L-1", "DOWNWARD")).toEqual({ templateId: "b" });
  });
});
