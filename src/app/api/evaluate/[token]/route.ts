import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";
import { decryptDataKeyFromCookie } from "@/lib/encryption-session";
import { validateEvaluationSession } from "@/lib/session-validation";
import { enqueueBatch } from "@/lib/queue";
import { JOB_TYPES } from "@/types/job";
import { getCycleCompletionEmail } from "@/lib/email";
import type { EmailSendPayload } from "@/types/job";
import { writeAuditLog } from "@/lib/audit";
import { applyRateLimit } from "@/lib/rate-limit";

type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

// ─── GET: Token Validation ───
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const rl = applyRateLimit(request);
  if (rl) return rl;

  try {
    const { token } = await params;

    const assignment = await prisma.evaluationAssignment.findUnique({
      where: { token },
      include: {
        cycle: { select: { name: true, status: true } },
      },
    });

    if (!assignment) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "Invalid evaluation link", code: "INVALID_TOKEN" },
        { status: 404 }
      );
    }

    if (assignment.cycle.status !== "ACTIVE") {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "This evaluation cycle is no longer active", code: "CYCLE_INACTIVE" },
        { status: 410 }
      );
    }

    if (assignment.status === "SUBMITTED") {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "This evaluation has already been submitted", code: "ALREADY_SUBMITTED" },
        { status: 410 }
      );
    }

    const [subject, reviewer, impersonatorMember] = await Promise.all([
      prisma.user.findFirst({ where: { id: assignment.subjectId }, select: { name: true } }),
      prisma.user.findFirst({ where: { id: assignment.reviewerId }, select: { name: true, email: true } }),
      prisma.teamMember.findFirst({
        where: { userId: assignment.reviewerId, role: "IMPERSONATOR" },
        select: { id: true },
      }),
    ]);

    // Mask reviewer email for display (show first 2 chars + domain)
    const email = reviewer?.email ?? "";
    const [localPart, domain] = email.split("@");
    const maskedEmail = localPart && domain
      ? `${localPart.slice(0, 2)}${"*".repeat(Math.max(localPart.length - 2, 0))}@${domain}`
      : "";

    return NextResponse.json<ApiResponse<{
      token: string;
      subjectName: string;
      reviewerEmailMasked: string;
      cycleName: string;
      direction: string;
      isImpersonator: boolean;
    }>>({
      success: true,
      data: {
        token,
        subjectName: subject?.name ?? "Unknown",
        reviewerEmailMasked: maskedEmail,
        cycleName: assignment.cycle.name,
        direction: assignment.direction,
        isImpersonator: !!impersonatorMember,
      },
    });
  } catch (error) {
    console.error("Token validation error:", error);
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Failed to validate evaluation link" },
      { status: 500 }
    );
  }
}

