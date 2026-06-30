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

    if (
      assignment.cycleId !== otpSession.reviewerLink.cycleId ||
      assignment.reviewerId !== otpSession.reviewerLink.reviewerId
    ) {
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
