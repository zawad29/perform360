import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateEvaluationSession } from "@/lib/session-validation";
import { applyRateLimit } from "@/lib/rate-limit";
import { errorResponse, internalErrorResponse } from "@/lib/api-responses";
import type { Direction } from "@/lib/directions";
import type { TemplateSection } from "@/types/evaluation";
import type { ApiResponse } from "@/types/api";

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
      return errorResponse("Authentication required", "NO_SESSION", 401);
    }

    const result = await validateEvaluationSession(sessionToken, token);
    if (!result.ok) {
      return errorResponse(result.error, result.code ?? "SESSION_ERROR", result.status);
    }

    const { assignment } = result.session;

    if (assignment.status === "SUBMITTED") {
      return errorResponse("This evaluation has already been submitted", "ALREADY_SUBMITTED", 410);
    }

    if (assignment.cycle.status !== "ACTIVE") {
      return errorResponse("This evaluation cycle is no longer active", "CYCLE_INACTIVE", 410);
    }

    // Load template (from assignment's per-team template)
    const template = await prisma.evaluationTemplate.findFirst({
      where: { id: assignment.templateId },
      select: { sections: true },
    });

    if (!template) {
      return errorResponse("Evaluation template not found", "TEMPLATE_NOT_FOUND", 500);
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
    return internalErrorResponse(error);
  }
}
