import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";

// Unmock so we test the real implementation
vi.unmock("@/lib/session-validation");
const { validateEvaluationSession, validateSummarySession } = await import("@/lib/session-validation");

const ASSIGNMENT_TOKEN = "assign-tok-abc";
const SESSION_TOKEN = "session-tok-123";

const baseAssignment = {
  id: "a1",
  token: ASSIGNMENT_TOKEN,
  status: "PENDING",
  reviewerId: "r1",
  subjectId: "s1",
  cycleId: "c1",
  templateId: "t1",
  cycle: { status: "ACTIVE", companyId: "co-1" },
};

describe("validateEvaluationSession", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns SESSION_EXPIRED when no session found", async () => {
    vi.mocked(prisma.otpSession.findUnique).mockResolvedValue(null);

    const result = await validateEvaluationSession(SESSION_TOKEN, ASSIGNMENT_TOKEN);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.code).toBe("SESSION_EXPIRED");
    }
  });

  it("returns SESSION_EXPIRED when session has no expiry", async () => {
    vi.mocked(prisma.otpSession.findUnique).mockResolvedValue({
      sessionToken: SESSION_TOKEN,
      sessionExpiry: null,
      assignmentId: "a1",
      assignment: baseAssignment,
      reviewerLinkId: null,
      reviewerLink: null,
    } as any);

    const result = await validateEvaluationSession(SESSION_TOKEN, ASSIGNMENT_TOKEN);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("SESSION_EXPIRED");
    }
  });

  it("returns SESSION_EXPIRED when session is expired", async () => {
    vi.mocked(prisma.otpSession.findUnique).mockResolvedValue({
      sessionToken: SESSION_TOKEN,
      sessionExpiry: new Date(Date.now() - 60_000), // expired
      assignmentId: "a1",
      assignment: baseAssignment,
      reviewerLinkId: null,
      reviewerLink: null,
    } as any);

    const result = await validateEvaluationSession(SESSION_TOKEN, ASSIGNMENT_TOKEN);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("SESSION_EXPIRED");
    }
  });

  // ─── Direct session tests ───

  it("returns success for valid direct session with matching token", async () => {
    vi.mocked(prisma.otpSession.findUnique).mockResolvedValue({
      sessionToken: SESSION_TOKEN,
      sessionExpiry: new Date(Date.now() + 3600_000),
      assignmentId: "a1",
      assignment: baseAssignment,
      reviewerLinkId: null,
      reviewerLink: null,
    } as any);

    const result = await validateEvaluationSession(SESSION_TOKEN, ASSIGNMENT_TOKEN);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.type).toBe("direct");
      expect(result.session.assignment.token).toBe(ASSIGNMENT_TOKEN);
    }
  });

  it("returns success for direct session with different token but same reviewer email", async () => {
    vi.mocked(prisma.otpSession.findUnique).mockResolvedValue({
      sessionToken: SESSION_TOKEN,
      sessionExpiry: new Date(Date.now() + 3600_000),
      assignmentId: "a1",
      assignment: { ...baseAssignment, token: "other-token" },
      email: "reviewer@test.com",
      reviewerLinkId: null,
      reviewerLink: null,
    } as any);

    vi.mocked(prisma.evaluationAssignment.findUnique).mockResolvedValue({
      ...baseAssignment,
      reviewerId: "r1",
    } as any);

    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      email: "reviewer@test.com",
    } as any);

    const result = await validateEvaluationSession(SESSION_TOKEN, ASSIGNMENT_TOKEN);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.type).toBe("direct");
      expect(result.session.assignment.token).toBe(ASSIGNMENT_TOKEN);
    }
  });

  it("returns SESSION_MISMATCH for direct session with different token and different reviewer", async () => {
    vi.mocked(prisma.otpSession.findUnique).mockResolvedValue({
      sessionToken: SESSION_TOKEN,
      sessionExpiry: new Date(Date.now() + 3600_000),
      assignmentId: "a1",
      assignment: { ...baseAssignment, token: "other-token" },
      email: "reviewer@test.com",
      reviewerLinkId: null,
      reviewerLink: null,
    } as any);

    vi.mocked(prisma.evaluationAssignment.findUnique).mockResolvedValue({
      ...baseAssignment,
      reviewerId: "r2",
    } as any);

    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      email: "different-reviewer@test.com",
    } as any);

    const result = await validateEvaluationSession(SESSION_TOKEN, ASSIGNMENT_TOKEN);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.code).toBe("SESSION_MISMATCH");
    }
  });

  it("returns INVALID_TOKEN for direct session with different token when assignment not found", async () => {
    vi.mocked(prisma.otpSession.findUnique).mockResolvedValue({
      sessionToken: SESSION_TOKEN,
      sessionExpiry: new Date(Date.now() + 3600_000),
      assignmentId: "a1",
      assignment: { ...baseAssignment, token: "other-token" },
      email: "reviewer@test.com",
      reviewerLinkId: null,
      reviewerLink: null,
    } as any);

    vi.mocked(prisma.evaluationAssignment.findUnique).mockResolvedValue(null);

    const result = await validateEvaluationSession(SESSION_TOKEN, ASSIGNMENT_TOKEN);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.code).toBe("INVALID_TOKEN");
    }
  });

  // ─── Summary session tests ───

  it("returns success for valid summary session with matching reviewer email", async () => {
    vi.mocked(prisma.otpSession.findUnique).mockResolvedValue({
      sessionToken: SESSION_TOKEN,
      sessionExpiry: new Date(Date.now() + 3600_000),
      assignmentId: null,
      assignment: null,
      email: "reviewer@test.com",
      reviewerLinkId: "rl-1",
      reviewerLink: { id: "rl-1", cycleId: "c1", reviewerId: "r1", token: "summary-tok" },
    } as any);

    vi.mocked(prisma.evaluationAssignment.findUnique).mockResolvedValue({
      ...baseAssignment,
      cycleId: "c1",
      reviewerId: "r1",
    } as any);

    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      email: "reviewer@test.com",
    } as any);

    const result = await validateEvaluationSession(SESSION_TOKEN, ASSIGNMENT_TOKEN);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.type).toBe("summary");
      expect(result.session.assignment.token).toBe(ASSIGNMENT_TOKEN);
    }
  });

  it("returns success for summary session on a different cycle when reviewer email matches (one OTP covers all)", async () => {
    vi.mocked(prisma.otpSession.findUnique).mockResolvedValue({
      sessionToken: SESSION_TOKEN,
      sessionExpiry: new Date(Date.now() + 3600_000),
      assignmentId: null,
      assignment: null,
      email: "reviewer@test.com",
      reviewerLinkId: "rl-1",
      reviewerLink: { id: "rl-1", cycleId: "c1", reviewerId: "r1", token: "summary-tok" },
    } as any);

    // Requested assignment belongs to a DIFFERENT cycle but the same reviewer.
    vi.mocked(prisma.evaluationAssignment.findUnique).mockResolvedValue({
      ...baseAssignment,
      cycleId: "c2",
      reviewerId: "r1",
    } as any);

    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      email: "reviewer@test.com",
    } as any);

    const result = await validateEvaluationSession(SESSION_TOKEN, ASSIGNMENT_TOKEN);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.type).toBe("summary");
    }
  });

  it("returns INVALID_TOKEN for summary session when assignment not found", async () => {
    vi.mocked(prisma.otpSession.findUnique).mockResolvedValue({
      sessionToken: SESSION_TOKEN,
      sessionExpiry: new Date(Date.now() + 3600_000),
      assignmentId: null,
      assignment: null,
      reviewerLinkId: "rl-1",
      reviewerLink: { id: "rl-1", cycleId: "c1", reviewerId: "r1", token: "summary-tok" },
    } as any);

    vi.mocked(prisma.evaluationAssignment.findUnique).mockResolvedValue(null);

    const result = await validateEvaluationSession(SESSION_TOKEN, ASSIGNMENT_TOKEN);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.code).toBe("INVALID_TOKEN");
    }
  });

  it("returns SESSION_MISMATCH for summary session when requested assignment belongs to a different reviewer email", async () => {
    vi.mocked(prisma.otpSession.findUnique).mockResolvedValue({
      sessionToken: SESSION_TOKEN,
      sessionExpiry: new Date(Date.now() + 3600_000),
      assignmentId: null,
      assignment: null,
      email: "reviewer@test.com",
      reviewerLinkId: "rl-1",
      reviewerLink: { id: "rl-1", cycleId: "c1", reviewerId: "r1", token: "summary-tok" },
    } as any);

    vi.mocked(prisma.evaluationAssignment.findUnique).mockResolvedValue({
      ...baseAssignment,
      reviewerId: "different-reviewer",
    } as any);

    // Different reviewer → different email → must not be accepted.
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      email: "someone-else@test.com",
    } as any);

    const result = await validateEvaluationSession(SESSION_TOKEN, ASSIGNMENT_TOKEN);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.code).toBe("SESSION_MISMATCH");
    }
  });

  it("returns SESSION_MISMATCH for summary session when the assignment's reviewer is not found", async () => {
    vi.mocked(prisma.otpSession.findUnique).mockResolvedValue({
      sessionToken: SESSION_TOKEN,
      sessionExpiry: new Date(Date.now() + 3600_000),
      assignmentId: null,
      assignment: null,
      email: "reviewer@test.com",
      reviewerLinkId: "rl-1",
      reviewerLink: { id: "rl-1", cycleId: "c1", reviewerId: "r1", token: "summary-tok" },
    } as any);

    vi.mocked(prisma.evaluationAssignment.findUnique).mockResolvedValue({
      ...baseAssignment,
      reviewerId: "r1",
    } as any);

    vi.mocked(prisma.user.findFirst).mockResolvedValue(null as any);

    const result = await validateEvaluationSession(SESSION_TOKEN, ASSIGNMENT_TOKEN);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.code).toBe("SESSION_MISMATCH");
    }
  });

  it("returns INVALID_SESSION when session has neither assignmentId nor reviewerLinkId", async () => {
    vi.mocked(prisma.otpSession.findUnique).mockResolvedValue({
      sessionToken: SESSION_TOKEN,
      sessionExpiry: new Date(Date.now() + 3600_000),
      assignmentId: null,
      assignment: null,
      reviewerLinkId: null,
      reviewerLink: null,
    } as any);

    const result = await validateEvaluationSession(SESSION_TOKEN, ASSIGNMENT_TOKEN);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.code).toBe("INVALID_SESSION");
    }
  });
});

