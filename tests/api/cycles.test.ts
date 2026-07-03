import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { mockAuth, mockNoAuth, fixtures, createMockRequest, parseResponse } from "../helpers";

const { GET, POST } = await import("@/app/api/cycles/route");

vi.mock("@/lib/assignments", () => ({
  generateAssignmentsFromTeams: vi.fn(),
  createAssignmentsForCycle: vi.fn().mockResolvedValue({ count: 5, reviewerEmails: [] }),
  syncSubjectTemplateMap: vi.fn().mockResolvedValue(undefined),
  applyTeamTemplates: vi.fn().mockResolvedValue(undefined),
  computeDirectionCoverageWarnings: vi.fn().mockReturnValue([]),
  validateTeamTemplateCoverage: vi.fn(async (_companyId, teamTemplates) => ({
    ok: true,
    data: {
      pairs: teamTemplates.map((tt: { teamId: string; templateIds: string[] }) => ({
        teamId: tt.teamId,
        templates: tt.templateIds.map((id) => ({ id, designationIds: [], sections: [] })),
      })),
      templateMap: new Map(),
      gaps: [],
    },
  })),
}));

describe("API /api/cycles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/cycles", () => {
    it("returns 401 when unauthenticated", async () => {
      mockNoAuth();
      const req = createMockRequest("http://localhost:3000/api/cycles");
      const res = await GET(req as any);
      const { status } = await parseResponse(res);
      expect(status).toBe(401);
    });

    it("returns paginated cycles", async () => {
      mockAuth(fixtures.admin);
      const mockCycles = [
        {
          id: "cycle-1",
          name: "Q1 Review",
          status: "DRAFT",
          companyId: fixtures.admin.companyId,
          _count: { assignments: 10 },
          assignments: [
            { status: "SUBMITTED" },
            { status: "SUBMITTED" },
            { status: "PENDING" },
          ],
          cycleTeams: [],
        },
      ];
      vi.mocked(prisma.evaluationCycle.findMany).mockResolvedValue(mockCycles as any);
      vi.mocked(prisma.evaluationCycle.count).mockResolvedValue(1);

      const req = createMockRequest("http://localhost:3000/api/cycles");
      const res = await GET(req as any);
      const { status, body } = await parseResponse(res);

      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].name).toBe("Q1 Review");
    });

    it("filters by status parameter", async () => {
      mockAuth(fixtures.admin);
      vi.mocked(prisma.evaluationCycle.findMany).mockResolvedValue([]);
      vi.mocked(prisma.evaluationCycle.count).mockResolvedValue(0);

      const req = createMockRequest("http://localhost:3000/api/cycles?status=ACTIVE");
      await GET(req as any);

      expect(prisma.evaluationCycle.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: "ACTIVE",
          }),
        })
      );
    });

    it("supports multiple status filters", async () => {
      mockAuth(fixtures.admin);
      vi.mocked(prisma.evaluationCycle.findMany).mockResolvedValue([]);
      vi.mocked(prisma.evaluationCycle.count).mockResolvedValue(0);

      const req = createMockRequest("http://localhost:3000/api/cycles?status=ACTIVE,DRAFT");
      await GET(req as any);

      expect(prisma.evaluationCycle.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ["ACTIVE", "DRAFT"] },
          }),
        })
      );
    });
  });

  describe("POST /api/cycles", () => {
    it("returns 403 for MEMBER role", async () => {
      mockAuth(fixtures.employee);
      const req = createMockRequest("http://localhost:3000/api/cycles", {
        method: "POST",
        body: {
          name: "Q1 Review",
          startDate: "2026-01-01",
          endDate: "2026-03-31",
          teamTemplates: [{ teamId: "t1", templateIds: ["tpl1"] }],
        },
      });
      const res = await POST(req as any);
      const { status } = await parseResponse(res);
      expect(status).toBe(403);
    });

    it("returns 400 when end date is before start date", async () => {
      mockAuth(fixtures.admin);
      const req = createMockRequest("http://localhost:3000/api/cycles", {
        method: "POST",
        body: {
          name: "Q1 Review",
          startDate: "2026-06-01",
          endDate: "2026-01-01",
          teamTemplates: [{ teamId: "t1", templateIds: ["tpl1"] }],
        },
      });
      const res = await POST(req as any);
      const { status, body } = await parseResponse(res);
      expect(status).toBe(400);
      expect(body.error).toContain("End date must be after start date");
    });

    it("returns 400 for duplicate team IDs", async () => {
      mockAuth(fixtures.admin);
      const req = createMockRequest("http://localhost:3000/api/cycles", {
        method: "POST",
        body: {
          name: "Q1 Review",
          startDate: "2026-01-01",
          endDate: "2026-03-31",
          teamTemplates: [
            { teamId: "t1", templateIds: ["tpl1"] },
            { teamId: "t1", templateIds: ["tpl2"] },
          ],
        },
      });
      const res = await POST(req as any);
      const { status, body } = await parseResponse(res);
      expect(status).toBe(400);
      expect(body.error).toContain("Duplicate teams");
    });

    it("returns 404 when teams not found", async () => {
      mockAuth(fixtures.admin);
      const { validateTeamTemplateCoverage } = await import("@/lib/assignments");
      vi.mocked(validateTeamTemplateCoverage).mockResolvedValueOnce({
        ok: false,
        error: "One or more teams not found",
        code: "NOT_FOUND",
      });

      const req = createMockRequest("http://localhost:3000/api/cycles", {
        method: "POST",
        body: {
          name: "Q1 Review",
          startDate: "2026-01-01",
          endDate: "2026-03-31",
          teamTemplates: [{ teamId: "t1", templateIds: ["tpl1"] }],
        },
      });
      const res = await POST(req as any);
      const { status, body } = await parseResponse(res);
      expect(status).toBe(404);
      expect(body.error).toContain("teams not found");
    });

    it("creates cycle with valid data", async () => {
      mockAuth(fixtures.admin);
      vi.mocked(prisma.team.findMany).mockResolvedValue([
        { id: "t1", name: "Eng", members: [] },
      ] as any);
      vi.mocked(prisma.evaluationTemplate.findMany).mockResolvedValue([
        { id: "tpl1", designationIds: [], sections: [] },
      ] as any);

      const mockCycle = { id: "cycle-new", name: "Q1 Review", status: "DRAFT" };
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        if (typeof cb === "function") {
          return cb({
            evaluationCycle: { create: vi.fn().mockResolvedValue(mockCycle) },
            cycleTeam: { create: vi.fn().mockResolvedValue({ id: "ct-1" }), createMany: vi.fn() },
            cycleTeamTemplate: { createMany: vi.fn() },
          });
        }
        return mockCycle;
      });

      vi.mocked(prisma.evaluationCycle.findUniqueOrThrow).mockResolvedValue({
        ...mockCycle,
        _count: { assignments: 5 },
        cycleTeams: [],
      } as any);

      const req = createMockRequest("http://localhost:3000/api/cycles", {
        method: "POST",
        body: {
          name: "Q1 Review",
          startDate: "2026-01-01",
          endDate: "2026-03-31",
          teamTemplates: [{ teamId: "t1", templateIds: ["tpl1"] }],
        },
      });
      const res = await POST(req as any);
      const { status, body } = await parseResponse(res);

      expect(status).toBe(201);
      expect(body.success).toBe(true);
    });

    it("returns 400 for missing required fields", async () => {
      mockAuth(fixtures.admin);
      const req = createMockRequest("http://localhost:3000/api/cycles", {
        method: "POST",
        body: { name: "Missing fields" },
      });
      const res = await POST(req as any);
      const { status, body } = await parseResponse(res);
      expect(status).toBe(400);
      expect(body.code).toBe("VALIDATION_ERROR");
    });
  });
});
