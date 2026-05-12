import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { getDataKeyFromRequest } from "@/lib/encryption-session";
import { enqueue } from "@/lib/queue";
import { writeAuditLog } from "@/lib/audit";
import { mockAuth, fixtures, createMockRequest, parseResponse } from "../helpers";

const _cyclesRoute = await import("@/app/api/cycles/route");
const cycleIdRoute = await import("@/app/api/cycles/[id]/route");
const activateRoute = await import("@/app/api/cycles/[id]/activate/route");
const remindRoute = await import("@/app/api/cycles/[id]/remind/route");

vi.mock("@/lib/assignments", () => ({
  generateAssignmentsFromTeams: vi.fn(),
  createAssignmentsForCycle: vi.fn().mockResolvedValue({ count: 5, reviewerEmails: [] }),
}));

const validCuid = "clx1abc2def3ghi4jkl5mno6p";

function callWithParams(handler: Function, req: any, id: string) {
  return handler(req, { params: { id } });
}

describe("Integration: Cycle Lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth(fixtures.admin);
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      encryptionSetupAt: new Date("2025-01-01"),
      keyVersion: 1,
    } as any);
  });

  it("DRAFT → cannot activate without encryption key", async () => {
    vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue({
      id: validCuid,
      status: "DRAFT",
      companyId: fixtures.admin.companyId,
    } as any);
    vi.mocked(getDataKeyFromRequest).mockReturnValue(null);

    const req = createMockRequest(`http://localhost:3000/api/cycles/${validCuid}/activate`, { method: "POST" });
    const res = await callWithParams(activateRoute.POST, req, validCuid);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(403);
    expect(body.code).toBe("ENCRYPTION_LOCKED");
  });

  it("DRAFT → cannot activate without assignments", async () => {
    const fakeDataKey = Buffer.alloc(32, 1);
    vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue({
      id: validCuid,
      status: "DRAFT",
      companyId: fixtures.admin.companyId,
    } as any);
    vi.mocked(getDataKeyFromRequest).mockReturnValue(fakeDataKey);
    vi.mocked(prisma.evaluationAssignment.count).mockResolvedValue(0);

    const req = createMockRequest(`http://localhost:3000/api/cycles/${validCuid}/activate`, { method: "POST" });
    const res = await callWithParams(activateRoute.POST, req, validCuid);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(400);
    expect(body.code).toBe("NO_ASSIGNMENTS");
  });

  it("DRAFT → ACTIVE with valid encryption + assignments", async () => {
    const fakeDataKey = Buffer.alloc(32, 1);
    vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue({
      id: validCuid,
      status: "DRAFT",
      companyId: fixtures.admin.companyId,
    } as any);
    vi.mocked(getDataKeyFromRequest).mockReturnValue(fakeDataKey);
    vi.mocked(prisma.evaluationAssignment.count).mockResolvedValue(10);
    vi.mocked(prisma.evaluationCycle.update).mockResolvedValue({
      id: validCuid,
      status: "ACTIVE",
    } as any);

    const req = createMockRequest(`http://localhost:3000/api/cycles/${validCuid}/activate`, { method: "POST" });
    const res = await callWithParams(activateRoute.POST, req, validCuid);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("ACTIVE");
    expect(body.data.totalAssignments).toBe(10);
    expect(body.data.jobId).toBe("job-123");

    // Verify side effects
    expect(enqueue).toHaveBeenCalledWith(
      "cycle.activate",
      expect.objectContaining({ cycleId: validCuid }),
      expect.any(Object),
    );
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "cycle_activate", target: `cycle:${validCuid}` }),
    );
  });

  it("ACTIVE → cannot activate again", async () => {
    const fakeDataKey = Buffer.alloc(32, 1);
    vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue({
      id: validCuid,
      status: "ACTIVE",
      companyId: fixtures.admin.companyId,
    } as any);
    vi.mocked(getDataKeyFromRequest).mockReturnValue(fakeDataKey);

    const req = createMockRequest(`http://localhost:3000/api/cycles/${validCuid}/activate`, { method: "POST" });
    const res = await callWithParams(activateRoute.POST, req, validCuid);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(400);
    expect(body.code).toBe("INVALID_STATUS");
  });

  it("ACTIVE → can send reminders for pending assignments", async () => {
    vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue({
      id: validCuid,
      status: "ACTIVE",
      companyId: fixtures.admin.companyId,
    } as any);
    vi.mocked(prisma.evaluationAssignment.count).mockResolvedValue(7);

    const req = createMockRequest(`http://localhost:3000/api/cycles/${validCuid}/remind`, {
      method: "POST",
      body: {},
    });
    const res = await callWithParams(remindRoute.POST, req, validCuid);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.data.totalPending).toBe(7);
    expect(body.data.jobId).toBe("job-123");
  });

  it("ACTIVE → reminders skip when all submitted", async () => {
    vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue({
      id: validCuid,
      status: "ACTIVE",
      companyId: fixtures.admin.companyId,
    } as any);
    vi.mocked(prisma.evaluationAssignment.count).mockResolvedValue(0);

    const req = createMockRequest(`http://localhost:3000/api/cycles/${validCuid}/remind`, {
      method: "POST",
      body: {},
    });
    const res = await callWithParams(remindRoute.POST, req, validCuid);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.data.sent).toBe(0);
  });

  it("DRAFT → cannot send reminders", async () => {
    vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue({
      id: validCuid,
      status: "DRAFT",
      companyId: fixtures.admin.companyId,
    } as any);

    const req = createMockRequest(`http://localhost:3000/api/cycles/${validCuid}/remind`, {
      method: "POST",
      body: {},
    });
    const res = await callWithParams(remindRoute.POST, req, validCuid);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(400);
    expect(body.code).toBe("INVALID_STATUS");
  });

  it("ACTIVE → CLOSED via PATCH", async () => {
    vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue({
      id: validCuid,
      status: "ACTIVE",
      companyId: fixtures.admin.companyId,
    } as any);
    vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
      if (typeof cb === "function") {
        return cb({
          evaluationCycle: { update: vi.fn().mockResolvedValue({ id: validCuid, status: "CLOSED" }) },
        });
      }
      return { id: validCuid, status: "CLOSED" };
    });
    vi.mocked(prisma.evaluationCycle.findUniqueOrThrow).mockResolvedValue({
      id: validCuid,
      status: "CLOSED",
      _count: { assignments: 10 },
      cycleTeams: [],
    } as any);

    const req = createMockRequest(`http://localhost:3000/api/cycles/${validCuid}`, {
      method: "PATCH",
      body: { status: "CLOSED" },
    });
    const res = await callWithParams(cycleIdRoute.PATCH, req, validCuid);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("CLOSED → ARCHIVED via PATCH", async () => {
    vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue({
      id: validCuid,
      status: "CLOSED",
      companyId: fixtures.admin.companyId,
    } as any);
    vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
      if (typeof cb === "function") {
        return cb({
          evaluationCycle: { update: vi.fn().mockResolvedValue({ id: validCuid, status: "ARCHIVED" }) },
        });
      }
      return { id: validCuid, status: "ARCHIVED" };
    });
    vi.mocked(prisma.evaluationCycle.findUniqueOrThrow).mockResolvedValue({
      id: validCuid,
      status: "ARCHIVED",
      _count: { assignments: 10 },
      cycleTeams: [],
    } as any);

    const req = createMockRequest(`http://localhost:3000/api/cycles/${validCuid}`, {
      method: "PATCH",
      body: { status: "ARCHIVED" },
    });
    const res = await callWithParams(cycleIdRoute.PATCH, req, validCuid);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("DRAFT → cannot transition directly to CLOSED", async () => {
    vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue({
      id: validCuid,
      status: "DRAFT",
      companyId: fixtures.admin.companyId,
    } as any);

    const req = createMockRequest(`http://localhost:3000/api/cycles/${validCuid}`, {
      method: "PATCH",
      body: { status: "CLOSED" },
    });
    const res = await callWithParams(cycleIdRoute.PATCH, req, validCuid);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(400);
    expect(body.code).toBe("INVALID_STATUS");
  });

  it("ARCHIVED → cannot transition anywhere", async () => {
    vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue({
      id: validCuid,
      status: "ARCHIVED",
      companyId: fixtures.admin.companyId,
    } as any);

    const req = createMockRequest(`http://localhost:3000/api/cycles/${validCuid}`, {
      method: "PATCH",
      body: { status: "ACTIVE" },
    });
    const res = await callWithParams(cycleIdRoute.PATCH, req, validCuid);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(400);
    expect(body.code).toBe("INVALID_STATUS");
  });

  it("only DRAFT cycles can be deleted", async () => {
    vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue({
      id: validCuid,
      status: "ACTIVE",
      companyId: fixtures.admin.companyId,
    } as any);

    const req = createMockRequest(`http://localhost:3000/api/cycles/${validCuid}`, { method: "DELETE" });
    const res = await callWithParams(cycleIdRoute.DELETE, req, validCuid);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(400);
    expect(body.code).toBe("INVALID_STATUS");
  });
});