// ─── POST: Submit Evaluation ───
export async function POST(
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

    // Parse and validate answers
    const body = await request.json();
    const { answers } = body as { answers: Record<string, string | number | boolean> };

    if (!answers || typeof answers !== "object") {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "Invalid submission data" },
        { status: 400 }
      );
    }

    // Validate required questions are answered (using assignment's per-team template)
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

    const sections = template.sections as Array<{
      title: string;
      directions?: string[];
      questions: Array<{ id: string; text: string; required: boolean }>;
    }>;
    const direction = assignment.direction;
    const visibleSections = sections.filter((s) => {
      const dirs = s.directions ?? [];
      return dirs.length === 0 || dirs.includes(direction);
    });
    const allQuestions = visibleSections.flatMap((s) =>
      s.questions.map((q) => ({ ...q, sectionTitle: s.title }))
    );
    const requiredQuestions = allQuestions.filter((q) => q.required);

    const missing = requiredQuestions.filter(
      (q) => answers[q.id] === undefined || answers[q.id] === ""
    );
    if (missing.length > 0) {
      const missingLabels = missing
        .slice(0, 5)
        .map((q) => `"${q.text}"`)
        .join(", ");
      const extra = missing.length > 5 ? ` and ${missing.length - 5} more` : "";
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: `Please answer ${missing.length} required ${missing.length === 1 ? "question" : "questions"}: ${missingLabels}${extra}`,
          code: "MISSING_REQUIRED",
        },
        { status: 400 }
      );
    }

    // Read the cached data key that was stored on the cycle when admin activated it
    const cycle = await prisma.evaluationCycle.findUnique({
      where: { id: assignment.cycleId },
      select: { cachedDataKeyEncrypted: true, name: true },
    });

    if (!cycle?.cachedDataKeyEncrypted) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "Encryption not available for this cycle. Admin must re-activate." },
        { status: 500 }
      );
    }

    const dataKey = decryptDataKeyFromCookie(cycle.cachedDataKeyEncrypted);
    if (!dataKey) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "Failed to decrypt cycle encryption key" },
        { status: 500 }
      );
    }

    const company = await prisma.company.findUnique({
      where: { id: assignment.cycle.companyId },
      select: { keyVersion: true, settings: true },
    });

    const answersJson = JSON.stringify(answers);
    const { encrypted, iv, tag } = encrypt(answersJson, dataKey);

    // Create response and update assignment in a transaction
    await prisma.$transaction([
      prisma.evaluationResponse.create({
        data: {
          assignmentId: assignment.id,
          reviewerId: assignment.reviewerId,
          subjectId: assignment.subjectId,
          answersEncrypted: encrypted,
          answersIv: iv,
          answersTag: tag,
          keyVersion: company?.keyVersion ?? 1,
          submittedAt: new Date(),
        },
      }),
      prisma.evaluationAssignment.update({
        where: { id: assignment.id },
        data: { status: "SUBMITTED" },
      }),
    ]);

    // Post-submission: auto-close cycle if 100% complete, notify admins
    try {
      const remaining = await prisma.evaluationAssignment.count({
        where: { cycleId: assignment.cycleId, status: { not: "SUBMITTED" } },
      });
      if (remaining === 0) {
        // Auto-close cycle when 100% of assignments are submitted
        await prisma.evaluationCycle.update({
          where: { id: assignment.cycleId },
          data: { status: "CLOSED" },
        });
        await writeAuditLog({
          companyId: assignment.cycle.companyId,
          action: "cycle_close",
          target: `cycle:${assignment.cycleId}`,
          metadata: { reason: "auto-close (100% completion)" },
        });

        const notifications = (company?.settings as Record<string, unknown> | null)
          ?.notifications as Record<string, unknown> | undefined;
        if (notifications?.cycleCompletion !== false) {
          const [totalAssignments, admins] = await Promise.all([
            prisma.evaluationAssignment.count({ where: { cycleId: assignment.cycleId } }),
            prisma.user.findMany({
              where: { companyId: assignment.cycle.companyId, role: { in: ["ADMIN", "HR"] } },
              select: { email: true },
            }),
          ]);
          if (admins.length > 0 && cycle) {
            const { html, text } = getCycleCompletionEmail(cycle.name, totalAssignments);
            const emailJobs: Array<{ type: typeof JOB_TYPES.EMAIL_SEND; payload: EmailSendPayload }> =
              admins.map((admin) => ({
                type: JOB_TYPES.EMAIL_SEND,
                payload: {
                  to: admin.email,
                  subject: `Cycle complete — ${cycle.name}`,
                  html,
                  text,
                },
              }));
            await enqueueBatch(emailJobs);
          }
        }
      }
    } catch (err) {
      console.error("Failed to auto-close cycle or queue completion email:", err);
    }

    // Fetch remaining pending evaluations for this reviewer
    const pendingAssignments = await prisma.evaluationAssignment.findMany({
      where: {
        reviewerId: assignment.reviewerId,
        status: { not: "SUBMITTED" },
        id: { not: assignment.id },
        cycle: { status: "ACTIVE" },
      },
      select: {
        token: true,
        direction: true,
        subjectId: true,
        cycle: { select: { name: true } },
      },
    });

    const subjectIds = [...new Set(pendingAssignments.map((a) => a.subjectId))];
    const subjects = subjectIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: subjectIds } },
          select: { id: true, name: true },
        })
      : [];
    const subjectMap = new Map(subjects.map((s) => [s.id, s.name]));

    const remaining = pendingAssignments.map((a) => ({
      token: a.token,
      subjectName: subjectMap.get(a.subjectId) ?? "Unknown",
      cycleName: a.cycle.name,
      direction: a.direction,
    }));

    return NextResponse.json<ApiResponse<{
      submitted: true;
      remaining: typeof remaining;
    }>>({
      success: true,
      data: { submitted: true, remaining },
    });
  } catch (error) {
    console.error("Submission error:", error);
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Failed to submit evaluation" },
      { status: 500 }
    );
  }
}
