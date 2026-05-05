import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";

// We need to mock reports module since trends depends on it
vi.mock("@/lib/reports", () => ({
  decryptResponse: vi.fn(),
  extractRatingScores: vi.fn(),
}));

const { decryptResponse, extractRatingScores } = await import("@/lib/reports");
const { buildTrendsReport } = await import("@/lib/trends");

const COMPANY_ID = "company-1";
const DATA_KEY = Buffer.alloc(32, "k");

describe("buildTrendsReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty report when no cycles exist", async () => {
    vi.mocked(prisma.evaluationCycle.findMany).mockResolvedValue([]);

    const report = await buildTrendsReport(COMPANY_ID, DATA_KEY);

    expect(report.cycles).toEqual([]);
    expect(report.allTeams).toEqual([]);
    expect(report.kpiSummary.avgScore).toEqual({ current: null, rollingAvg: null, delta: null });
  });

  it("builds draft cycle points without scores", async () => {
    vi.mocked(prisma.evaluationCycle.findMany).mockResolvedValue([
      { id: "c1", name: "Draft Cycle", status: "DRAFT", startDate: new Date("2026-01-01") },
    ] as never);

    vi.mocked(prisma.evaluationAssignment.count).mockResolvedValue(5);
    vi.mocked(prisma.cycleTeam.findMany).mockResolvedValue([
      { templates: [{ templateId: "tpl-1" }] },
      { templates: [{ templateId: "tpl-1" }] },
    ] as never);

    const report = await buildTrendsReport(COMPANY_ID, DATA_KEY);

    expect(report.cycles).toHaveLength(1);
    expect(report.cycles[0].isDraft).toBe(true);
    expect(report.cycles[0].avgScore).toBeNull();
    expect(report.cycles[0].completionRate).toBeNull();
    expect(report.cycles[0].totalAssignments).toBe(5);
    expect(report.cycles[0].teamsEvaluated).toBe(2);
    expect(report.cycles[0].topPerformer).toBeNull();
    expect(report.cycles[0].templateIds).toEqual(["tpl-1"]);
  });

  it("computes completion rate for scored cycle", async () => {
    vi.mocked(prisma.evaluationCycle.findMany).mockResolvedValue([
      { id: "c1", name: "Q1 Review", status: "CLOSED", startDate: new Date("2026-01-01") },
    ] as never);

    vi.mocked(prisma.evaluationAssignment.findMany).mockResolvedValue([
      { status: "SUBMITTED", subjectId: "u1" },
      { status: "SUBMITTED", subjectId: "u2" },
      { status: "PENDING", subjectId: "u3" },
      { status: "IN_PROGRESS", subjectId: "u4" },
    ] as never);

    // No templateId on assignments → no templates to fetch → emptyPoint
    vi.mocked(prisma.cycleTeam.findMany).mockResolvedValue([]);

    const report = await buildTrendsReport(COMPANY_ID, DATA_KEY);

    expect(report.cycles[0].completionRate).toBe(50);
    expect(report.cycles[0].totalAssignments).toBe(4);
    expect(report.cycles[0].completedAssignments).toBe(2);
  });

  it("returns empty scores when no completed assignments", async () => {
    vi.mocked(prisma.evaluationCycle.findMany).mockResolvedValue([
      { id: "c1", name: "Active Cycle", status: "ACTIVE", startDate: new Date("2026-01-01") },
    ] as never);

    vi.mocked(prisma.evaluationAssignment.findMany).mockResolvedValue([
      { status: "PENDING", subjectId: "u1", templateId: "tpl1" },
    ] as never);

    vi.mocked(prisma.cycleTeam.findMany).mockResolvedValue([
      {
        teamId: "t1",
        templateId: "tpl1",
        team: { id: "t1", name: "Team A", members: [{ userId: "u1" }] },
      },
    ] as never);

    const report = await buildTrendsReport(COMPANY_ID, DATA_KEY);

    expect(report.cycles[0].avgScore).toBeNull();
    expect(report.cycles[0].topPerformer).toBeNull();
  });

  it("returns empty scores when no rating questions in templates", async () => {
    vi.mocked(prisma.evaluationCycle.findMany).mockResolvedValue([
      { id: "c1", name: "Q1", status: "CLOSED", startDate: new Date("2026-01-01") },
    ] as never);

    vi.mocked(prisma.evaluationAssignment.findMany).mockResolvedValue([
      { status: "SUBMITTED", subjectId: "u1", templateId: "tpl1" },
    ] as never);

    vi.mocked(prisma.cycleTeam.findMany).mockResolvedValue([
      { teamId: "t1", templateId: "tpl1", team: { id: "t1", name: "A", members: [] } },
    ] as never);

    vi.mocked(prisma.evaluationTemplate.findMany).mockResolvedValue([
      { sections: [{ questions: [{ id: "q1", type: "text" }] }] },
    ] as never);

    const report = await buildTrendsReport(COMPANY_ID, DATA_KEY);
    expect(report.cycles[0].avgScore).toBeNull();
  });

  it("aggregates scores by relationship type", async () => {
    vi.mocked(prisma.evaluationCycle.findMany).mockResolvedValue([
      { id: "c1", name: "Q1", status: "CLOSED", startDate: new Date("2026-01-01") },
    ] as never);

    vi.mocked(prisma.evaluationAssignment.findMany).mockResolvedValue([
      { status: "SUBMITTED", subjectId: "u1", templateId: "tpl1" },
      { status: "SUBMITTED", subjectId: "u1", templateId: "tpl1" },
    ] as never);

    vi.mocked(prisma.cycleTeam.findMany).mockResolvedValue([
      { teamId: "t1", templateId: "tpl1", team: { id: "t1", name: "A", members: [{ userId: "u1" }] } },
    ] as never);

    vi.mocked(prisma.evaluationTemplate.findMany).mockResolvedValue([
      { sections: [{ questions: [{ id: "q1", type: "rating_scale" }] }] },
    ] as never);

    vi.mocked(prisma.evaluationResponse.findMany).mockResolvedValue([
      { subjectId: "u1", answersEncrypted: "e1", answersIv: "iv1", answersTag: "t1", assignment: { direction: "DOWNWARD" } },
      { subjectId: "u1", answersEncrypted: "e2", answersIv: "iv2", answersTag: "t2", assignment: { direction: "LATERAL" } },
    ] as never);

    vi.mocked(decryptResponse).mockReturnValue({ q1: 4 });
    vi.mocked(extractRatingScores).mockReturnValue([{ questionId: "q1", score: 4 }]);

    vi.mocked(prisma.user.findUnique).mockResolvedValue({ name: "Alice" } as never);

    const report = await buildTrendsReport(COMPANY_ID, DATA_KEY);

    expect(report.cycles[0].directionScores.downward).toBe(4);
    expect(report.cycles[0].directionScores.lateral).toBe(4);
    expect(report.cycles[0].directionScores.self).toBeNull();
    expect(report.cycles[0].directionScores.upward).toBeNull();
    expect(report.cycles[0].directionScores.external).toBeNull();
  });

  it("identifies top performer", async () => {
    vi.mocked(prisma.evaluationCycle.findMany).mockResolvedValue([
      { id: "c1", name: "Q1", status: "CLOSED", startDate: new Date("2026-01-01") },
    ] as never);

    vi.mocked(prisma.evaluationAssignment.findMany).mockResolvedValue([
      { status: "SUBMITTED", subjectId: "u1", templateId: "tpl1" },
      { status: "SUBMITTED", subjectId: "u2", templateId: "tpl1" },
    ] as never);

    vi.mocked(prisma.cycleTeam.findMany).mockResolvedValue([
      { teamId: "t1", templateId: "tpl1", team: { id: "t1", name: "A", members: [{ userId: "u1" }, { userId: "u2" }] } },
    ] as never);

    vi.mocked(prisma.evaluationTemplate.findMany).mockResolvedValue([
      { sections: [{ questions: [{ id: "q1", type: "rating_scale" }] }] },
    ] as never);

    vi.mocked(prisma.evaluationResponse.findMany).mockResolvedValue([
      { subjectId: "u1", answersEncrypted: "e", answersIv: "i", answersTag: "t", assignment: { direction: "DOWNWARD" } },
      { subjectId: "u2", answersEncrypted: "e", answersIv: "i", answersTag: "t", assignment: { direction: "DOWNWARD" } },
    ] as never);

    vi.mocked(decryptResponse)
      .mockReturnValueOnce({ q1: 3 })
      .mockReturnValueOnce({ q1: 5 });
    vi.mocked(extractRatingScores)
      .mockReturnValueOnce([{ questionId: "q1", score: 3 }])
      .mockReturnValueOnce([{ questionId: "q1", score: 5 }]);

    vi.mocked(prisma.user.findUnique).mockResolvedValue({ name: "Bob" } as never);

    const report = await buildTrendsReport(COMPANY_ID, DATA_KEY);

    expect(report.cycles[0].topPerformer).not.toBeNull();
    expect(report.cycles[0].topPerformer!.subjectId).toBe("u2");
    expect(report.cycles[0].topPerformer!.subjectName).toBe("Bob");
    expect(report.cycles[0].topPerformer!.score).toBe(5);
  });

  it("computes team scores correctly", async () => {
    vi.mocked(prisma.evaluationCycle.findMany).mockResolvedValue([
      { id: "c1", name: "Q1", status: "CLOSED", startDate: new Date("2026-01-01") },
    ] as never);

    vi.mocked(prisma.evaluationAssignment.findMany).mockResolvedValue([
      { status: "SUBMITTED", subjectId: "u1", templateId: "tpl1" },
    ] as never);

    vi.mocked(prisma.cycleTeam.findMany).mockResolvedValue([
      { teamId: "t1", templateId: "tpl1", team: { id: "t1", name: "Engineering", members: [{ userId: "u1" }] } },
    ] as never);

    vi.mocked(prisma.evaluationTemplate.findMany).mockResolvedValue([
      { sections: [{ questions: [{ id: "q1", type: "rating_scale" }] }] },
    ] as never);

    vi.mocked(prisma.evaluationResponse.findMany).mockResolvedValue([
      { subjectId: "u1", answersEncrypted: "e", answersIv: "i", answersTag: "t", assignment: { direction: "DOWNWARD" } },
    ] as never);

    vi.mocked(decryptResponse).mockReturnValue({ q1: 4.5 });
    vi.mocked(extractRatingScores).mockReturnValue([{ questionId: "q1", score: 4.5 }]);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ name: "Alice" } as never);

    const report = await buildTrendsReport(COMPANY_ID, DATA_KEY);

    expect(report.cycles[0].teamScores).toHaveLength(1);
    expect(report.cycles[0].teamScores[0].teamName).toBe("Engineering");
    expect(report.cycles[0].teamScores[0].avgScore).toBe(4.5);
    expect(report.allTeams).toContainEqual({ teamId: "t1", teamName: "Engineering" });
  });

  it("skips responses that fail to decrypt", async () => {
    vi.mocked(prisma.evaluationCycle.findMany).mockResolvedValue([
      { id: "c1", name: "Q1", status: "CLOSED", startDate: new Date("2026-01-01") },
    ] as never);

    vi.mocked(prisma.evaluationAssignment.findMany).mockResolvedValue([
      { status: "SUBMITTED", subjectId: "u1", templateId: "tpl1" },
    ] as never);

    vi.mocked(prisma.cycleTeam.findMany).mockResolvedValue([
      { teamId: "t1", templateId: "tpl1", team: { id: "t1", name: "A", members: [] } },
    ] as never);

    vi.mocked(prisma.evaluationTemplate.findMany).mockResolvedValue([
      { sections: [{ questions: [{ id: "q1", type: "rating_scale" }] }] },
    ] as never);

    vi.mocked(prisma.evaluationResponse.findMany).mockResolvedValue([
      { subjectId: "u1", answersEncrypted: "bad", answersIv: "i", answersTag: "t", assignment: { direction: "DOWNWARD" } },
    ] as never);

    vi.mocked(decryptResponse).mockImplementation(() => {
      throw new Error("Decryption failed");
    });

    const report = await buildTrendsReport(COMPANY_ID, DATA_KEY);

    // Should not crash, just skip the bad response
    expect(report.cycles[0].avgScore).toBeNull();
    expect(report.cycles[0].topPerformer).toBeNull();
  });

  it("sorts cycles by startDate", async () => {
    vi.mocked(prisma.evaluationCycle.findMany).mockResolvedValue([
      { id: "c2", name: "Q2", status: "DRAFT", startDate: new Date("2026-04-01") },
      { id: "c1", name: "Q1", status: "DRAFT", startDate: new Date("2026-01-01") },
    ] as never);

    vi.mocked(prisma.evaluationAssignment.count).mockResolvedValue(0);
    vi.mocked(prisma.cycleTeam.findMany).mockResolvedValue([] as never);

    const report = await buildTrendsReport(COMPANY_ID, DATA_KEY);

    expect(report.cycles[0].cycleName).toBe("Q1");
    expect(report.cycles[1].cycleName).toBe("Q2");
  });

  it("computes KPI summary with delta across multiple scored cycles", async () => {
    vi.mocked(prisma.evaluationCycle.findMany).mockResolvedValue([
      { id: "c1", name: "Q1", status: "CLOSED", startDate: new Date("2026-01-01") },
      { id: "c2", name: "Q2", status: "CLOSED", startDate: new Date("2026-04-01") },
    ] as never);

    // For both cycles: return zero assignments so we get emptyPoints with completionRate 0
    vi.mocked(prisma.evaluationAssignment.findMany).mockResolvedValue([]);
    vi.mocked(prisma.cycleTeam.findMany).mockResolvedValue([]);

    const report = await buildTrendsReport(COMPANY_ID, DATA_KEY);

    // With 0 completedAssignments, both cycles get emptyPoint (avgScore = null)
    expect(report.kpiSummary.avgScore.current).toBeNull();
    // completionRate = 0 for both
    expect(report.kpiSummary.completionRate.current).toBe(0);
  });

  it("handles zero total assignments (division by zero)", async () => {
    vi.mocked(prisma.evaluationCycle.findMany).mockResolvedValue([
      { id: "c1", name: "Empty", status: "CLOSED", startDate: new Date("2026-01-01") },
    ] as never);

    vi.mocked(prisma.evaluationAssignment.findMany).mockResolvedValue([]);
    vi.mocked(prisma.cycleTeam.findMany).mockResolvedValue([]);

    const report = await buildTrendsReport(COMPANY_ID, DATA_KEY);

    expect(report.cycles[0].completionRate).toBe(0);
    expect(report.cycles[0].totalAssignments).toBe(0);
  });
});
