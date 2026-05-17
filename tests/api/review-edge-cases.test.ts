import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { parseResponse } from "../helpers";
import { validateEvaluationSession } from "@/lib/session-validation";
import "@/lib/email";
import { NextRequest } from "next/server";

const { GET: validateToken, POST: submitEvaluation } = await import(
  "@/app/api/evaluate/[token]/route"
);
const { POST: sendOTP } = await import(
  "@/app/api/evaluate/[token]/otp/send/route"
);
const { POST: verifyOTP } = await import(
  "@/app/api/evaluate/[token]/otp/verify/route"
);

const TOKEN = "review-edge-token";

function makeRequest(
  url: string,
  opts: { method?: string; body?: Record<string, unknown>; cookies?: Record<string, string> } = {}
): NextRequest {
  const { method = "GET", body, cookies = {} } = opts;
  const headers = new Headers({ "content-type": "application/json", "x-forwarded-for": "127.0.0.1" });
  const cookieStr = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
  if (cookieStr) headers.set("cookie", cookieStr);

  return new NextRequest(url, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe("GET /api/evaluate/[token] — token validation edge cases", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 410 for inactive cycle", async () => {
    vi.mocked(prisma.evaluationAssignment.findUnique).mockResolvedValue({
      id: "a1",
      token: TOKEN,
      status: "PENDING",
      reviewerId: "r1",
      subjectId: "s1",
      cycle: { name: "Q1", status: "CLOSED", endDate: new Date("2027-01-01") },
    } as any);

    const req = makeRequest(`http://localhost:3000/api/evaluate/${TOKEN}`);
    const res = await validateToken(req, { params: Promise.resolve({ token: TOKEN }) });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(410);
    expect(body.code).toBe("CYCLE_INACTIVE");
  });

  it("returns 410 for already submitted assignment", async () => {
    vi.mocked(prisma.evaluationAssignment.findUnique).mockResolvedValue({
      id: "a1",
      token: TOKEN,
      status: "SUBMITTED",
      reviewerId: "r1",
      subjectId: "s1",
      cycle: { name: "Q1", status: "ACTIVE", endDate: new Date("2027-01-01") },
    } as any);

    const req = makeRequest(`http://localhost:3000/api/evaluate/${TOKEN}`);
    const res = await validateToken(req, { params: Promise.resolve({ token: TOKEN }) });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(410);
    expect(body.code).toBe("ALREADY_SUBMITTED");
  });


  it("returns 404 for invalid token", async () => {
    vi.mocked(prisma.evaluationAssignment.findUnique).mockResolvedValue(null);

    const req = makeRequest(`http://localhost:3000/api/evaluate/bad-token`);
    const res = await validateToken(req, { params: Promise.resolve({ token: "bad-token" }) });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(404);
    expect(body.code).toBe("INVALID_TOKEN");
  });
});

describe("POST /api/evaluate/[token]/otp/send — OTP send edge cases", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 429 when rate limit exceeded (5 OTPs/hour)", async () => {
    vi.mocked(prisma.evaluationAssignment.findUnique).mockResolvedValue({
      id: "a1",
      token: TOKEN,
      status: "PENDING",
      reviewerId: "r1",
      cycle: { status: "ACTIVE", companyId: "co-1" },
    } as any);

    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      email: "reviewer@test.com",
      name: "Reviewer",
    } as any);

    // 5 sends in last hour (rate limit)
    vi.mocked(prisma.otpSession.count).mockResolvedValue(5);

    const req = makeRequest(`http://localhost:3000/api/evaluate/${TOKEN}/otp/send`, {
      method: "POST",
    });
    const res = await sendOTP(req, { params: Promise.resolve({ token: TOKEN }) });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(429);
    expect(body.code).toBe("RATE_LIMITED");
  });

  it("returns 410 for already submitted assignment", async () => {
    vi.mocked(prisma.evaluationAssignment.findUnique).mockResolvedValue({
      id: "a1",
      token: TOKEN,
      status: "SUBMITTED",
      reviewerId: "r1",
      cycle: { status: "ACTIVE", companyId: "co-1" },
    } as any);

    const req = makeRequest(`http://localhost:3000/api/evaluate/${TOKEN}/otp/send`, {
      method: "POST",
    });
    const res = await sendOTP(req, { params: Promise.resolve({ token: TOKEN }) });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(410);
    expect(body.code).toBe("ALREADY_SUBMITTED");
  });
});

