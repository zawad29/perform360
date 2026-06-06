import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDataKeyFromRequest } from "@/lib/encryption-session";
import { writeAuditLog } from "@/lib/audit";
import { mockAuth, mockNoAuth, fixtures, createMockRequest, parseResponse } from "../helpers";

// Mock buildCycleReport so GET doesn't require full decryption
vi.mock("@/lib/reports", () => ({
  buildCycleReport: vi.fn().mockResolvedValue({
    cycleId: "cm1cycle0000000000000001",
    cycleName: "Q1 Review",
    individualSummaries: [
      { subjectId: "cm1user00000000000000001", subjectName: "Alice", overallScore: 3.5, weightedOverallScore: 3.6, reviewCount: 3, completedCount: 3, calibratedScore: null },
      { subjectId: "cm1user00000000000000002", subjectName: "Bob", overallScore: 4.2, weightedOverallScore: 4.1, reviewCount: 4, completedCount: 4, calibratedScore: null },
    ],
  }),
}));

const { GET, PUT } = await import("@/app/api/cycles/[id]/calibration/route");
const { DELETE } = await import("@/app/api/cycles/[id]/calibration/[subjectId]/route");

const fakeDataKey = Buffer.alloc(32, "k");

// Valid CUID-format test IDs
const CYCLE_ID = "cm1cycle0000000000000001";
const TEAM_ID = "cm1team00000000000000001";
const USER_1 = "cm1user00000000000000001";
const USER_2 = "cm1user00000000000000002";

