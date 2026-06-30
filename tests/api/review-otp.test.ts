import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { parseResponse } from "../helpers";

const { POST: sendOTP } = await import(
  "@/app/api/review/[token]/otp/send/route"
);
const { POST: verifyOTP } = await import(
  "@/app/api/review/[token]/otp/verify/route"
);

const SUMMARY_TOKEN = "summary-tok-xyz";

function makeRequest(
  url: string,
  opts: { method?: string; body?: unknown; cookies?: Record<string, string> } = {}
) {
  const { method = "POST", body, cookies = {} } = opts;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-forwarded-for": "127.0.0.1",
  };
  if (Object.keys(cookies).length > 0) {
    headers.cookie = Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }
  return new NextRequest(url, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

// ─── OTP Send ───

describe("Review OTP send (POST /api/review/[token]/otp/send)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends OTP email to reviewer", async () => {
    vi.mocked(prisma.cycleReviewerLink.findUnique).mockResolvedValue({
      id: "rl-1",
      token: SUMMARY_TOKEN,
      reviewerId: "r1",
      cycle: { status: "ACTIVE" },
    } as any);

    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      email: "reviewer@test.com",
      name: "Reviewer",
    } as any);

    vi.mocked(prisma.otpSession.count).mockResolvedValue(0);
    vi.mocked(prisma.otpSession.create).mockResolvedValue({} as any);

    const req = makeRequest(
      `http://localhost:3000/api/review/${SUMMARY_TOKEN}/otp/send`,
    );
    const res = await sendOTP(req, { params: Promise.resolve({ token: SUMMARY_TOKEN }) });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.data.sent).toBe(true);
    expect(sendEmail).toHaveBeenCalled();
    expect(prisma.otpSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reviewerLinkId: "rl-1" }),
      })
    );
  });

  it("returns 404 for invalid summary token", async () => {
    vi.mocked(prisma.cycleReviewerLink.findUnique).mockResolvedValue(null);

    const req = makeRequest(
      "http://localhost:3000/api/review/bad-token/otp/send",
    );
    const res = await sendOTP(req, { params: Promise.resolve({ token: "bad-token" }) });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(404);
    expect(body.code).toBe("INVALID_TOKEN");
  });

  it("returns 410 for inactive cycle", async () => {
    vi.mocked(prisma.cycleReviewerLink.findUnique).mockResolvedValue({
      id: "rl-1",
      token: SUMMARY_TOKEN,
      reviewerId: "r1",
      cycle: { status: "CLOSED" },
    } as any);

    const req = makeRequest(
      `http://localhost:3000/api/review/${SUMMARY_TOKEN}/otp/send`,
    );
    const res = await sendOTP(req, { params: Promise.resolve({ token: SUMMARY_TOKEN }) });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(410);
    expect(body.code).toBe("CYCLE_INACTIVE");
  });

  it("rate-limits OTP sends", async () => {
    vi.mocked(prisma.cycleReviewerLink.findUnique).mockResolvedValue({
      id: "rl-1",
      token: SUMMARY_TOKEN,
      reviewerId: "r1",
      cycle: { status: "ACTIVE" },
    } as any);

    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      email: "reviewer@test.com",
      name: "Reviewer",
    } as any);

    vi.mocked(prisma.otpSession.count).mockResolvedValue(10); // over limit

    const req = makeRequest(
      `http://localhost:3000/api/review/${SUMMARY_TOKEN}/otp/send`,
    );
    const res = await sendOTP(req, { params: Promise.resolve({ token: SUMMARY_TOKEN }) });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(429);
    expect(body.code).toBe("RATE_LIMITED");
  });

  it("reuses an existing verified session without sending another email", async () => {
    vi.mocked(prisma.cycleReviewerLink.findUnique).mockResolvedValue({
      id: "rl-1",
      token: SUMMARY_TOKEN,
      reviewerId: "r1",
      cycle: { status: "ACTIVE" },
    } as any);

    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      email: "reviewer@test.com",
      name: "Reviewer",
    } as any);

    vi.mocked(prisma.otpSession.findFirst).mockResolvedValue({
      id: "otp-existing",
      sessionToken: "session-token",
      sessionExpiry: new Date(Date.now() + 60_000),
      verifiedAt: new Date(),
    } as any);

    const req = makeRequest(
      `http://localhost:3000/api/review/${SUMMARY_TOKEN}/otp/send`,
    );
    const res = await sendOTP(req, { params: Promise.resolve({ token: SUMMARY_TOKEN }) });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.data).toEqual({ sent: false, alreadyVerified: true });
    expect(prisma.otpSession.count).not.toHaveBeenCalled();
    expect(prisma.otpSession.create).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

