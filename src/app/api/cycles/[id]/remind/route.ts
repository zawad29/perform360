import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrHR, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { validateCuidParam } from "@/lib/validation";
import { enqueue } from "@/lib/queue";
import { JOB_TYPES } from "@/types/job";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = applyRateLimit(request);
  if (rl) return rl;
  const { id } = await params;
  const invalid = validateCuidParam(id);
  if (invalid) return invalid;

  const authResult = await requireAdminOrHR();
  if (isAuthError(authResult)) return authResult;

  // Parse optional assignmentId or reviewerId from request body
  let assignmentId: string | undefined;
  let reviewerId: string | undefined;
  try {
    const body = await request.json();
    assignmentId = body.assignmentId;
    reviewerId = body.reviewerId;
  } catch {
    // No body or invalid JSON — send to all
  }

  if (assignmentId) {
    const invalidAssignment = validateCuidParam(assignmentId);
    if (invalidAssignment) return invalidAssignment;
  }

  if (reviewerId) {
    const invalidReviewer = validateCuidParam(reviewerId);
    if (invalidReviewer) return invalidReviewer;
  }

  // 1. Fetch cycle and validate status
  const cycle = await prisma.evaluationCycle.findFirst({
    where: {
      id: id,
      companyId: authResult.companyId,
    },
  });

  if (!cycle) {
    return NextResponse.json(
      { success: false, error: "Cycle not found", code: "NOT_FOUND" },
      { status: 404 }
    );
  }

  if (cycle.status !== "ACTIVE") {
    return NextResponse.json(
      {
        success: false,
        error: "Reminders can only be sent for ACTIVE cycles",
        code: "INVALID_STATUS",
      },
      { status: 400 }
    );
  }

  // 2. Check pending assignments exist (for count in response)
  const pendingCount = await prisma.evaluationAssignment.count({
    where: {
      cycleId: id,
      status: { in: ["PENDING", "IN_PROGRESS"] },
      ...(assignmentId ? { id: assignmentId } : {}),
      ...(reviewerId ? { reviewerId } : {}),
    },
  });

  if (pendingCount === 0) {
    return NextResponse.json({
      success: true,
      data: {
        sent: 0,
        message: assignmentId
          ? "Assignment not found or already submitted"
          : reviewerId
            ? "No pending assignments for this reviewer"
            : "All evaluations have been submitted",
      },
    });
  }

  // 3. Enqueue reminder job (processed by worker)
  const jobId = await enqueue(
    JOB_TYPES.CYCLE_REMIND,
    {
      cycleId: id,
      companyId: authResult.companyId,
      assignmentId,
      reviewerId,
    },
    { priority: 3 }
  );

  return NextResponse.json({
    success: true,
    data: {
      totalPending: pendingCount,
      jobId,
      message: "Reminders queued for sending",
    },
  });
}
