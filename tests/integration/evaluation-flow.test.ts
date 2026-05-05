import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { decryptDataKeyFromCookie } from "@/lib/encryption-session";
import { validateEvaluationSession } from "@/lib/session-validation";
import { parseResponse } from "../helpers";

// Dynamic-import route handlers
const { GET: validateToken, POST: submitEvaluation } = await import(
  "@/app/api/evaluate/[token]/route"
);
const { POST: sendOTP } = await import(
  "@/app/api/evaluate/[token]/otp/send/route"
);
const { POST: verifyOTP } = await import(
  "@/app/api/evaluate/[token]/otp/verify/route"
);
const { GET: loadForm } = await import(
  "@/app/api/evaluate/[token]/form/route"
);

// ─── Shared fixtures ───
const TOKEN = "eval-token-abc";
const ASSIGNMENT_ID = "assign-1";
const CYCLE_ID = "cycle-1";
const COMPANY_ID = "ccompany-1";

const baseAssignment = {
  id: ASSIGNMENT_ID,
  token: TOKEN,
  status: "PENDING",
  reviewerId: "reviewer-1",
  subjectId: "subject-1",
  cycleId: CYCLE_ID,
  templateId: "tmpl-1",
  direction: "LATERAL",
};

const activeCycle = {
  name: "Q1 2026",
  status: "ACTIVE",
  companyId: COMPANY_ID,
  endDate: new Date(Date.now() + 7 * 86400000), // 7 days from now
};

