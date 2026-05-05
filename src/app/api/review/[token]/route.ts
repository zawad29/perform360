import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";

type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

// ─── GET: Validate summary token ───
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const rl = applyRateLimit(request);
  if (rl) return rl;

  try {
    const { token } = await params;

    const reviewerLink = await prisma.cycleReviewerLink.findUnique({
      where: { token },
      include: {
        cycle: { select: { name: true, status: true, endDate: true } },
      },
    });

    if (!reviewerLink) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "Invalid review link", code: "INVALID_TOKEN" },
        { status: 404 }
      );
    }

    if (reviewerLink.cycle.status !== "ACTIVE") {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "This evaluation cycle is no longer active", code: "CYCLE_INACTIVE" },
        { status: 410 }
      );
    }

    if (new Date() > reviewerLink.cycle.endDate) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "This evaluation cycle has ended", code: "CYCLE_EXPIRED" },
        { status: 410 }
      );
    }

    const reviewer = await prisma.user.findFirst({
      where: { id: reviewerLink.reviewerId },
      select: { name: true, email: true },
    });

    // Mask reviewer email for display
    const email = reviewer?.email ?? "";
    const [localPart, domain] = email.split("@");
    const maskedEmail = localPart && domain
      ? `${localPart.slice(0, 2)}${"*".repeat(Math.max(localPart.length - 2, 0))}@${domain}`
      : "";

    // Count assignments
    const totalAssignments = await prisma.evaluationAssignment.count({
      where: { cycleId: reviewerLink.cycleId, reviewerId: reviewerLink.reviewerId },
    });

    const pendingAssignments = await prisma.evaluationAssignment.count({
      where: {
        cycleId: reviewerLink.cycleId,
        reviewerId: reviewerLink.reviewerId,
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
    });

    return NextResponse.json<ApiResponse<{
      token: string;
      reviewerEmailMasked: string;
      cycleName: string;
      totalAssignments: number;
      pendingAssignments: number;
    }>>({
      success: true,
      data: {
        token,
        reviewerEmailMasked: maskedEmail,
        cycleName: reviewerLink.cycle.name,
        totalAssignments,
        pendingAssignments,
      },
    });
  } catch (error) {
    console.error("Summary token validation error:", error);
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Failed to validate review link" },
      { status: 500 }
    );
  }
}
