import { describe, it, expect, vi } from "vitest";
import { generateAssignmentsFromTeams } from "@/lib/assignments";
import type { TemplateMeta } from "@/lib/template-routing";

vi.mock("@/lib/tokens", () => {
  let counter = 0;
  return { generateToken: () => `token-${counter++}` };
});

const cycleId = "cycle-1";

function meta(id: string, directions: string[] = []): TemplateMeta {
  return {
    id,
    designationIds: [],
    appliesToRole: "ANY",
    sections: [{ id: `${id}-s1`, title: "All", directions: directions as never, questions: [] }],
  };
}

describe("generateAssignmentsFromTeams — subjectTemplateMap (per-team pins)", () => {
  const teams = [
    {
      id: "team-1",
      members: [
        { userId: "mgr-1", role: "MANAGER" as const, designationId: null },
        { userId: "mem-1", role: "MEMBER" as const, designationId: null },
      ],
    },
  ];

  it("uses the mapped template per subject, ignoring team routing", () => {
    // Team has no attached templates; forms come entirely from the mapping.
    const subjectMap = new Map<string, TemplateMeta | null>([
      ["mgr-1:team-1", meta("tpl-mgr")],
      ["mem-1:team-1", meta("tpl-mem")],
    ]);

    const assignments = generateAssignmentsFromTeams(cycleId, teams, new Map(), subjectMap);

    // A subject's reviews all use that subject's mapped template.
    const downward = assignments.find((a) => a.direction === "DOWNWARD");
    expect(downward?.subjectId).toBe("mem-1");
    expect(downward?.templateId).toBe("tpl-mem");

    const upward = assignments.find((a) => a.direction === "UPWARD");
    expect(upward?.subjectId).toBe("mgr-1");
    expect(upward?.templateId).toBe("tpl-mgr");

    // Self-reviews use the subject's own template too.
    const selfMem = assignments.find((a) => a.direction === "SELF" && a.subjectId === "mem-1");
    expect(selfMem?.templateId).toBe("tpl-mem");
  });

  it("generates no reviews for a subject with an empty (null) mapping", () => {
    const subjectMap = new Map<string, TemplateMeta | null>([
      ["mgr-1:team-1", meta("tpl-mgr")],
      ["mem-1:team-1", null], // uncovered
    ]);

    const assignments = generateAssignmentsFromTeams(cycleId, teams, new Map(), subjectMap);

    // mem-1 is never a subject.
    expect(assignments.some((a) => a.subjectId === "mem-1")).toBe(false);
    // mgr-1 is still reviewed (upward from mem-1) and self.
    expect(assignments.some((a) => a.subjectId === "mgr-1")).toBe(true);
  });

  it("respects section→direction filtering on the mapped template", () => {
    // mem-1's template only renders SELF sections → only a self review.
    const subjectMap = new Map<string, TemplateMeta | null>([
      ["mgr-1:team-1", meta("tpl-mgr")],
      ["mem-1:team-1", meta("tpl-mem", ["SELF"])],
    ]);

    const assignments = generateAssignmentsFromTeams(cycleId, teams, new Map(), subjectMap);
    const memReviews = assignments.filter((a) => a.subjectId === "mem-1");
    expect(memReviews.every((a) => a.direction === "SELF")).toBe(true);
    expect(memReviews).toHaveLength(1);
  });
});