// Helper: build a NextRequest with cookies support
function makeRequest(
  url: string,
  opts: { method?: string; body?: unknown; cookies?: Record<string, string> } = {}
) {
  const { method = "GET", body, cookies = {} } = opts;
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

describe("Integration: Evaluation Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Step 1: Token Validation ───
  describe("Token validation (GET /evaluate/[token])", () => {
    it("validates a good token and returns masked email", async () => {
      vi.mocked(prisma.evaluationAssignment.findUnique).mockResolvedValue({
        ...baseAssignment,
        cycle: activeCycle,
      } as any);
      vi.mocked(prisma.user.findFirst)
        .mockResolvedValueOnce({ name: "Subject User" } as any) // subject
        .mockResolvedValueOnce({ name: "Reviewer", email: "reviewer@test.com" } as any); // reviewer

      const req = makeRequest(`http://localhost:3000/api/evaluate/${TOKEN}`);
      const res = await validateToken(req, { params: Promise.resolve({ token: TOKEN }) });
      const { status, body } = await parseResponse(res);

      expect(status).toBe(200);
      expect(body.data.subjectName).toBe("Subject User");
      expect(body.data.reviewerEmailMasked).toBe("re******@test.com");
      expect(body.data.cycleName).toBe("Q1 2026");
    });

    it("rejects invalid token", async () => {
      vi.mocked(prisma.evaluationAssignment.findUnique).mockResolvedValue(null);

      const req = makeRequest("http://localhost:3000/api/evaluate/bad-token");
      const res = await validateToken(req, { params: Promise.resolve({ token: "bad-token" }) });
      const { status, body } = await parseResponse(res);

      expect(status).toBe(404);
      expect(body.code).toBe("INVALID_TOKEN");
    });

    it("rejects already-submitted assignment", async () => {
      vi.mocked(prisma.evaluationAssignment.findUnique).mockResolvedValue({
        ...baseAssignment,
        status: "SUBMITTED",
        cycle: activeCycle,
      } as any);

      const req = makeRequest(`http://localhost:3000/api/evaluate/${TOKEN}`);
      const res = await validateToken(req, { params: Promise.resolve({ token: TOKEN }) });
      const { status, body } = await parseResponse(res);

      expect(status).toBe(410);
      expect(body.code).toBe("ALREADY_SUBMITTED");
    });

    it("rejects inactive cycle", async () => {
      vi.mocked(prisma.evaluationAssignment.findUnique).mockResolvedValue({
        ...baseAssignment,
        cycle: { ...activeCycle, status: "CLOSED" },
      } as any);

      const req = makeRequest(`http://localhost:3000/api/evaluate/${TOKEN}`);
      const res = await validateToken(req, { params: Promise.resolve({ token: TOKEN }) });
      const { status, body } = await parseResponse(res);

      expect(status).toBe(410);
      expect(body.code).toBe("CYCLE_INACTIVE");
    });
  });

  // ─── Step 2: OTP Send ───
  describe("OTP send (POST /evaluate/[token]/otp/send)", () => {
    it("sends OTP email to reviewer", async () => {
      vi.mocked(prisma.evaluationAssignment.findUnique).mockResolvedValue({
        ...baseAssignment,
        cycle: { status: "ACTIVE", companyId: COMPANY_ID },
      } as any);
      vi.mocked(prisma.user.findFirst).mockResolvedValue({
        email: "reviewer@test.com",
        name: "Reviewer",
      } as any);
      vi.mocked(prisma.otpSession.count).mockResolvedValue(0);
      vi.mocked(prisma.otpSession.create).mockResolvedValue({} as any);

      const req = makeRequest(
        `http://localhost:3000/api/evaluate/${TOKEN}/otp/send`,
        { method: "POST" }
      );
      const res = await sendOTP(req, { params: Promise.resolve({ token: TOKEN }) });
      const { status, body } = await parseResponse(res);

      expect(status).toBe(200);
      expect(body.data.sent).toBe(true);
      expect(sendEmail).toHaveBeenCalled();
      expect(prisma.otpSession.create).toHaveBeenCalled();
    });

    it("rate-limits OTP sends", async () => {
      vi.mocked(prisma.evaluationAssignment.findUnique).mockResolvedValue({
        ...baseAssignment,
        cycle: { status: "ACTIVE", companyId: COMPANY_ID },
      } as any);
      vi.mocked(prisma.user.findFirst).mockResolvedValue({
        email: "reviewer@test.com",
        name: "Reviewer",
      } as any);
      vi.mocked(prisma.otpSession.count).mockResolvedValue(10); // over limit

      const req = makeRequest(
        `http://localhost:3000/api/evaluate/${TOKEN}/otp/send`,
        { method: "POST", body: {} }
      );
      const res = await sendOTP(req, { params: Promise.resolve({ token: TOKEN }) });
      const { status, body } = await parseResponse(res);

      expect(status).toBe(429);
      expect(body.code).toBe("RATE_LIMITED");
    });
  });

  // ─── Step 3: OTP Verify ───
  describe("OTP verify (POST /evaluate/[token]/otp/verify)", () => {
    it("rejects invalid OTP format", async () => {
      const req = makeRequest(
        `http://localhost:3000/api/evaluate/${TOKEN}/otp/verify`,
        { method: "POST", body: { otp: "abc" } }
      );
      const res = await verifyOTP(req, { params: Promise.resolve({ token: TOKEN }) });
      const { status } = await parseResponse(res);

      expect(status).toBe(400);
    });

    it("returns 404 for unknown token", async () => {
      vi.mocked(prisma.evaluationAssignment.findUnique).mockResolvedValue(null);

      const req = makeRequest(
        `http://localhost:3000/api/evaluate/unknown/otp/verify`,
        { method: "POST", body: { otp: "123456" } }
      );
      const res = await verifyOTP(req, { params: Promise.resolve({ token: "unknown" }) });
      const { status, body } = await parseResponse(res);

      expect(status).toBe(404);
      expect(body.code).toBe("INVALID_TOKEN");
    });

    it("returns error when no OTP session exists", async () => {
      vi.mocked(prisma.evaluationAssignment.findUnique).mockResolvedValue({
        id: ASSIGNMENT_ID,
      } as any);
      vi.mocked(prisma.otpSession.findFirst).mockResolvedValue(null);

      const req = makeRequest(
        `http://localhost:3000/api/evaluate/${TOKEN}/otp/verify`,
        { method: "POST", body: { otp: "123456" } }
      );
      const res = await verifyOTP(req, { params: Promise.resolve({ token: TOKEN }) });
      const { status, body } = await parseResponse(res);

      expect(status).toBe(400);
      expect(body.code).toBe("NO_OTP");
    });
  });

  // ─── Step 4: Form Load ───
  describe("Form load (GET /evaluate/[token]/form)", () => {
    it("requires session cookie", async () => {
      const req = makeRequest(
        `http://localhost:3000/api/evaluate/${TOKEN}/form`
      );
      const res = await loadForm(req, { params: Promise.resolve({ token: TOKEN }) });
      const { status, body } = await parseResponse(res);

      expect(status).toBe(401);
      expect(body.code).toBe("NO_SESSION");
    });

    it("loads form with valid direct session", async () => {
      const sessionToken = "valid-session-token";
      const req = makeRequest(
        `http://localhost:3000/api/evaluate/${TOKEN}/form`,
        { cookies: { evaluation_session: sessionToken } }
      );

      vi.mocked(validateEvaluationSession).mockResolvedValue({
        ok: true,
        session: {
          type: "direct",
          assignment: {
            ...baseAssignment,
            cycle: { status: "ACTIVE", companyId: COMPANY_ID },
          } as any,
        },
      });

      vi.mocked(prisma.evaluationTemplate.findFirst).mockResolvedValue({
        sections: [
          {
            title: "Performance",
            questions: [
              { id: "q1", text: "Rating", type: "rating_scale", required: true },
            ],
          },
        ],
      } as any);

      vi.mocked(prisma.user.findFirst).mockResolvedValue({
        name: "Subject User",
      } as any);

      vi.mocked(prisma.evaluationCycle.findUnique).mockResolvedValue({
        name: "Q1 2026",
      } as any);

      const res = await loadForm(req, { params: Promise.resolve({ token: TOKEN }) });
      const { status, body } = await parseResponse(res);

      expect(status).toBe(200);
      expect(body.data.subjectName).toBe("Subject User");
      expect(body.data.sections).toHaveLength(1);
      expect(body.data.sections[0].questions).toHaveLength(1);
    });

    it("loads form with valid summary session", async () => {
      const sessionToken = "summary-session-token";
      const req = makeRequest(
        `http://localhost:3000/api/evaluate/${TOKEN}/form`,
        { cookies: { evaluation_session: sessionToken } }
      );

      vi.mocked(validateEvaluationSession).mockResolvedValue({
        ok: true,
        session: {
          type: "summary",
          assignment: {
            ...baseAssignment,
            cycle: { status: "ACTIVE", companyId: COMPANY_ID },
          } as any,
          reviewerLink: { id: "rl-1", cycleId: CYCLE_ID, reviewerId: "reviewer-1", token: "summary-tok" } as any,
        },
      });

      vi.mocked(prisma.evaluationTemplate.findFirst).mockResolvedValue({
        sections: [
          {
            title: "Performance",
            questions: [
              { id: "q1", text: "Rating", type: "rating_scale", required: true },
            ],
          },
        ],
      } as any);

      vi.mocked(prisma.user.findFirst).mockResolvedValue({
        name: "Subject User",
      } as any);

      vi.mocked(prisma.evaluationCycle.findUnique).mockResolvedValue({
        name: "Q1 2026",
      } as any);

      const res = await loadForm(req, { params: Promise.resolve({ token: TOKEN }) });
      const { status, body } = await parseResponse(res);

      expect(status).toBe(200);
      expect(body.data.subjectName).toBe("Subject User");
      expect(body.data.sections).toHaveLength(1);
    });

    it("returns error when session validation fails", async () => {
      const sessionToken = "bad-session";
      const req = makeRequest(
        `http://localhost:3000/api/evaluate/${TOKEN}/form`,
        { cookies: { evaluation_session: sessionToken } }
      );

      vi.mocked(validateEvaluationSession).mockResolvedValue({
        ok: false,
        status: 401,
        error: "Session expired. Please verify again.",
        code: "SESSION_EXPIRED",
      });

      const res = await loadForm(req, { params: Promise.resolve({ token: TOKEN }) });
      const { status, body } = await parseResponse(res);

      expect(status).toBe(401);
      expect(body.code).toBe("SESSION_EXPIRED");
    });
  });

  // ─── Step 5: Submit Evaluation ───
  describe("Submit evaluation (POST /evaluate/[token])", () => {
    it("requires session cookie", async () => {
      const req = makeRequest(`http://localhost:3000/api/evaluate/${TOKEN}`, {
        method: "POST",
        body: { answers: { q1: 5 } },
      });
      const res = await submitEvaluation(req, { params: Promise.resolve({ token: TOKEN }) });
      const { status, body } = await parseResponse(res);

      expect(status).toBe(401);
      expect(body.code).toBe("NO_SESSION");
    });

    it("rejects missing required answers", async () => {
      const sessionToken = "submit-session";
      const req = makeRequest(`http://localhost:3000/api/evaluate/${TOKEN}`, {
        method: "POST",
        body: { answers: {} },
        cookies: { evaluation_session: sessionToken },
      });

      vi.mocked(validateEvaluationSession).mockResolvedValue({
        ok: true,
        session: {
          type: "direct",
          assignment: {
            ...baseAssignment,
            cycle: { status: "ACTIVE", companyId: COMPANY_ID },
          } as any,
        },
      });

      vi.mocked(prisma.evaluationTemplate.findFirst).mockResolvedValue({
        sections: [
          {
            questions: [
              { id: "q1", required: true },
              { id: "q2", required: false },
            ],
          },
        ],
      } as any);

      const res = await submitEvaluation(req, { params: Promise.resolve({ token: TOKEN }) });
      const { status, body } = await parseResponse(res);

      expect(status).toBe(400);
      expect(body.code).toBe("MISSING_REQUIRED");
    });

    it("submits successfully with direct session", async () => {
      const sessionToken = "submit-ok-session";
      const fakeDataKey = Buffer.alloc(32, "k");
      const req = makeRequest(`http://localhost:3000/api/evaluate/${TOKEN}`, {
        method: "POST",
        body: { answers: { q1: 5, q2: "Great work" } },
        cookies: { evaluation_session: sessionToken },
      });

      vi.mocked(validateEvaluationSession).mockResolvedValue({
        ok: true,
        session: {
          type: "direct",
          assignment: {
            ...baseAssignment,
            cycle: { status: "ACTIVE", companyId: COMPANY_ID },
          } as any,
        },
      });

      vi.mocked(prisma.evaluationTemplate.findFirst).mockResolvedValue({
        sections: [
          { questions: [{ id: "q1", required: true }, { id: "q2", required: false }] },
        ],
      } as any);

      vi.mocked(prisma.evaluationCycle.findUnique).mockResolvedValue({
        cachedDataKeyEncrypted: "cached-encrypted-key",
      } as any);

      vi.mocked(decryptDataKeyFromCookie).mockReturnValue(fakeDataKey);

      vi.mocked(prisma.company.findUnique).mockResolvedValue({
        keyVersion: 1,
      } as any);

      // $transaction for array-style (returns Promise.all)
      vi.mocked(prisma.$transaction).mockResolvedValue([{}, {}]);
      vi.mocked(prisma.evaluationResponse.create).mockResolvedValue({} as any);
      vi.mocked(prisma.evaluationAssignment.update).mockResolvedValue({} as any);

      // Post-submission: cycle completion check + remaining pending evaluations
      vi.mocked(prisma.evaluationAssignment.count).mockResolvedValue(1);
      vi.mocked(prisma.evaluationAssignment.findMany).mockResolvedValue([]);

      const res = await submitEvaluation(req, { params: Promise.resolve({ token: TOKEN }) });
      const { status, body } = await parseResponse(res);

      expect(status).toBe(200);
      expect(body.data.submitted).toBe(true);
    });

    it("submits successfully with summary session", async () => {
      const sessionToken = "submit-summary-session";
      const fakeDataKey = Buffer.alloc(32, "k");
      const req = makeRequest(`http://localhost:3000/api/evaluate/${TOKEN}`, {
        method: "POST",
        body: { answers: { q1: 5, q2: "Good" } },
        cookies: { evaluation_session: sessionToken },
      });

      vi.mocked(validateEvaluationSession).mockResolvedValue({
        ok: true,
        session: {
          type: "summary",
          assignment: {
            ...baseAssignment,
            cycle: { status: "ACTIVE", companyId: COMPANY_ID },
          } as any,
          reviewerLink: { id: "rl-1", cycleId: CYCLE_ID, reviewerId: "reviewer-1", token: "summary-tok" } as any,
        },
      });

      vi.mocked(prisma.evaluationTemplate.findFirst).mockResolvedValue({
        sections: [
          { questions: [{ id: "q1", required: true }, { id: "q2", required: false }] },
        ],
      } as any);

      vi.mocked(prisma.evaluationCycle.findUnique).mockResolvedValue({
        cachedDataKeyEncrypted: "cached-encrypted-key",
      } as any);

      vi.mocked(decryptDataKeyFromCookie).mockReturnValue(fakeDataKey);

      vi.mocked(prisma.company.findUnique).mockResolvedValue({
        keyVersion: 1,
      } as any);

      vi.mocked(prisma.$transaction).mockResolvedValue([{}, {}]);

      // Post-submission: cycle completion check + remaining pending evaluations
      vi.mocked(prisma.evaluationAssignment.count).mockResolvedValue(1);
      vi.mocked(prisma.evaluationAssignment.findMany).mockResolvedValue([]);

      const res = await submitEvaluation(req, { params: Promise.resolve({ token: TOKEN }) });
      const { status, body } = await parseResponse(res);

      expect(status).toBe(200);
      expect(body.data.submitted).toBe(true);
    });

    it("returns error when session validation fails on submit", async () => {
      const sessionToken = "expired-session";
      const req = makeRequest(`http://localhost:3000/api/evaluate/${TOKEN}`, {
        method: "POST",
        body: { answers: { q1: 5 } },
        cookies: { evaluation_session: sessionToken },
      });

      vi.mocked(validateEvaluationSession).mockResolvedValue({
        ok: false,
        status: 403,
        error: "Session does not match this evaluation",
        code: "SESSION_MISMATCH",
      });

      const res = await submitEvaluation(req, { params: Promise.resolve({ token: TOKEN }) });
      const { status, body } = await parseResponse(res);

      expect(status).toBe(403);
      expect(body.code).toBe("SESSION_MISMATCH");
    });
  });
});
