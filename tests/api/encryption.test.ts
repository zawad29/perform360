import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getDataKeyFromRequest } from "@/lib/encryption-session";
import { parseResponse } from "../helpers";

const unlockRoute = await import("@/app/api/encryption/unlock/route");
const statusRoute = await import("@/app/api/encryption/status/route");
const hardResetRoute = await import("@/app/api/encryption/hard-reset/route");

function setupAuth(role: "ADMIN" | "HR" | "MEMBER" = "ADMIN") {
  vi.mocked(auth).mockResolvedValue({
    user: { email: `${role.toLowerCase()}@test.com`, companyId: "c1" },
  } as any);
  vi.mocked(prisma.user.findFirst).mockResolvedValue({
    id: "u1", email: `${role.toLowerCase()}@test.com`, role, companyId: "c1",
  } as any);
}

function makeReq(url: string, opts: { method?: string; body?: unknown } = {}) {
  const { method = "GET", body } = opts;
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json", "x-forwarded-for": "127.0.0.1" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe("POST /api/encryption/unlock", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const req = makeReq("http://localhost:3000/api/encryption/unlock", {
      method: "POST",
      body: { passphrase: "test" },
    });
    const res = await unlockRoute.POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 when MEMBER tries to unlock", async () => {
    setupAuth("MEMBER");
    const req = makeReq("http://localhost:3000/api/encryption/unlock", {
      method: "POST",
      body: { passphrase: "test" },
    });
    const res = await unlockRoute.POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 when encryption not set up", async () => {
    setupAuth("ADMIN");
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      encryptionKeyEncrypted: null,
      encryptionSalt: null,
      encryptionSetupAt: null,
    } as any);

    const req = makeReq("http://localhost:3000/api/encryption/unlock", {
      method: "POST",
      body: { passphrase: "test" },
    });
    const res = await unlockRoute.POST(req);
    const { status, body } = await parseResponse(res);
    expect(status).toBe(400);
    expect(body.error).toContain("not set up");
  });

  it("returns 400 for empty passphrase", async () => {
    setupAuth("ADMIN");
    const req = makeReq("http://localhost:3000/api/encryption/unlock", {
      method: "POST",
      body: { passphrase: "" },
    });
    const res = await unlockRoute.POST(req);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/encryption/unlock (check cookie)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns unlocked: false when no cookie", async () => {
    setupAuth("ADMIN");
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      encryptionSetupAt: new Date("2025-01-01"),
      keyVersion: 2,
    } as any);
    vi.mocked(getDataKeyFromRequest).mockReturnValue(null);

    const req = makeReq("http://localhost:3000/api/encryption/unlock");
    const res = await unlockRoute.GET(req);
    const { status, body } = await parseResponse(res);
    expect(status).toBe(200);
    expect(body.data.unlocked).toBe(false);
  });

  it("returns unlocked: true when cookie present", async () => {
    setupAuth("HR");
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      encryptionSetupAt: new Date("2025-01-01"),
      keyVersion: 3,
    } as any);
    vi.mocked(getDataKeyFromRequest).mockReturnValue(Buffer.alloc(32, "k"));

    const req = makeReq("http://localhost:3000/api/encryption/unlock");
    const res = await unlockRoute.GET(req);
    const { body } = await parseResponse(res);
    expect(body.data.unlocked).toBe(true);
  });
});

describe("POST /api/encryption/hard-reset", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when confirmation text is wrong", async () => {
    setupAuth("ADMIN");
    const req = makeReq("http://localhost:3000/api/encryption/hard-reset", {
      method: "POST",
      body: {
        newPassphrase: "brand-new-secret",
        confirmNewPassphrase: "brand-new-secret",
        confirmationText: "RESET",
      },
    });

    const res = await hardResetRoute.POST(req);
    const { status, body } = await parseResponse(res);
    expect(status).toBe(400);
    expect(body.error).toContain("RESET ENCRYPTION");
  });

  it("hard resets encryption, rotates key version, and clears the unlock cookie", async () => {
    setupAuth("ADMIN");

    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      encryptionSetupAt: new Date("2025-01-01"),
      keyVersion: 2,
    } as any);

    const tx = {
      company: { update: vi.fn().mockResolvedValue(undefined) },
      recoveryCode: {
        deleteMany: vi.fn().mockResolvedValue({ count: 8 }),
        createMany: vi.fn().mockResolvedValue({ count: 8 }),
      },
      evaluationCycle: {
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementation(async (cb: unknown) => {
      if (typeof cb !== "function") throw new Error("Expected transaction callback");
      return cb(tx as any);
    });

    const req = makeReq("http://localhost:3000/api/encryption/hard-reset", {
      method: "POST",
      body: {
        newPassphrase: "brand-new-secret",
        confirmNewPassphrase: "brand-new-secret",
        confirmationText: "RESET ENCRYPTION",
      },
    });

    const res = await hardResetRoute.POST(req);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.keyVersion).toBe(3);
    expect(body.data.recoveryCodes).toHaveLength(8);
    expect(tx.company.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          keyVersion: 3,
        }),
      })
    );
    expect(tx.evaluationCycle.updateMany).toHaveBeenCalled();
    expect(res.headers.get("set-cookie")).toContain("_enc_dk=");
  });
});

describe("GET /api/encryption/status", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns encryption status for authenticated user", async () => {
    setupAuth("ADMIN");
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      encryptionSetupAt: new Date("2025-01-01"),
      keyVersion: 2,
    } as any);
    vi.mocked(prisma.recoveryCode.count).mockResolvedValue(5);

    const req = makeReq("http://localhost:3000/api/encryption/status");
    const res = await statusRoute.GET(req);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.data.isSetup).toBe(true);
    expect(body.data.keyVersion).toBe(2);
    expect(body.data.remainingRecoveryCodes).toBe(5);
  });

  it("returns 404 when company not found", async () => {
    setupAuth("ADMIN");
    vi.mocked(prisma.company.findUnique).mockResolvedValue(null);

    const req = makeReq("http://localhost:3000/api/encryption/status");
    const res = await statusRoute.GET(req);
    expect(res.status).toBe(404);
  });

  it("returns isSetup: false when encryption not configured", async () => {
    setupAuth("MEMBER");
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      encryptionSetupAt: null,
      keyVersion: 0,
    } as any);
    vi.mocked(prisma.recoveryCode.count).mockResolvedValue(0);

    const req = makeReq("http://localhost:3000/api/encryption/status");
    const res = await statusRoute.GET(req);
    const { body } = await parseResponse(res);
    expect(body.data.isSetup).toBe(false);
  });
});
