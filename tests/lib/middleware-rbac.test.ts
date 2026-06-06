import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// Override the global setup.ts mocks for api-auth and rate-limit
vi.mock("@/lib/api-auth", () => ({
  requireAuth: vi.fn(),
  isAuthError: vi.fn((result: unknown) => result instanceof NextResponse),
}));

const { requireAuth } = await import("@/lib/api-auth");
const { withRBAC, withAdminOrHR, withAdmin } = await import("@/lib/middleware/rbac");

function makeRequest(url = "http://localhost:3000/api/test") {
  return new NextRequest(url);
}

describe("withRBAC", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows request when user has required role", async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      userId: "u1",
      email: "admin@test.com",
      role: "ADMIN",
      companyId: "co-1",
    });

    const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));
    const wrapped = withRBAC(handler, { requiredRoles: ["ADMIN", "HR"] });

    const res = await wrapped(makeRequest(), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        auth: expect.objectContaining({ role: "ADMIN" }),
      })
    );
  });

  it("returns 403 when user role is not allowed", async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      userId: "u1",
      email: "emp@test.com",
      role: "MEMBER",
      companyId: "co-1",
    });

    const handler = vi.fn();
    const wrapped = withRBAC(handler, { requiredRoles: ["ADMIN"] });

    const res = await wrapped(makeRequest(), { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns 401 when user is unauthenticated", async () => {
    const unauth = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    vi.mocked(requireAuth).mockResolvedValue(unauth as any);

    const handler = vi.fn();
    const wrapped = withRBAC(handler, { requiredRoles: ["ADMIN"] });

    const res = await wrapped(makeRequest(), { params: Promise.resolve({}) });
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("passes resolved params to handler", async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      userId: "u1",
      email: "a@t.com",
      role: "ADMIN",
      companyId: "co-1",
    });

    const handler = vi.fn().mockResolvedValue(NextResponse.json({}));
    const wrapped = withRBAC(handler, { requiredRoles: ["ADMIN"] });

    await wrapped(makeRequest(), { params: Promise.resolve({ id: "123" }) });
    expect(handler).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ params: { id: "123" } })
    );
  });
});

describe("withAdminOrHR", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows ADMIN role", async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      userId: "u1", email: "a@t.com", role: "ADMIN", companyId: "co-1",
    });
    const handler = vi.fn().mockResolvedValue(NextResponse.json({}));
    const wrapped = withAdminOrHR(handler);

    const res = await wrapped(makeRequest(), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
  });

  it("allows HR role", async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      userId: "u1", email: "hr@t.com", role: "HR", companyId: "co-1",
    });
    const handler = vi.fn().mockResolvedValue(NextResponse.json({}));
    const wrapped = withAdminOrHR(handler);

    const res = await wrapped(makeRequest(), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
  });

  it("rejects MEMBER role", async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      userId: "u1", email: "e@t.com", role: "MEMBER", companyId: "co-1",
    });
    const handler = vi.fn();
    const wrapped = withAdminOrHR(handler);

    const res = await wrapped(makeRequest(), { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
  });
});

describe("withAdmin", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects HR role", async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      userId: "u1", email: "hr@t.com", role: "HR", companyId: "co-1",
    });
    const handler = vi.fn();
    const wrapped = withAdmin(handler);

    const res = await wrapped(makeRequest(), { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
  });
});

