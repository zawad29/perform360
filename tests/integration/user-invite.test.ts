import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { mockAuth, fixtures, createMockRequest, parseResponse } from "../helpers";

const { POST } = await import("@/app/api/users/invite/route");

describe("Integration: User Invite Workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ADMIN invites a new HR user and email is sent", async () => {
    mockAuth(fixtures.admin);
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(
      { id: fixtures.admin.userId, email: fixtures.admin.email, role: "ADMIN", companyId: fixtures.admin.companyId } as any
    ).mockResolvedValueOnce(null);
    vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
      if (typeof cb === "function") {
        return cb({
          authUser: { upsert: vi.fn().mockResolvedValue({ id: "auth-u1", email: "new@test.com" }) },
          user: {
            create: vi.fn().mockResolvedValue({
              id: "user-new",
              email: "new@test.com",
              name: "New User",
              role: "HR",
              companyId: fixtures.admin.companyId,
            }),
          },
        });
      }
      return null;
    });
    vi.mocked(prisma.company.findUnique).mockResolvedValue({ id: fixtures.admin.companyId, name: "Acme" } as any);

    const req = createMockRequest("http://localhost:3000/api/users/invite", {
      method: "POST",
      body: { name: "New User", email: "new@test.com", role: "HR" },
    });
    const res = await POST(req as any);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.emailSent).toBe(true);
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user_invite",
        metadata: expect.objectContaining({ email: "new@test.com", role: "HR" }),
      })
    );
    expect(sendEmail).toHaveBeenCalled();
  });

  it("ADMIN invites a MEMBER — no welcome email sent", async () => {
    mockAuth(fixtures.admin);
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(
      { id: fixtures.admin.userId, email: fixtures.admin.email, role: "ADMIN", companyId: fixtures.admin.companyId } as any
    ).mockResolvedValueOnce(null);
    vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
      if (typeof cb === "function") {
        return cb({
          authUser: { upsert: vi.fn().mockResolvedValue({ id: "auth-u1", email: "emp@test.com" }) },
          user: {
            create: vi.fn().mockResolvedValue({
              id: "user-emp",
              email: "emp@test.com",
              name: "Employee",
              role: "MEMBER",
              companyId: fixtures.admin.companyId,
            }),
          },
        });
      }
      return null;
    });

    const req = createMockRequest("http://localhost:3000/api/users/invite", {
      method: "POST",
      body: { name: "Employee", email: "emp@test.com", role: "MEMBER" },
    });
    const res = await POST(req as any);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.emailSent).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("ADMIN invites EXTERNAL — no welcome email sent", async () => {
    mockAuth(fixtures.admin);
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(
      { id: fixtures.admin.userId, email: fixtures.admin.email, role: "ADMIN", companyId: fixtures.admin.companyId } as any
    ).mockResolvedValueOnce(null);
    vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
      if (typeof cb === "function") {
        return cb({
          authUser: { upsert: vi.fn().mockResolvedValue({ id: "auth-ext", email: "ext@test.com" }) },
          user: {
            create: vi.fn().mockResolvedValue({
              id: "user-ext",
              email: "ext@test.com",
              name: "External User",
              role: "EXTERNAL",
              companyId: fixtures.admin.companyId,
            }),
          },
        });
      }
      return null;
    });

    const req = createMockRequest("http://localhost:3000/api/users/invite", {
      method: "POST",
      body: { name: "External User", email: "ext@test.com", role: "EXTERNAL" },
    });
    const res = await POST(req as any);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.emailSent).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("rejects duplicate email in same company", async () => {
    mockAuth(fixtures.admin);
    // First findFirst = auth lookup, second = duplicate check returns existing user
    vi.mocked(prisma.user.findFirst)
      .mockResolvedValueOnce({ id: fixtures.admin.userId, email: fixtures.admin.email, role: "ADMIN", companyId: fixtures.admin.companyId } as any)
      .mockResolvedValueOnce({ id: "existing", email: "dup@test.com" } as any);

    const req = createMockRequest("http://localhost:3000/api/users/invite", {
      method: "POST",
      body: { name: "Dupe", email: "dup@test.com", role: "MEMBER" },
    });
    const res = await POST(req as any);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(409);
    expect(body.code).toBe("DUPLICATE");
  });

  it("HR cannot assign ADMIN role", async () => {
    mockAuth(fixtures.hr);

    const req = createMockRequest("http://localhost:3000/api/users/invite", {
      method: "POST",
      body: { name: "Admin", email: "admin2@test.com", role: "ADMIN" },
    });
    const res = await POST(req as any);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(403);
    expect(body.code).toBe("FORBIDDEN");
  });

  it("ADMIN can assign ADMIN role", async () => {
    mockAuth(fixtures.admin);
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(
      { id: fixtures.admin.userId, email: fixtures.admin.email, role: "ADMIN", companyId: fixtures.admin.companyId } as any
    ).mockResolvedValueOnce(null);
    vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
      if (typeof cb === "function") {
        return cb({
          authUser: { upsert: vi.fn().mockResolvedValue({ id: "auth-u2" }) },
          user: {
            create: vi.fn().mockResolvedValue({
              id: "user-admin2",
              email: "admin2@test.com",
              name: "Admin 2",
              role: "ADMIN",
              companyId: fixtures.admin.companyId,
            }),
          },
        });
      }
      return null;
    });
    vi.mocked(prisma.company.findUnique).mockResolvedValue({ id: fixtures.admin.companyId, name: "Acme" } as any);

    const req = createMockRequest("http://localhost:3000/api/users/invite", {
      method: "POST",
      body: { name: "Admin 2", email: "admin2@test.com", role: "ADMIN" },
    });
    const res = await POST(req as any);
    const { status } = await parseResponse(res);

    expect(status).toBe(201);
  });

  it("MEMBER cannot invite users", async () => {
    mockAuth(fixtures.employee);

    const req = createMockRequest("http://localhost:3000/api/users/invite", {
      method: "POST",
      body: { name: "User", email: "user@test.com", role: "MEMBER" },
    });
    const res = await POST(req as any);
    const { status } = await parseResponse(res);

    expect(status).toBe(403);
  });

  it("handles email send failure gracefully", async () => {
    mockAuth(fixtures.admin);
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(
      { id: fixtures.admin.userId, email: fixtures.admin.email, role: "ADMIN", companyId: fixtures.admin.companyId } as any
    ).mockResolvedValueOnce(null);
    vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
      if (typeof cb === "function") {
        return cb({
          authUser: { upsert: vi.fn().mockResolvedValue({ id: "auth-u3" }) },
          user: {
            create: vi.fn().mockResolvedValue({
              id: "user-fail",
              email: "fail@test.com",
              name: "Fail",
              role: "HR",
              companyId: fixtures.admin.companyId,
            }),
          },
        });
      }
      return null;
    });
    vi.mocked(prisma.company.findUnique).mockResolvedValue({ id: fixtures.admin.companyId, name: "Acme" } as any);
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error("SMTP failure"));

    const req = createMockRequest("http://localhost:3000/api/users/invite", {
      method: "POST",
      body: { name: "Fail", email: "fail@test.com", role: "HR" },
    });
    const res = await POST(req as any);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.emailSent).toBe(false);
  });
});
