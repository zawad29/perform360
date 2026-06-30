import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { mockAuth, mockNoAuth, fixtures, createMockRequest, parseResponse } from "../helpers";

const { GET, PATCH, DELETE } = await import("@/app/api/users/[id]/route");

const validCuid = "clx1abc2def3ghi4jkl5mno6p";
const callWith = (handler: Function, req: any, id: string) =>
  handler(req, { params: { id } });

describe("GET /api/users/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockNoAuth();
    const req = createMockRequest(`http://localhost:3000/api/users/${validCuid}`);
    const res = await callWith(GET, req, validCuid);
    expect(res.status).toBe(401);
  });

  it("returns user with evaluations and stats", async () => {
    mockAuth(fixtures.admin);
    // First findFirst = auth, second = user lookup
    vi.mocked(prisma.user.findFirst)
      .mockResolvedValueOnce({ id: fixtures.admin.userId, email: fixtures.admin.email, role: "ADMIN", companyId: fixtures.admin.companyId } as any)
      .mockResolvedValueOnce({
        id: validCuid,
        name: "Target User",
        email: "target@test.com",
        avatar: null,
        role: "MEMBER",
        createdAt: new Date(),
        teamMemberships: [{ id: "tm1", role: "MEMBER", team: { id: "t1", name: "Eng" } }],
      } as any);
    vi.mocked(prisma.evaluationAssignment.findMany)
      .mockResolvedValueOnce([]) // asSubject
      .mockResolvedValueOnce([]); // asReviewer

    const req = createMockRequest(`http://localhost:3000/api/users/${validCuid}`);
    const res = await callWith(GET, req, validCuid);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.data.name).toBe("Target User");
    expect(body.data.stats.totalTeams).toBe(1);
  });

  it("returns 404 for user not in company", async () => {
    mockAuth(fixtures.admin);
    vi.mocked(prisma.user.findFirst)
      .mockResolvedValueOnce({ id: fixtures.admin.userId, email: fixtures.admin.email, role: "ADMIN", companyId: fixtures.admin.companyId } as any)
      .mockResolvedValueOnce(null);

    const req = createMockRequest(`http://localhost:3000/api/users/${validCuid}`);
    const res = await callWith(GET, req, validCuid);
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/users/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates user role and writes audit log", async () => {
    mockAuth(fixtures.admin);
    vi.mocked(prisma.user.findFirst)
      .mockResolvedValueOnce({ id: fixtures.admin.userId, email: fixtures.admin.email, role: "ADMIN", companyId: fixtures.admin.companyId } as any)
      .mockResolvedValueOnce({ id: validCuid, role: "MEMBER", companyId: fixtures.admin.companyId } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({ id: validCuid, role: "HR" } as any);

    const req = createMockRequest(`http://localhost:3000/api/users/${validCuid}`, {
      method: "PATCH",
      body: { role: "HR" },
    });
    const res = await callWith(PATCH, req, validCuid);
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "role_change" })
    );
  });

  it("prevents HR from assigning ADMIN role", async () => {
    mockAuth(fixtures.hr);
    const req = createMockRequest(`http://localhost:3000/api/users/${validCuid}`, {
      method: "PATCH",
      body: { role: "ADMIN" },
    });
    const res = await callWith(PATCH, req, validCuid);
    expect(res.status).toBe(403);
  });

  it("prevents ADMIN from demoting themselves", async () => {
    // Use validCuid as admin userId to pass CUID param validation
    const adminId = validCuid;
    mockAuth({ ...fixtures.admin, userId: adminId });
    vi.mocked(prisma.user.findFirst)
      .mockResolvedValueOnce({ id: adminId, email: fixtures.admin.email, role: "ADMIN", companyId: fixtures.admin.companyId } as any)
      .mockResolvedValueOnce({ id: adminId, role: "ADMIN", companyId: fixtures.admin.companyId } as any);

    const req = createMockRequest(`http://localhost:3000/api/users/${adminId}`, {
      method: "PATCH",
      body: { role: "MEMBER" },
    });
    const res = await callWith(PATCH, req, adminId);
    const { status, body } = await parseResponse(res);
    expect(status).toBe(403);
    expect(body.code).toBe("FORBIDDEN");
  });

  it("prevents HR from modifying ADMIN users", async () => {
    mockAuth(fixtures.hr);
    vi.mocked(prisma.user.findFirst)
      .mockResolvedValueOnce({ id: fixtures.hr.userId, email: fixtures.hr.email, role: "HR", companyId: fixtures.hr.companyId } as any)
      .mockResolvedValueOnce({ id: validCuid, role: "ADMIN", companyId: fixtures.hr.companyId } as any);

    const req = createMockRequest(`http://localhost:3000/api/users/${validCuid}`, {
      method: "PATCH",
      body: { name: "New Name" },
    });
    const res = await callWith(PATCH, req, validCuid);
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/users/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("soft deletes (archives) user by default", async () => {
    mockAuth(fixtures.admin);
    vi.mocked(prisma.user.findFirst)
      .mockResolvedValueOnce({ id: fixtures.admin.userId, email: fixtures.admin.email, role: "ADMIN", companyId: fixtures.admin.companyId } as any)
      .mockResolvedValueOnce({ id: validCuid, role: "MEMBER", email: "target@test.com", companyId: fixtures.admin.companyId } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({} as any);

    const req = createMockRequest(`http://localhost:3000/api/users/${validCuid}`, { method: "DELETE" });
    const res = await callWith(DELETE, req, validCuid);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.data.archived).toBe(true);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: validCuid },
        data: expect.objectContaining({
          archivedAt: expect.any(Date),
          email: expect.stringContaining("target@test.com"),
        }),
      })
    );
  });

  it("soft delete writes audit log with type archive", async () => {
    mockAuth(fixtures.admin);
    vi.mocked(prisma.user.findFirst)
      .mockResolvedValueOnce({ id: fixtures.admin.userId, email: fixtures.admin.email, role: "ADMIN", companyId: fixtures.admin.companyId } as any)
      .mockResolvedValueOnce({ id: validCuid, role: "MEMBER", email: "target@test.com", companyId: fixtures.admin.companyId } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({} as any);

    const req = createMockRequest(`http://localhost:3000/api/users/${validCuid}`, { method: "DELETE" });
    await callWith(DELETE, req, validCuid);

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user_deactivate",
        metadata: expect.objectContaining({ type: "archive" }),
      })
    );
  });

  it("restores an archived user when email is available", async () => {
    mockAuth(fixtures.admin);
    const archivedEmail = "__archived__clx1abc2def3ghi4jkl5mno6p__target@test.com";
    vi.mocked(prisma.user.findFirst)
      .mockResolvedValueOnce({ id: fixtures.admin.userId, email: fixtures.admin.email, role: "ADMIN", companyId: fixtures.admin.companyId } as any)
      .mockResolvedValueOnce({
        id: validCuid,
        role: "MEMBER",
        email: archivedEmail,
        archivedAt: new Date(),
        companyId: fixtures.admin.companyId,
      } as any)
      .mockResolvedValueOnce(null);
    vi.mocked(prisma.user.update).mockResolvedValue({
      id: validCuid,
      role: "MEMBER",
      email: "target@test.com",
      archivedAt: null,
    } as any);

    const req = createMockRequest(`http://localhost:3000/api/users/${validCuid}`, {
      method: "PATCH",
      body: { archived: false },
    });
    const res = await callWith(PATCH, req, validCuid);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.data.email).toBe("target@test.com");
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: validCuid },
        data: expect.objectContaining({
          archivedAt: null,
          email: "target@test.com",
        }),
      })
    );
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ type: "restore" }),
      })
    );
  });

  it("blocks restore when the original email is already in use", async () => {
    mockAuth(fixtures.admin);
    const archivedEmail = "__archived__clx1abc2def3ghi4jkl5mno6p__target@test.com";
    vi.mocked(prisma.user.findFirst)
      .mockResolvedValueOnce({ id: fixtures.admin.userId, email: fixtures.admin.email, role: "ADMIN", companyId: fixtures.admin.companyId } as any)
      .mockResolvedValueOnce({
        id: validCuid,
        role: "MEMBER",
        email: archivedEmail,
        archivedAt: new Date(),
        companyId: fixtures.admin.companyId,
      } as any)
      .mockResolvedValueOnce({ id: "active-user" } as any);

    const req = createMockRequest(`http://localhost:3000/api/users/${validCuid}`, {
      method: "PATCH",
      body: { archived: false },
    });
    const res = await callWith(PATCH, req, validCuid);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(409);
    expect(body.code).toBe("DUPLICATE");
  });

  it("hard deletes user and cascades related records with ?hard=true", async () => {
    mockAuth(fixtures.admin);
    vi.mocked(prisma.user.findFirst)
      .mockResolvedValueOnce({ id: fixtures.admin.userId, email: fixtures.admin.email, role: "ADMIN", companyId: fixtures.admin.companyId } as any)
      .mockResolvedValueOnce({ id: validCuid, role: "MEMBER", email: "target@test.com", authUserId: null, companyId: fixtures.admin.companyId } as any);

    const req = createMockRequest(`http://localhost:3000/api/users/${validCuid}?hard=true`, { method: "DELETE" });
    const res = await callWith(DELETE, req, validCuid);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.data.deleted).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("hard delete writes audit log with type hard_delete", async () => {
    mockAuth(fixtures.admin);
    vi.mocked(prisma.user.findFirst)
      .mockResolvedValueOnce({ id: fixtures.admin.userId, email: fixtures.admin.email, role: "ADMIN", companyId: fixtures.admin.companyId } as any)
      .mockResolvedValueOnce({ id: validCuid, role: "MEMBER", email: "target@test.com", authUserId: null, companyId: fixtures.admin.companyId } as any);

    const req = createMockRequest(`http://localhost:3000/api/users/${validCuid}?hard=true`, { method: "DELETE" });
    await callWith(DELETE, req, validCuid);

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user_deactivate",
        metadata: expect.objectContaining({ type: "hard_delete" }),
      })
    );
  });

  it("hard delete cleans up AuthUser when no other users reference it", async () => {
    const authUserId = "cauthuser1aaaabbbbccccdddd";
    mockAuth(fixtures.admin);
    vi.mocked(prisma.user.findFirst)
      .mockResolvedValueOnce({ id: fixtures.admin.userId, email: fixtures.admin.email, role: "ADMIN", companyId: fixtures.admin.companyId } as any)
      .mockResolvedValueOnce({ id: validCuid, role: "MEMBER", email: "target@test.com", authUserId, companyId: fixtures.admin.companyId } as any);
    // After hard delete, count remaining users with same authUserId
    vi.mocked(prisma.user.count).mockResolvedValue(0);

    const req = createMockRequest(`http://localhost:3000/api/users/${validCuid}?hard=true`, { method: "DELETE" });
    await callWith(DELETE, req, validCuid);

    // Should have called $transaction twice: once for user deletion, once for AuthUser cleanup
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it("hard delete preserves AuthUser when other users still reference it", async () => {
    const authUserId = "cauthuser1aaaabbbbccccdddd";
    mockAuth(fixtures.admin);
    vi.mocked(prisma.user.findFirst)
      .mockResolvedValueOnce({ id: fixtures.admin.userId, email: fixtures.admin.email, role: "ADMIN", companyId: fixtures.admin.companyId } as any)
      .mockResolvedValueOnce({ id: validCuid, role: "MEMBER", email: "target@test.com", authUserId, companyId: fixtures.admin.companyId } as any);
    // 1 remaining user with same authUserId
    vi.mocked(prisma.user.count).mockResolvedValue(1);

    const req = createMockRequest(`http://localhost:3000/api/users/${validCuid}?hard=true`, { method: "DELETE" });
    await callWith(DELETE, req, validCuid);

    // Should only have one $transaction call (user deletion), no AuthUser cleanup
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("prevents deleting yourself", async () => {
    const adminId = validCuid;
    mockAuth({ ...fixtures.admin, userId: adminId });
    vi.mocked(prisma.user.findFirst)
      .mockResolvedValueOnce({ id: adminId, email: fixtures.admin.email, role: "ADMIN", companyId: fixtures.admin.companyId } as any)
      .mockResolvedValueOnce({ id: adminId, role: "ADMIN", companyId: fixtures.admin.companyId } as any);

    const req = createMockRequest(`http://localhost:3000/api/users/${adminId}`, { method: "DELETE" });
    const res = await callWith(DELETE, req, adminId);
    expect(res.status).toBe(403);
  });

  it("prevents HR from deleting ADMIN", async () => {
    mockAuth(fixtures.hr);
    vi.mocked(prisma.user.findFirst)
      .mockResolvedValueOnce({ id: fixtures.hr.userId, email: fixtures.hr.email, role: "HR", companyId: fixtures.hr.companyId } as any)
      .mockResolvedValueOnce({ id: validCuid, role: "ADMIN", companyId: fixtures.hr.companyId } as any);

    const req = createMockRequest(`http://localhost:3000/api/users/${validCuid}`, { method: "DELETE" });
    const res = await callWith(DELETE, req, validCuid);
    expect(res.status).toBe(403);
  });

  it("returns 404 for user not in company", async () => {
    mockAuth(fixtures.admin);
    vi.mocked(prisma.user.findFirst)
      .mockResolvedValueOnce({ id: fixtures.admin.userId, email: fixtures.admin.email, role: "ADMIN", companyId: fixtures.admin.companyId } as any)
      .mockResolvedValueOnce(null);

    const req = createMockRequest(`http://localhost:3000/api/users/${validCuid}`, { method: "DELETE" });
    const res = await callWith(DELETE, req, validCuid);
    expect(res.status).toBe(404);
  });
});
