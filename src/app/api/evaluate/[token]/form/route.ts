import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateEvaluationSession } from "@/lib/session-validation";
import { applyRateLimit } from "@/lib/rate-limit";
import type { Direction } from "@/lib/directions";

type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

interface TemplateQuestion {
  id: string;
  text: string;
  type: "rating_scale" | "text" | "multiple_choice";
  required: boolean;
  options?: string[];
  scaleMin?: number;
  scaleMax?: number;
  scaleLabels?: string[];
  conditionalOn?: string;
}

interface TemplateSection {
  id?: string;
  title: string;
  description?: string;
  directions?: Direction[];
  questions: TemplateQuestion[];
}

// ─── GET: Load evaluation form ───
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const rl = applyRateLimit(request);
  if (rl) return rl;

  try {
    const { token } = await params;

    // Validate OTP session from cookie (supports both direct and summary sessions)
    const sessionToken = request.cookies.get("evaluation_session")?.value;
    if (!sessionToken) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "Authentication required", code: "NO_SESSION" },
        { status: 401 }
      );
    }

    const result = await validateEvaluationSession(sessionToken, token);
    if (!result.ok) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: result.error, code: result.code },
        { status: result.status }
      );
    }

    const { assignment } = result.session;

    if (assignment.status === "SUBMITTED") {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "This evaluation has already been submitted", code: "ALREADY_SUBMITTED" },
        { status: 410 }
      );
    }

    if (assignment.cycle.status !== "ACTIVE") {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "This evaluation cycle is no longer active", code: "CYCLE_INACTIVE" },
        { status: 410 }
      );
    }

    // Load template (from assignment's per-team template)
    const template = await prisma.evaluationTemplate.findFirst({
      where: { id: assignment.templateId },
      select: { sections: true },
    });

    if (!template) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "Evaluation template not found" },
        { status: 500 }
      );
    }

    // Fetch subject name, cycle name, and impersonator status
    const [subject, cycle, impersonatorMember] = await Promise.all([
      prisma.user.findFirst({
        where: { id: assignment.subjectId },
        select: { name: true },
      }),
      prisma.evaluationCycle.findUnique({
        where: { id: assignment.cycleId },
        select: { name: true },
      }),
      prisma.teamMember.findFirst({
        where: { userId: assignment.reviewerId, role: "IMPERSONATOR" },
        select: { id: true },
      }),
    ]);

    // Filter sections to those matching this assignment's direction.
    // Empty/missing `directions` on a section = applies to all directions.
    const allSections = template.sections as unknown as TemplateSection[];
    const direction = assignment.direction as Direction;
    const sections = allSections.filter((s) => {
      const dirs = s.directions ?? [];
      return dirs.length === 0 || dirs.includes(direction);
    });

    return NextResponse.json<ApiResponse<{
      subjectName: string;
      cycleName: string;
      direction: Direction;
      sections: TemplateSection[];
      isImpersonator: boolean;
    }>>({
      success: true,
      data: {
        subjectName: subject?.name ?? "Unknown",
        cycleName: cycle?.name ?? "Unknown",
        direction,
        sections,
        isImpersonator: !!impersonatorMember,
      },
    });
  } catch (error) {
    console.error("Form loading error:", error);
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Failed to load evaluation form" },
      { status: 500 }
    );
  }
}
