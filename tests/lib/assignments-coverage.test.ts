import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { validateTeamTemplateCoverage } from "@/lib/assignments";

describe("validateTeamTemplateCoverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ignores external and impersonator reviewers when checking template coverage", async () => {
    vi.mocked(prisma.team.findMany).mockResolvedValue([
      {
        id: "team-1",
        name: "Support",
        members: [
          {
            userId: "member-1",
            role: "MEMBER",
            levelId: "level-1",
            user: { id: "member-1", name: "Member One" },
            level: { id: "level-1", name: "L1" },
          },
          {
            userId: "external-1",
            role: "EXTERNAL",
            levelId: null,
            user: { id: "external-1", name: "External One" },
            level: null,
          },
          {
            userId: "imp-1",
            role: "IMPERSONATOR",
            levelId: null,
            user: { id: "imp-1", name: "Impersonator One" },
            level: null,
          },
        ],
      },
    ] as any);
    vi.mocked(prisma.evaluationTemplate.findMany).mockResolvedValue([
      {
        id: "tpl-1",
        levelIds: ["level-1"],
        sections: [],
      },
    ] as any);

    const result = await validateTeamTemplateCoverage("company-1", [
      { teamId: "team-1", templateIds: ["tpl-1"] },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.gaps).toEqual([]);
  });

  it("allows teams with no cycle subjects at all", async () => {
    vi.mocked(prisma.team.findMany).mockResolvedValue([
      {
        id: "team-1",
        name: "Vendors",
        members: [
          {
            userId: "external-1",
            role: "EXTERNAL",
            levelId: null,
            user: { id: "external-1", name: "External One" },
            level: null,
          },
          {
            userId: "imp-1",
            role: "IMPERSONATOR",
            levelId: null,
            user: { id: "imp-1", name: "Impersonator One" },
            level: null,
          },
        ],
      },
    ] as any);
    vi.mocked(prisma.evaluationTemplate.findMany).mockResolvedValue([
      {
        id: "tpl-1",
        levelIds: ["level-1"],
        sections: [],
      },
    ] as any);

    const result = await validateTeamTemplateCoverage("company-1", [
      { teamId: "team-1", templateIds: ["tpl-1"] },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.gaps).toEqual([]);
  });
});
