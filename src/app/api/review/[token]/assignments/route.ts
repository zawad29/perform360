import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import type { Direction } from "@/lib/directions";

type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

// ─── GET: List all assignments for this reviewer in this cycle ───
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const rl = applyRateLimit(request);
  if (rl) return rl;

  try {
    const { token } = await params;

    // Validate session cookie
    const sessionToken = request.cookies.get("evaluation_session")?.value;
    if (!sessionToken) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "Authentication required", code: "NO_SESSION" },
        { status: 401 }
      );
    }

    const otpSession = await prisma.otpSession.findUnique({
      where: { sessionToken },
      include: {
        reviewerLink: {
          include: {
            cycle: { select: { name: true, status: true, id: true, endDate: true } },
          },
        },
      },
    });

    if (!otpSession || !otpSession.sessionExpiry || otpSession.sessionExpiry < new Date()) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "Session expired. Please verify again.", code: "SESSION_EXPIRED" },
        { status: 401 }
      );
    }

    if (!otpSession.reviewerLink || otpSession.reviewerLink.token !== token) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "Session does not match this review link", code: "SESSION_MISMATCH" },
        { status: 403 }
      );
    }

    const { reviewerLink } = otpSession;

    if (reviewerLink.cycle.status !== "ACTIVE") {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "This evaluation cycle is no longer active", code: "CYCLE_INACTIVE" },
        { status: 410 }
      );
    }

    // Fetch all assignments for this reviewer in this cycle
    const assignments = await prisma.evaluationAssignment.findMany({
      where: {
        cycleId: reviewerLink.cycleId,
        reviewerId: reviewerLink.reviewerId,
      },
      select: {
        id: true,
        token: true,
        subjectId: true,
        direction: true,
        status: true,
      },
    });

    // Resolve subject names
    const subjectIds = assignments.map((a) => a.subjectId);
    const subjects = await prisma.user.findMany({
      where: { id: { in: subjectIds } },
      select: { id: true, name: true },
    });
    const subjectMap = new Map(subjects.map((s) => [s.id, s.name]));

    return NextResponse.json<ApiResponse<{
      cycleName: string;
      cycleEndDate: string;
      assignments: Array<{
        token: string;
        subjectName: string;
        direction: Direction;
        status: string;
      }>;
    }>>({
      success: true,
      data: {
        cycleName: reviewerLink.cycle.name,
        cycleEndDate: reviewerLink.cycle.endDate.toISOString(),
        assignments: assignments.map((a) => ({
          token: a.token,
          subjectName: subjectMap.get(a.subjectId) ?? "Unknown",
          direction: a.direction,
          status: a.status,
        })),
      },
    });
  } catch (error) {
    console.error("Assignments list error:", error);
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Failed to load assignments" },
      { status: 500 }
    );
  }
}