describe("API /api/cycles/[id]/calibration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Auth & Permission Tests ───

  describe("GET - auth checks", () => {
    it("returns 401 when unauthenticated", async () => {
      mockNoAuth();
      vi.mocked(getDataKeyFromRequest).mockReturnValue(fakeDataKey);
      const req = createMockRequest(`http://localhost:3000/api/cycles/${CYCLE_ID}/calibration`);
      const res = await GET(req as any, { params: Promise.resolve({ id: CYCLE_ID }) });
      const { status } = await parseResponse(res);
      expect(status).toBe(401);
    });

    it("returns 403 for MEMBER role", async () => {
      mockAuth(fixtures.employee);
      vi.mocked(getDataKeyFromRequest).mockReturnValue(fakeDataKey);
      const req = createMockRequest(`http://localhost:3000/api/cycles/${CYCLE_ID}/calibration`);
      const res = await GET(req as any, { params: Promise.resolve({ id: CYCLE_ID }) });
      const { status } = await parseResponse(res);
      expect(status).toBe(403);
    });

    it("returns 403 for EXTERNAL role", async () => {
      mockAuth(fixtures.external);
      vi.mocked(getDataKeyFromRequest).mockReturnValue(fakeDataKey);
      const req = createMockRequest(`http://localhost:3000/api/cycles/${CYCLE_ID}/calibration`);
      const res = await GET(req as any, { params: Promise.resolve({ id: CYCLE_ID }) });
      const { status } = await parseResponse(res);
      expect(status).toBe(403);
    });
  });

  // ─── GET - Cycle Status Gate ───

  describe("GET - status checks", () => {
    it("returns 404 when cycle not found", async () => {
      mockAuth(fixtures.admin);
      vi.mocked(getDataKeyFromRequest).mockReturnValue(fakeDataKey);
      vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.company.findUnique).mockResolvedValue({ encryptionSetupAt: new Date() } as any);

      const req = createMockRequest(`http://localhost:3000/api/cycles/${CYCLE_ID}/calibration`);
      const res = await GET(req as any, { params: Promise.resolve({ id: CYCLE_ID }) });
      const { status, body } = await parseResponse(res);
      expect(status).toBe(404);
      expect(body.code).toBe("NOT_FOUND");
    });

    it("returns 400 when cycle is ACTIVE (not closed)", async () => {
      mockAuth(fixtures.admin);
      vi.mocked(getDataKeyFromRequest).mockReturnValue(fakeDataKey);
      vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue({
        id: CYCLE_ID, name: "Q1", status: "ACTIVE",
      } as any);
      vi.mocked(prisma.company.findUnique).mockResolvedValue({ encryptionSetupAt: new Date() } as any);

      const req = createMockRequest(`http://localhost:3000/api/cycles/${CYCLE_ID}/calibration`);
      const res = await GET(req as any, { params: Promise.resolve({ id: CYCLE_ID }) });
      const { status, body } = await parseResponse(res);
      expect(status).toBe(400);
      expect(body.code).toBe("INVALID_STATUS");
    });

    it("returns 400 when cycle is DRAFT", async () => {
      mockAuth(fixtures.admin);
      vi.mocked(getDataKeyFromRequest).mockReturnValue(fakeDataKey);
      vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue({
        id: CYCLE_ID, name: "Q1", status: "DRAFT",
      } as any);
      vi.mocked(prisma.company.findUnique).mockResolvedValue({ encryptionSetupAt: new Date() } as any);

      const req = createMockRequest(`http://localhost:3000/api/cycles/${CYCLE_ID}/calibration`);
      const res = await GET(req as any, { params: Promise.resolve({ id: CYCLE_ID }) });
      const { status, body } = await parseResponse(res);
      expect(status).toBe(400);
      expect(body.code).toBe("INVALID_STATUS");
    });
  });

  // ─── GET - Encryption Gate ───

  describe("GET - encryption gate", () => {
    it("returns 403 when encryption not set up", async () => {
      mockAuth(fixtures.admin);
      vi.mocked(getDataKeyFromRequest).mockReturnValue(fakeDataKey);
      vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue({
        id: CYCLE_ID, name: "Q1", status: "CLOSED",
      } as any);
      vi.mocked(prisma.company.findUnique).mockResolvedValue({ encryptionSetupAt: null } as any);

      const req = createMockRequest(`http://localhost:3000/api/cycles/${CYCLE_ID}/calibration`);
      const res = await GET(req as any, { params: Promise.resolve({ id: CYCLE_ID }) });
      const { status, body } = await parseResponse(res);
      expect(status).toBe(403);
      expect(body.code).toBe("ENCRYPTION_RESET");
    });

    it("returns 403 when data key not in session", async () => {
      mockAuth(fixtures.admin);
      vi.mocked(getDataKeyFromRequest).mockReturnValue(null);
      vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue({
        id: CYCLE_ID, name: "Q1", status: "CLOSED",
      } as any);
      vi.mocked(prisma.company.findUnique).mockResolvedValue({ encryptionSetupAt: new Date() } as any);

      const req = createMockRequest(`http://localhost:3000/api/cycles/${CYCLE_ID}/calibration`);
      const res = await GET(req as any, { params: Promise.resolve({ id: CYCLE_ID }) });
      const { status, body } = await parseResponse(res);
      expect(status).toBe(403);
      expect(body.code).toBe("ENCRYPTION_LOCKED");
    });
  });

  // ─── GET - Success ───

  describe("GET - success", () => {
    const setupGetSuccess = () => {
      mockAuth(fixtures.admin);
      vi.mocked(getDataKeyFromRequest).mockReturnValue(fakeDataKey);
      vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue({
        id: CYCLE_ID, name: "Q1 Review", status: "CLOSED",
      } as any);
      vi.mocked(prisma.company.findUnique).mockResolvedValue({ encryptionSetupAt: new Date() } as any);
      vi.mocked(prisma.calibrationAdjustment.findMany).mockResolvedValue([]);
      vi.mocked(prisma.cycleTeam.findMany).mockResolvedValue([
        {
          cycleId: CYCLE_ID,
          teamId: TEAM_ID,
          templateId: "cm1tpl000000000000000001",
          calibrationOffset: null,
          calibrationJustification: null,
          calibrationAdjustedBy: null,
          team: {
            id: TEAM_ID,
            name: "Engineering",
            members: [
              { user: { id: USER_1, name: "Alice" } },
              { user: { id: USER_2, name: "Bob" } },
            ],
          },
        },
      ] as any);
    };

    it("returns calibration data for CLOSED cycle", async () => {
      setupGetSuccess();
      const req = createMockRequest(`http://localhost:3000/api/cycles/${CYCLE_ID}/calibration`);
      const res = await GET(req as any, { params: Promise.resolve({ id: CYCLE_ID }) });
      const { status, body } = await parseResponse(res);

      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.cycleId).toBe(CYCLE_ID);
      expect(body.data.cycleName).toBe("Q1 Review");
      expect(body.data.subjects).toHaveLength(2);
      expect(body.data.teamSummaries).toHaveLength(1);
    });

    it("returns subjects with raw scores from report", async () => {
      setupGetSuccess();
      const req = createMockRequest(`http://localhost:3000/api/cycles/${CYCLE_ID}/calibration`);
      const res = await GET(req as any, { params: Promise.resolve({ id: CYCLE_ID }) });
      const { body } = await parseResponse(res);

      const alice = body.data.subjects.find((s: any) => s.subjectId === USER_1);
      expect(alice).toBeDefined();
      expect(alice.subjectName).toBe("Alice");
      expect(alice.teamId).toBe(TEAM_ID);
      expect(alice.teamName).toBe("Engineering");
      expect(alice.calibratedScore).toBeNull();
    });

    it("returns existing calibration adjustments", async () => {
      mockAuth(fixtures.admin);
      vi.mocked(getDataKeyFromRequest).mockReturnValue(fakeDataKey);
      vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue({
        id: CYCLE_ID, name: "Q1 Review", status: "CLOSED",
      } as any);
      vi.mocked(prisma.company.findUnique).mockResolvedValue({ encryptionSetupAt: new Date() } as any);
      vi.mocked(prisma.calibrationAdjustment.findMany).mockResolvedValue([
        {
          cycleId: CYCLE_ID,
          teamId: TEAM_ID,
          subjectId: USER_1,
          rawScore: 3.5,
          calibratedScore: 3.8,
          justification: "Adjusted for leniency",
          updatedAt: new Date("2026-03-01"),
          adjuster: { name: "Admin User" },
        },
      ] as any);
      vi.mocked(prisma.cycleTeam.findMany).mockResolvedValue([
        {
          cycleId: CYCLE_ID,
          teamId: TEAM_ID,
          templateId: "cm1tpl000000000000000001",
          calibrationOffset: null,
          calibrationJustification: null,
          team: {
            id: TEAM_ID,
            name: "Engineering",
            members: [
              { user: { id: USER_1, name: "Alice" } },
            ],
          },
        },
      ] as any);

      const req = createMockRequest(`http://localhost:3000/api/cycles/${CYCLE_ID}/calibration`);
      const res = await GET(req as any, { params: Promise.resolve({ id: CYCLE_ID }) });
      const { body } = await parseResponse(res);

      const alice = body.data.subjects.find((s: any) => s.subjectId === USER_1);
      expect(alice.calibratedScore).toBe(3.8);
      expect(alice.justification).toBe("Adjusted for leniency");
      expect(alice.adjustedByName).toBe("Admin User");
    });

    it("applies team offset when no member override exists", async () => {
      mockAuth(fixtures.admin);
      vi.mocked(getDataKeyFromRequest).mockReturnValue(fakeDataKey);
      vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue({
        id: CYCLE_ID, name: "Q1 Review", status: "CLOSED",
      } as any);
      vi.mocked(prisma.company.findUnique).mockResolvedValue({ encryptionSetupAt: new Date() } as any);
      vi.mocked(prisma.calibrationAdjustment.findMany).mockResolvedValue([]);
      vi.mocked(prisma.cycleTeam.findMany).mockResolvedValue([
        {
          cycleId: CYCLE_ID,
          teamId: TEAM_ID,
          templateId: "cm1tpl000000000000000001",
          calibrationOffset: -0.5,
          calibrationJustification: "Team rated too high",
          team: {
            id: TEAM_ID,
            name: "Engineering",
            members: [
              { user: { id: USER_1, name: "Alice" } },
            ],
          },
        },
      ] as any);

      const req = createMockRequest(`http://localhost:3000/api/cycles/${CYCLE_ID}/calibration`);
      const res = await GET(req as any, { params: Promise.resolve({ id: CYCLE_ID }) });
      const { body } = await parseResponse(res);

      const alice = body.data.subjects.find((s: any) => s.subjectId === USER_1);
      // rawScore uses weightedOverallScore (3.6) from mock + offset -0.5 = 3.1
      expect(alice.calibratedScore).toBe(3.1);
    });

    it("writes audit log on successful GET", async () => {
      setupGetSuccess();
      const req = createMockRequest(`http://localhost:3000/api/cycles/${CYCLE_ID}/calibration`);
      await GET(req as any, { params: Promise.resolve({ id: CYCLE_ID }) });

      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "decryption",
          target: `cycle:${CYCLE_ID}`,
          metadata: { type: "calibration_view" },
        })
      );
    });

    it("allows HR role to access calibration data", async () => {
      mockAuth(fixtures.hr);
      vi.mocked(getDataKeyFromRequest).mockReturnValue(fakeDataKey);
      vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue({
        id: CYCLE_ID, name: "Q1 Review", status: "CLOSED",
      } as any);
      vi.mocked(prisma.company.findUnique).mockResolvedValue({ encryptionSetupAt: new Date() } as any);
      vi.mocked(prisma.calibrationAdjustment.findMany).mockResolvedValue([]);
      vi.mocked(prisma.cycleTeam.findMany).mockResolvedValue([] as any);

      const req = createMockRequest(`http://localhost:3000/api/cycles/${CYCLE_ID}/calibration`);
      const res = await GET(req as any, { params: Promise.resolve({ id: CYCLE_ID }) });
      const { status, body } = await parseResponse(res);
      expect(status).toBe(200);
      expect(body.success).toBe(true);
    });
  });

  // ─── PUT - Save Calibrations ───

  describe("PUT - auth & validation", () => {
    it("returns 401 when unauthenticated", async () => {
      mockNoAuth();
      const req = createMockRequest(`http://localhost:3000/api/cycles/${CYCLE_ID}/calibration`, {
        method: "PUT",
        body: { teamAdjustments: [], memberAdjustments: [] },
      });
      const res = await PUT(req as any, { params: Promise.resolve({ id: CYCLE_ID }) });
      const { status } = await parseResponse(res);
      expect(status).toBe(401);
    });

    it("returns 403 for MEMBER role", async () => {
      mockAuth(fixtures.employee);
      const req = createMockRequest(`http://localhost:3000/api/cycles/${CYCLE_ID}/calibration`, {
        method: "PUT",
        body: { teamAdjustments: [], memberAdjustments: [] },
      });
      const res = await PUT(req as any, { params: Promise.resolve({ id: CYCLE_ID }) });
      const { status } = await parseResponse(res);
      expect(status).toBe(403);
    });

    it("returns 404 when cycle not found", async () => {
      mockAuth(fixtures.admin);
      vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue(null);

      const req = createMockRequest(`http://localhost:3000/api/cycles/${CYCLE_ID}/calibration`, {
        method: "PUT",
        body: { teamAdjustments: [], memberAdjustments: [] },
      });
      const res = await PUT(req as any, { params: Promise.resolve({ id: CYCLE_ID }) });
      const { status, body } = await parseResponse(res);
      expect(status).toBe(404);
      expect(body.code).toBe("NOT_FOUND");
    });

    it("returns 400 when cycle is not CLOSED", async () => {
      mockAuth(fixtures.admin);
      vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue({
        id: CYCLE_ID, status: "ARCHIVED",
      } as any);

      const req = createMockRequest(`http://localhost:3000/api/cycles/${CYCLE_ID}/calibration`, {
        method: "PUT",
        body: { teamAdjustments: [], memberAdjustments: [] },
      });
      const res = await PUT(req as any, { params: Promise.resolve({ id: CYCLE_ID }) });
      const { status, body } = await parseResponse(res);
      expect(status).toBe(400);
      expect(body.code).toBe("INVALID_STATUS");
    });

    it("returns 400 for calibratedScore out of range (>5)", async () => {
      mockAuth(fixtures.admin);
      vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue({
        id: CYCLE_ID, status: "CLOSED",
      } as any);

      const req = createMockRequest(`http://localhost:3000/api/cycles/${CYCLE_ID}/calibration`, {
        method: "PUT",
        body: {
          memberAdjustments: [
            { subjectId: USER_1, teamId: TEAM_ID, rawScore: 3.5, calibratedScore: 6, justification: "test" },
          ],
        },
      });
      const res = await PUT(req as any, { params: Promise.resolve({ id: CYCLE_ID }) });
      const { status, body } = await parseResponse(res);
      expect(status).toBe(400);
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 for empty justification", async () => {
      mockAuth(fixtures.admin);
      vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue({
        id: CYCLE_ID, status: "CLOSED",
      } as any);

      const req = createMockRequest(`http://localhost:3000/api/cycles/${CYCLE_ID}/calibration`, {
        method: "PUT",
        body: {
          memberAdjustments: [
            { subjectId: USER_1, teamId: TEAM_ID, rawScore: 3.5, calibratedScore: 4.0, justification: "" },
          ],
        },
      });
      const res = await PUT(req as any, { params: Promise.resolve({ id: CYCLE_ID }) });
      const { status, body } = await parseResponse(res);
      expect(status).toBe(400);
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 for offset out of range", async () => {
      mockAuth(fixtures.admin);
      vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue({
        id: CYCLE_ID, status: "CLOSED",
      } as any);

      const req = createMockRequest(`http://localhost:3000/api/cycles/${CYCLE_ID}/calibration`, {
        method: "PUT",
        body: {
          teamAdjustments: [
            { teamId: TEAM_ID, offset: 10, justification: "way too high" },
          ],
        },
      });
      const res = await PUT(req as any, { params: Promise.resolve({ id: CYCLE_ID }) });
      const { status, body } = await parseResponse(res);
      expect(status).toBe(400);
      expect(body.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("PUT - success", () => {
    it("saves team offsets and member adjustments", async () => {
      mockAuth(fixtures.admin);
      vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue({
        id: CYCLE_ID, status: "CLOSED",
      } as any);

      const mockTx = {
        cycleTeam: { update: vi.fn() },
        calibrationAdjustment: { upsert: vi.fn() },
      };
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        if (typeof cb === "function") return cb(mockTx);
        return Promise.all(cb as Promise<unknown>[]);
      });

      const req = createMockRequest(`http://localhost:3000/api/cycles/${CYCLE_ID}/calibration`, {
        method: "PUT",
        body: {
          teamAdjustments: [
            { teamId: TEAM_ID, offset: -0.5, justification: "Team rated too high" },
          ],
          memberAdjustments: [
            { subjectId: USER_1, teamId: TEAM_ID, rawScore: 3.5, calibratedScore: 3.8, justification: "Individual adjustment" },
          ],
        },
      });
      const res = await PUT(req as any, { params: Promise.resolve({ id: CYCLE_ID }) });
      const { status, body } = await parseResponse(res);

      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.saved).toBe(true);

      expect(mockTx.cycleTeam.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { cycleId_teamId: { cycleId: CYCLE_ID, teamId: TEAM_ID } },
          data: expect.objectContaining({
            calibrationOffset: -0.5,
            calibrationJustification: "Team rated too high",
          }),
        })
      );

      expect(mockTx.calibrationAdjustment.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            cycleId_teamId_subjectId: { cycleId: CYCLE_ID, teamId: TEAM_ID, subjectId: USER_1 },
          },
          create: expect.objectContaining({
            cycleId: CYCLE_ID,
            teamId: TEAM_ID,
            subjectId: USER_1,
            calibratedScore: 3.8,
            justification: "Individual adjustment",
          }),
        })
      );
    });

    it("writes audit logs for each adjustment", async () => {
      mockAuth(fixtures.admin);
      vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue({
        id: CYCLE_ID, status: "CLOSED",
      } as any);

      const mockTx = {
        cycleTeam: { update: vi.fn() },
        calibrationAdjustment: { upsert: vi.fn() },
      };
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        if (typeof cb === "function") return cb(mockTx);
        return Promise.all(cb as Promise<unknown>[]);
      });

      const req = createMockRequest(`http://localhost:3000/api/cycles/${CYCLE_ID}/calibration`, {
        method: "PUT",
        body: {
          teamAdjustments: [
            { teamId: TEAM_ID, offset: -0.5, justification: "Bias correction" },
          ],
          memberAdjustments: [
            { subjectId: USER_1, teamId: TEAM_ID, rawScore: 3.5, calibratedScore: 4.0, justification: "Override" },
          ],
        },
      });
      await PUT(req as any, { params: Promise.resolve({ id: CYCLE_ID }) });

      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "calibration_adjust",
          target: `team:${TEAM_ID}`,
          metadata: expect.objectContaining({ type: "team_offset", offset: -0.5 }),
        })
      );
      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "calibration_adjust",
          target: `user:${USER_1}`,
          metadata: expect.objectContaining({ type: "member_override", calibratedScore: 4.0 }),
        })
      );
    });

    it("allows HR role to save calibrations", async () => {
      mockAuth(fixtures.hr);
      vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue({
        id: CYCLE_ID, status: "CLOSED",
      } as any);

      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        if (typeof cb === "function") return cb({ cycleTeam: { update: vi.fn() }, calibrationAdjustment: { upsert: vi.fn() } });
        return Promise.all(cb as Promise<unknown>[]);
      });

      const req = createMockRequest(`http://localhost:3000/api/cycles/${CYCLE_ID}/calibration`, {
        method: "PUT",
        body: { teamAdjustments: [], memberAdjustments: [] },
      });
      const res = await PUT(req as any, { params: Promise.resolve({ id: CYCLE_ID }) });
      const { status, body } = await parseResponse(res);
      expect(status).toBe(200);
      expect(body.success).toBe(true);
    });
  });

  // ─── DELETE - Remove single member override ───

  describe("DELETE /api/cycles/[id]/calibration/[subjectId]", () => {
    const deleteUrl = (query = `?teamId=${TEAM_ID}`) =>
      new NextRequest(`http://localhost:3000/api/cycles/${CYCLE_ID}/calibration/${USER_1}${query}`, {
        method: "DELETE",
        headers: { "x-forwarded-for": "127.0.0.1" },
      });

    it("returns 401 when unauthenticated", async () => {
      mockNoAuth();
      const res = await DELETE(deleteUrl(), { params: Promise.resolve({ id: CYCLE_ID, subjectId: USER_1 }) });
      const { status } = await parseResponse(res);
      expect(status).toBe(401);
    });

    it("returns 403 for MEMBER role", async () => {
      mockAuth(fixtures.employee);
      const res = await DELETE(deleteUrl(), { params: Promise.resolve({ id: CYCLE_ID, subjectId: USER_1 }) });
      const { status } = await parseResponse(res);
      expect(status).toBe(403);
    });

    it("returns 400 when teamId query param is missing", async () => {
      mockAuth(fixtures.admin);
      vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue({
        id: CYCLE_ID, status: "CLOSED",
      } as any);

      const res = await DELETE(deleteUrl(""), { params: Promise.resolve({ id: CYCLE_ID, subjectId: USER_1 }) });
      const { status, body } = await parseResponse(res);
      expect(status).toBe(400);
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("returns 404 when cycle not found", async () => {
      mockAuth(fixtures.admin);
      vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue(null);

      const res = await DELETE(deleteUrl(), { params: Promise.resolve({ id: CYCLE_ID, subjectId: USER_1 }) });
      const { status, body } = await parseResponse(res);
      expect(status).toBe(404);
      expect(body.code).toBe("NOT_FOUND");
    });

    it("returns 400 when cycle is not CLOSED", async () => {
      mockAuth(fixtures.admin);
      vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue({
        id: CYCLE_ID, status: "ACTIVE",
      } as any);

      const res = await DELETE(deleteUrl(), { params: Promise.resolve({ id: CYCLE_ID, subjectId: USER_1 }) });
      const { status, body } = await parseResponse(res);
      expect(status).toBe(400);
      expect(body.code).toBe("INVALID_STATUS");
    });

    it("deletes calibration adjustment and returns success", async () => {
      mockAuth(fixtures.admin);
      vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue({
        id: CYCLE_ID, status: "CLOSED",
      } as any);
      vi.mocked(prisma.calibrationAdjustment.delete).mockResolvedValue({} as any);

      const res = await DELETE(deleteUrl(), { params: Promise.resolve({ id: CYCLE_ID, subjectId: USER_1 }) });
      const { status, body } = await parseResponse(res);

      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.deleted).toBe(true);

      expect(prisma.calibrationAdjustment.delete).toHaveBeenCalledWith({
        where: {
          cycleId_teamId_subjectId: { cycleId: CYCLE_ID, teamId: TEAM_ID, subjectId: USER_1 },
        },
      });
    });

    it("writes audit log on delete", async () => {
      mockAuth(fixtures.admin);
      vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue({
        id: CYCLE_ID, status: "CLOSED",
      } as any);
      vi.mocked(prisma.calibrationAdjustment.delete).mockResolvedValue({} as any);

      await DELETE(deleteUrl(), { params: Promise.resolve({ id: CYCLE_ID, subjectId: USER_1 }) });

      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "calibration_adjust",
          target: `user:${USER_1}`,
          metadata: expect.objectContaining({ type: "member_override_removed" }),
        })
      );
    });

    it("returns 404 when adjustment does not exist", async () => {
      mockAuth(fixtures.admin);
      vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue({
        id: CYCLE_ID, status: "CLOSED",
      } as any);
      vi.mocked(prisma.calibrationAdjustment.delete).mockRejectedValue(
        new Error("Record not found")
      );

      const res = await DELETE(deleteUrl(), { params: Promise.resolve({ id: CYCLE_ID, subjectId: USER_1 }) });
      const { status, body } = await parseResponse(res);
      expect(status).toBe(404);
      expect(body.code).toBe("NOT_FOUND");
    });
  });
});