// ─── OTP Verify ───

describe("Review OTP verify (POST /api/review/[token]/otp/verify)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects invalid OTP format", async () => {
    const req = makeRequest(
      `http://localhost:3000/api/review/${SUMMARY_TOKEN}/otp/verify`,
      { body: { otp: "abc" } }
    );
    const res = await verifyOTP(req, { params: Promise.resolve({ token: SUMMARY_TOKEN }) });
    const { status } = await parseResponse(res);

    expect(status).toBe(400);
  });

  it("returns 404 for unknown summary token", async () => {
    vi.mocked(prisma.cycleReviewerLink.findUnique).mockResolvedValue(null);

    const req = makeRequest(
      "http://localhost:3000/api/review/unknown/otp/verify",
      { body: { otp: "123456" } }
    );
    const res = await verifyOTP(req, { params: Promise.resolve({ token: "unknown" }) });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(404);
    expect(body.code).toBe("INVALID_TOKEN");
  });

  it("returns NO_OTP when no OTP session exists", async () => {
    vi.mocked(prisma.cycleReviewerLink.findUnique).mockResolvedValue({
      id: "rl-1",
    } as any);
    vi.mocked(prisma.otpSession.findFirst).mockResolvedValue(null);

    const req = makeRequest(
      `http://localhost:3000/api/review/${SUMMARY_TOKEN}/otp/verify`,
      { body: { otp: "123456" } }
    );
    const res = await verifyOTP(req, { params: Promise.resolve({ token: SUMMARY_TOKEN }) });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(400);
    expect(body.code).toBe("NO_OTP");
  });

  it("returns OTP_EXPIRED for expired OTP", async () => {
    vi.mocked(prisma.cycleReviewerLink.findUnique).mockResolvedValue({
      id: "rl-1",
    } as any);
    vi.mocked(prisma.otpSession.findFirst).mockResolvedValue({
      id: "otp-1",
      otpHash: "hash",
      expiresAt: new Date(Date.now() - 60_000), // expired
      cooldownUntil: null,
      attempts: 0,
    } as any);

    const req = makeRequest(
      `http://localhost:3000/api/review/${SUMMARY_TOKEN}/otp/verify`,
      { body: { otp: "123456" } }
    );
    const res = await verifyOTP(req, { params: Promise.resolve({ token: SUMMARY_TOKEN }) });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(410);
    expect(body.code).toBe("OTP_EXPIRED");
  });

  it("returns COOLDOWN when in cooldown period", async () => {
    vi.mocked(prisma.cycleReviewerLink.findUnique).mockResolvedValue({
      id: "rl-1",
    } as any);
    vi.mocked(prisma.otpSession.findFirst).mockResolvedValue({
      id: "otp-1",
      otpHash: "hash",
      expiresAt: new Date(Date.now() + 600_000),
      cooldownUntil: new Date(Date.now() + 300_000), // 5 min cooldown
      attempts: 3,
    } as any);

    const req = makeRequest(
      `http://localhost:3000/api/review/${SUMMARY_TOKEN}/otp/verify`,
      { body: { otp: "123456" } }
    );
    const res = await verifyOTP(req, { params: Promise.resolve({ token: SUMMARY_TOKEN }) });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(429);
    expect(body.code).toBe("COOLDOWN");
    expect(body.cooldown).toBeGreaterThan(0);
  });
});
