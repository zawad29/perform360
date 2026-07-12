import { prisma } from "@/lib/prisma";
import type { EvaluationAssignment, EvaluationCycle, CycleReviewerLink } from "@prisma/client";

type AssignmentWithCycle = EvaluationAssignment & {
  cycle: Pick<EvaluationCycle, "status" | "companyId">;
};

interface DirectSession {
  type: "direct";
  assignment: AssignmentWithCycle;
}

interface SummarySession {
  type: "summary";
  assignment: AssignmentWithCycle;
  reviewerLink: CycleReviewerLink;
}

type ValidSession = DirectSession | SummarySession;

type SessionValidationResult =
  | { ok: true; session: ValidSession }
  | { ok: false; status: number; error: string; code: string };

export async function validateEvaluationSession(
  sessionToken: string,
  assignmentToken: string
): Promise<SessionValidationResult> {
  const otpSession = await prisma.otpSession.findUnique({
    where: { sessionToken },
    include: {
      assignment: {
        include: {
          cycle: { select: { status: true, companyId: true } },
        },
      },
      reviewerLink: true,
    },
  });

  if (!otpSession || !otpSession.sessionExpiry || otpSession.sessionExpiry < new Date()) {
    return {
      ok: false,
      status: 401,
      error: "Session expired. Please verify again.",
      code: "SESSION_EXPIRED",
    };
  }

  // Direct assignment session
  if (otpSession.assignmentId && otpSession.assignment) {
    if (otpSession.assignment.token === assignmentToken) {
      return {
        ok: true,
        session: { type: "direct", assignment: otpSession.assignment },
      };
    }

    // Session was created for a different assignment — check if it belongs
    // to the same reviewer (by email) so one OTP covers all their evaluations
    const requestedAssignment = await prisma.evaluationAssignment.findUnique({
      where: { token: assignmentToken },
      include: {
        cycle: { select: { status: true, companyId: true } },
      },
    });

    if (!requestedAssignment) {
      return {
        ok: false,
        status: 404,
        error: "Invalid evaluation link",
        code: "INVALID_TOKEN",
      };
    }

    // Look up the reviewer email for the requested assignment
    const reviewer = await prisma.user.findFirst({
      where: { id: requestedAssignment.reviewerId },
      select: { email: true },
    });

    if (reviewer && reviewer.email === otpSession.email) {
      return {
        ok: true,
        session: { type: "direct", assignment: requestedAssignment },
      };
    }

    return {
      ok: false,
      status: 403,
      error: "Session does not match this evaluation",
      code: "SESSION_MISMATCH",
    };
  }

  // Summary reviewer session
  if (otpSession.reviewerLinkId && otpSession.reviewerLink) {
    const assignment = await prisma.evaluationAssignment.findUnique({
      where: { token: assignmentToken },
      include: {
        cycle: { select: { status: true, companyId: true } },
      },
    });

    if (!assignment) {
      return {
        ok: false,
        status: 404,
        error: "Invalid evaluation link",
        code: "INVALID_TOKEN",
      };
    }

    // One OTP covers all of a reviewer's evaluations: accept the session if it
    // belongs to the same reviewer (by email), regardless of which cycle/link it
    // was originally verified against. Mirrors the direct-session branch above.
    const reviewer = await prisma.user.findFirst({
      where: { id: assignment.reviewerId },
      select: { email: true },
    });

    if (!reviewer || reviewer.email !== otpSession.email) {
      return {
        ok: false,
        status: 403,
        error: "Session does not match this evaluation",
        code: "SESSION_MISMATCH",
      };
    }

    return {
      ok: true,
      session: {
        type: "summary",
        assignment,
        reviewerLink: otpSession.reviewerLink,
      },
    };
  }

  return {
    ok: false,
    status: 401,
    error: "Invalid session",
    code: "INVALID_SESSION",
  };
}

type ReviewLinkWithCycle = CycleReviewerLink & {
  cycle: Pick<EvaluationCycle, "id" | "name" | "status" | "endDate">;
};

type SummaryLinkValidationResult =
  | { ok: true; reviewerLink: ReviewLinkWithCycle }
  | { ok: false; status: number; error: string; code: string };

/**
 * Validate a session cookie against a review (summary) link token.
 *
 * Access requires two gates: possession of the unguessable link token (in the
 * URL) and an email-identity match — the verified session's email must equal the
 * link's reviewer email. This lets one OTP cover all of a reviewer's cycles
 * while never granting access to another reviewer's evaluations.
 */
export async function validateSummarySession(
  sessionToken: string,
  reviewLinkToken: string
): Promise<SummaryLinkValidationResult> {
  const reviewerLink = await prisma.cycleReviewerLink.findUnique({
    where: { token: reviewLinkToken },
    include: {
      cycle: { select: { id: true, name: true, status: true, endDate: true } },
    },
  });

  if (!reviewerLink) {
    return { ok: false, status: 404, error: "Invalid review link", code: "INVALID_TOKEN" };
  }

  const otpSession = await prisma.otpSession.findUnique({
    where: { sessionToken },
    select: { email: true, sessionExpiry: true },
  });

  if (!otpSession || !otpSession.sessionExpiry || otpSession.sessionExpiry < new Date()) {
    return {
      ok: false,
      status: 401,
      error: "Session expired. Please verify again.",
      code: "SESSION_EXPIRED",
    };
  }

  const reviewer = await prisma.user.findFirst({
    where: { id: reviewerLink.reviewerId },
    select: { email: true },
  });

  if (!reviewer || reviewer.email !== otpSession.email) {
    return {
      ok: false,
      status: 403,
      error: "Session does not match this review link",
      code: "SESSION_MISMATCH",
    };
  }

  return { ok: true, reviewerLink };
}
