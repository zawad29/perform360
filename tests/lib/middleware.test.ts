import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { withRBAC, withAdminOrHR, withAdmin } from "@/lib/middleware/rbac";
import { withCompanyScope } from "@/lib/middleware/company-scope";

function makeReq(url = "http://localhost:3000/test", method = "GET") {
  return new NextRequest(url, {
    method,
    headers: { "x-forwarded-for": "127.0.0.1" },
  });
}

function setupAuth(role: "ADMIN" | "HR" | "MEMBER" | "EXTERNAL") {
  vi.mocked(auth).mockResolvedValue({
    user: { email: `${role.toLowerCase()}@test.com`, companyId: "c1" },
  } as any);
  vi.mocked(prisma.user.findFirst).mockResolvedValue({
    id: `u-${role}`,
    email: `${role.toLowerCase()}@test.com`,
    role,
    companyId: "c1",
  } as any);
}

describe("middleware/rbac", () => {
  beforeEach(() => vi.clearAllMocks());

  const dummyHandler = vi.fn().mockImplementation(
    async (_req: NextRequest, ctx: { params: Record<string, string>; auth: unknown }) =>
      NextResponse.json({ ok: true, auth: ctx.auth })
  );

  it("withRBAC passes for allowed role", async () => {
    setupAuth("HR");
    const wrapped = withRBAC(dummyHandler, { requiredRoles: ["ADMIN", "HR"] });
    const res = await wrapped(makeReq(), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    expect(dummyHandler).toHaveBeenCalled();
  });

  it("withRBAC returns 403 for disallowed role", async () => {
    setupAuth("MEMBER");
    const wrapped = withRBAC(dummyHandler, { requiredRoles: ["ADMIN"] });
    const res = await wrapped(makeReq(), { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
    expect(dummyHandler).not.toHaveBeenCalled();
  });

  it("withRBAC returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const wrapped = withRBAC(dummyHandler, { requiredRoles: ["ADMIN"] });
    const res = await wrapped(makeReq(), { params: Promise.resolve({}) });
    expect(res.status).toBe(401);
  });

  it("withAdminOrHR allows HR", async () => {
    setupAuth("HR");
    const wrapped = withAdminOrHR(dummyHandler);
    const res = await wrapped(makeReq(), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
  });

  it("withAdmin rejects HR", async () => {
    setupAuth("HR");
    const wrapped = withAdmin(dummyHandler);
    const res = await wrapped(makeReq(), { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
  });

  it("withAdminOrHR rejects EXTERNAL", async () => {
    setupAuth("EXTERNAL");
    const wrapped = withAdminOrHR(dummyHandler);
    const res = await wrapped(makeReq(), { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
    expect(dummyHandler).not.toHaveBeenCalled();
  });
});

describe("middleware/company-scope", () => {
  beforeEach(() => vi.clearAllMocks());

  const dummyHandler = vi.fn().mockImplementation(
    async (_req: NextRequest, _ctx: { params: Record<string, string>; auth: unknown }) =>
      NextResponse.json({ ok: true })
  );

  it("passes without resource model check", async () => {
    setupAuth("ADMIN");
    const wrapped = withCompanyScope(dummyHandler);
    const res = await wrapped(makeReq(), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    expect(dummyHandler).toHaveBeenCalled();
  });

  it("verifies team resource ownership", async () => {
    setupAuth("ADMIN");
    vi.mocked(prisma.team.findFirst).mockResolvedValue({ id: "t1" } as any);

    const wrapped = withCompanyScope(dummyHandler, {
      resourceModel: "team",
    });
    const res = await wrapped(makeReq(), { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(200);
  });

  it("returns 404 when resource not in company", async () => {
    setupAuth("ADMIN");
    vi.mocked(prisma.team.findFirst).mockResolvedValue(null);

    const wrapped = withCompanyScope(dummyHandler, {
      resourceModel: "team",
    });
    const res = await wrapped(makeReq(), { params: Promise.resolve({ id: "t-other" }) });
    expect(res.status).toBe(404);
    expect(dummyHandler).not.toHaveBeenCalled();
  });

  it("verifies evaluationCycle resource ownership", async () => {
    setupAuth("HR");
    vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue({ id: "cy1" } as any);

    const wrapped = withCompanyScope(dummyHandler, {
      resourceModel: "evaluationCycle",
    });
    const res = await wrapped(makeReq(), { params: Promise.resolve({ id: "cy1" }) });
    expect(res.status).toBe(200);
  });

  it("verifies evaluationTemplate resource ownership", async () => {
    setupAuth("HR");
    vi.mocked(prisma.evaluationTemplate.findFirst).mockResolvedValue({ id: "tmpl1" } as any);

    const wrapped = withCompanyScope(dummyHandler, {
      resourceModel: "evaluationTemplate",
      resourceParamKey: "id",
    });
    const res = await wrapped(makeReq(), { params: Promise.resolve({ id: "tmpl1" }) });
    expect(res.status).toBe(200);
  });
});
