import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { mockAuth, mockNoAuth, fixtures, createMockRequest, parseResponse } from "../helpers";

const { GET, PATCH, DELETE } = await import("@/app/api/cycles/[id]/route");

const validCuid = "clx1abc2def3ghi4jkl5mno6p";
const callWith = (handler: Function, req: any, id: string) =>
  handler(req, { params: { id } });

describe("GET /api/cycles/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockNoAuth();
    const req = createMockRequest(`http://localhost:3000/api/cycles/${validCuid}`);
    const res = await callWith(GET, req, validCuid);
    expect(res.status).toBe(401);
  });

  it("returns cycle with stats", async () => {
    mockAuth(fixtures.employee);
    vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue({
      id: validCuid,
      name: "Q1 2026",
      status: "ACTIVE",
      cycleTeams: [
        {
          team: { id: "tm1", name: "Eng", members: [] },
          templates: [
            {
              template: {
                id: "t1",
                name: "Standard",
                description: null,
                designationIds: [],
                weightPreset: null,
                weightsMember: null,
                weightsManager: null,
                sections: [],
              },
            },
          ],
        },
      ],
    } as any);
    vi.mocked(prisma.evaluationAssignment.groupBy).mockResolvedValue([
      { status: "SUBMITTED", _count: 1 },
      { status: "PENDING", _count: 1 },
    ] as any);

    const req = createMockRequest(`http://localhost:3000/api/cycles/${validCuid}`);
    const res = await callWith(GET, req, validCuid);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.data.stats.totalAssignments).toBe(2);
    expect(body.data.stats.submittedAssignments).toBe(1);
    expect(body.data.stats.completionRate).toBe(50);
  });

  it("returns 404 for non-existent cycle", async () => {
    mockAuth(fixtures.admin);
    vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.evaluationAssignment.groupBy).mockResolvedValue([] as any);

    const req = createMockRequest(`http://localhost:3000/api/cycles/${validCuid}`);
    const res = await callWith(GET, req, validCuid);
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/cycles/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects invalid status transition", async () => {
    mockAuth(fixtures.admin);
    vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue({
      id: validCuid,
      status: "ARCHIVED",
      companyId: fixtures.admin.companyId,
    } as any);

    const req = createMockRequest(`http://localhost:3000/api/cycles/${validCuid}`, {
      method: "PATCH",
      body: { status: "ACTIVE" },
    });
    const res = await callWith(PATCH, req, validCuid);
    const { status, body } = await parseResponse(res);
    expect(status).toBe(400);
    expect(body.code).toBe("INVALID_STATUS");
  });

  it("rejects team-template changes on non-DRAFT cycle", async () => {
    mockAuth(fixtures.admin);
    vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue({
      id: validCuid,
      status: "ACTIVE",
      companyId: fixtures.admin.companyId,
    } as any);

    const req = createMockRequest(`http://localhost:3000/api/cycles/${validCuid}`, {
      method: "PATCH",
      body: { teamTemplates: [{ teamId: "t1", templateIds: ["tmpl1"] }] },
    });
    const res = await callWith(PATCH, req, validCuid);
    const { status, body } = await parseResponse(res);
    expect(status).toBe(400);
    expect(body.code).toBe("INVALID_STATUS");
  });

  it("allows valid status transition ACTIVE → CLOSED", async () => {
    mockAuth(fixtures.admin);
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
    });
    vi.mocked(prisma.evaluationCycle.findUniqueOrThrow).mockResolvedValue({
      id: validCuid,
      status: "CLOSED",
      _count: { assignments: 0 },
      cycleTeams: [],
    } as any);

    const req = createMockRequest(`http://localhost:3000/api/cycles/${validCuid}`, {
      method: "PATCH",
      body: { status: "CLOSED" },
    });
    const res = await callWith(PATCH, req, validCuid);
    const { status } = await parseResponse(res);
    expect(status).toBe(200);
  });

  it("rejects MEMBER role", async () => {
    mockAuth(fixtures.employee);
    const req = createMockRequest(`http://localhost:3000/api/cycles/${validCuid}`, {
      method: "PATCH",
      body: { name: "Updated" },
    });
    const res = await callWith(PATCH, req, validCuid);
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/cycles/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes DRAFT cycle", async () => {
    mockAuth(fixtures.admin);
    vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue({
      id: validCuid,
      status: "DRAFT",
      companyId: fixtures.admin.companyId,
    } as any);
    vi.mocked(prisma.$transaction).mockResolvedValue([{}, {}, {}, {}, {}]);

    const req = createMockRequest(`http://localhost:3000/api/cycles/${validCuid}`, { method: "DELETE" });
    const res = await callWith(DELETE, req, validCuid);
    const { status, body } = await parseResponse(res);
    expect(status).toBe(200);
    expect(body.data.deleted).toBe(true);
  });

  it("rejects deleting non-DRAFT cycle", async () => {
    mockAuth(fixtures.admin);
    vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue({
      id: validCuid,
      status: "ACTIVE",
      companyId: fixtures.admin.companyId,
    } as any);

    const req = createMockRequest(`http://localhost:3000/api/cycles/${validCuid}`, { method: "DELETE" });
    const res = await callWith(DELETE, req, validCuid);
    const { status, body } = await parseResponse(res);
    expect(status).toBe(400);
    expect(body.code).toBe("INVALID_STATUS");
  });
});