describe("validateSummarySession", () => {
  const REVIEW_LINK_TOKEN = "review-link-tok";
  const linkWithCycle = {
    id: "rl-1",
    token: REVIEW_LINK_TOKEN,
    cycleId: "c1",
    reviewerId: "r1",
    cycle: { id: "c1", name: "Q1 Review", status: "ACTIVE", endDate: new Date() },
  };

  beforeEach(() => vi.clearAllMocks());

  it("returns INVALID_TOKEN when the review link is not found", async () => {
    vi.mocked(prisma.cycleReviewerLink.findUnique).mockResolvedValue(null);

    const result = await validateSummarySession(SESSION_TOKEN, REVIEW_LINK_TOKEN);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.code).toBe("INVALID_TOKEN");
    }
  });

  it("returns SESSION_EXPIRED when no valid session exists", async () => {
    vi.mocked(prisma.cycleReviewerLink.findUnique).mockResolvedValue(linkWithCycle as any);
    vi.mocked(prisma.otpSession.findUnique).mockResolvedValue(null);

    const result = await validateSummarySession(SESSION_TOKEN, REVIEW_LINK_TOKEN);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.code).toBe("SESSION_EXPIRED");
    }
  });

  it("succeeds when the session email matches the link's reviewer (any cycle)", async () => {
    vi.mocked(prisma.cycleReviewerLink.findUnique).mockResolvedValue(linkWithCycle as any);
    vi.mocked(prisma.otpSession.findUnique).mockResolvedValue({
      email: "reviewer@test.com",
      sessionExpiry: new Date(Date.now() + 3600_000),
    } as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ email: "reviewer@test.com" } as any);

    const result = await validateSummarySession(SESSION_TOKEN, REVIEW_LINK_TOKEN);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.reviewerLink.id).toBe("rl-1");
      expect(result.reviewerLink.cycle.status).toBe("ACTIVE");
    }
  });

  it("returns SESSION_MISMATCH when the session email differs from the link's reviewer", async () => {
    vi.mocked(prisma.cycleReviewerLink.findUnique).mockResolvedValue(linkWithCycle as any);
    vi.mocked(prisma.otpSession.findUnique).mockResolvedValue({
      email: "attacker@test.com",
      sessionExpiry: new Date(Date.now() + 3600_000),
    } as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ email: "reviewer@test.com" } as any);

    const result = await validateSummarySession(SESSION_TOKEN, REVIEW_LINK_TOKEN);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.code).toBe("SESSION_MISMATCH");
    }
  });
});