describe("POST /api/evaluate/[token]/otp/verify — OTP verify edge cases", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 for invalid OTP format (non-numeric)", async () => {
    const req = makeRequest(`http://localhost:3000/api/evaluate/${TOKEN}/otp/verify`, {
      method: "POST",
      body: { otp: "abcdef" },
    });
    const res = await verifyOTP(req, { params: Promise.resolve({ token: TOKEN }) });
    const { status } = await parseResponse(res);

    expect(status).toBe(400);
  });

  it("returns 400 for OTP with wrong length", async () => {
    const req = makeRequest(`http://localhost:3000/api/evaluate/${TOKEN}/otp/verify`, {
      method: "POST",
      body: { otp: "12345" },
    });
    const res = await verifyOTP(req, { params: Promise.resolve({ token: TOKEN }) });
    const { status } = await parseResponse(res);

    expect(status).toBe(400);
  });

  it("returns 400 when no OTP session exists", async () => {
    vi.mocked(prisma.evaluationAssignment.findUnique).mockResolvedValue({
      id: "a1",
    } as any);
    vi.mocked(prisma.otpSession.findFirst).mockResolvedValue(null);

    const req = makeRequest(`http://localhost:3000/api/evaluate/${TOKEN}/otp/verify`, {
      method: "POST",
      body: { otp: "123456" },
    });
    const res = await verifyOTP(req, { params: Promise.resolve({ token: TOKEN }) });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(400);
    expect(body.code).toBe("NO_OTP");
  });

  it("returns 410 for expired OTP", async () => {
    vi.mocked(prisma.evaluationAssignment.findUnique).mockResolvedValue({
      id: "a1",
    } as any);
    vi.mocked(prisma.otpSession.findFirst).mockResolvedValue({
      id: "otp-1",
      otpHash: "hash",
      expiresAt: new Date(Date.now() - 60_000), // expired
      attempts: 0,
      cooldownUntil: null,
    } as any);

    const req = makeRequest(`http://localhost:3000/api/evaluate/${TOKEN}/otp/verify`, {
      method: "POST",
      body: { otp: "123456" },
    });
    const res = await verifyOTP(req, { params: Promise.resolve({ token: TOKEN }) });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(410);
    expect(body.code).toBe("OTP_EXPIRED");
  });

  it("returns 429 when in cooldown", async () => {
    vi.mocked(prisma.evaluationAssignment.findUnique).mockResolvedValue({
      id: "a1",
    } as any);
    vi.mocked(prisma.otpSession.findFirst).mockResolvedValue({
      id: "otp-1",
      otpHash: "hash",
      expiresAt: new Date(Date.now() + 600_000),
      attempts: 3,
      cooldownUntil: new Date(Date.now() + 300_000), // 5 min cooldown remaining
    } as any);

    const req = makeRequest(`http://localhost:3000/api/evaluate/${TOKEN}/otp/verify`, {
      method: "POST",
      body: { otp: "123456" },
    });
    const res = await verifyOTP(req, { params: Promise.resolve({ token: TOKEN }) });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(429);
    expect(body.code).toBe("COOLDOWN");
  });
});

describe("POST /api/evaluate/[token] — submission edge cases", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when no session cookie", async () => {
    const req = makeRequest(`http://localhost:3000/api/evaluate/${TOKEN}`, {
      method: "POST",
      body: { answers: { q1: 5 } },
    });
    const res = await submitEvaluation(req, { params: Promise.resolve({ token: TOKEN }) });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(401);
    expect(body.code).toBe("NO_SESSION");
  });

  it("returns 400 for missing answers object", async () => {
    vi.mocked(validateEvaluationSession).mockResolvedValue({
      ok: true,
      session: {
        type: "direct",
        assignment: {
          id: "a1",
          status: "PENDING",
          reviewerId: "r1",
          subjectId: "s1",
          templateId: "tpl-1",
          cycleId: "c1",
          cycle: { status: "ACTIVE", companyId: "co-1" },
        } as any,
      },
    });

    const req = makeRequest(`http://localhost:3000/api/evaluate/${TOKEN}`, {
      method: "POST",
      body: {},
      cookies: { evaluation_session: "valid-session" },
    });
    const res = await submitEvaluation(req, { params: Promise.resolve({ token: TOKEN }) });
    const { status } = await parseResponse(res);

    expect(status).toBe(400);
  });

  it("returns 410 for already-submitted assignment via session", async () => {
    vi.mocked(validateEvaluationSession).mockResolvedValue({
      ok: true,
      session: {
        type: "direct",
        assignment: {
          id: "a1",
          status: "SUBMITTED",
          reviewerId: "r1",
          subjectId: "s1",
          templateId: "tpl-1",
          cycleId: "c1",
          cycle: { status: "ACTIVE", companyId: "co-1" },
        } as any,
      },
    });

    const req = makeRequest(`http://localhost:3000/api/evaluate/${TOKEN}`, {
      method: "POST",
      body: { answers: { q1: 5 } },
      cookies: { evaluation_session: "valid-session" },
    });
    const res = await submitEvaluation(req, { params: Promise.resolve({ token: TOKEN }) });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(410);
    expect(body.code).toBe("ALREADY_SUBMITTED");
  });

  it("returns 400 for missing required answers", async () => {
    vi.mocked(validateEvaluationSession).mockResolvedValue({
      ok: true,
      session: {
        type: "direct",
        assignment: {
          id: "a1",
          status: "PENDING",
          reviewerId: "r1",
          subjectId: "s1",
          templateId: "tpl-1",
          cycleId: "c1",
          cycle: { status: "ACTIVE", companyId: "co-1" },
        } as any,
      },
    });

    vi.mocked(prisma.evaluationTemplate.findFirst).mockResolvedValue({
      sections: [
        {
          title: "Section 1",
          questions: [
            { id: "q1", text: "Question 1", required: true },
            { id: "q2", text: "Question 2", required: true },
            { id: "q3", text: "Question 3", required: false },
          ],
        },
      ],
    } as any);

    // Only answer q1, missing q2
    const req = makeRequest(`http://localhost:3000/api/evaluate/${TOKEN}`, {
      method: "POST",
      body: { answers: { q1: 5 } },
      cookies: { evaluation_session: "valid-session" },
    });
    const res = await submitEvaluation(req, { params: Promise.resolve({ token: TOKEN }) });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(400);
    expect(body.code).toBe("MISSING_REQUIRED");
    expect(body.error).toContain("Question 2");
  });
});
