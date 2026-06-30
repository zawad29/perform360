import { prisma } from "@/lib/prisma";
import { enqueueBatch } from "@/lib/queue";
import { getSummaryInviteEmail, getSummaryReminderEmail } from "@/lib/email";
import { writeAuditLog } from "@/lib/audit";
import { DIRECTION_LABELS } from "@/lib/directions";
import { JOB_TYPES } from "@/types/job";
import type {
  CycleActivatePayload,
  CycleRemindPayload,
  CycleAutoClosePayload,
  EmailSendPayload,
} from "@/types/job";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/**
 * Fetches assignments + users for a cycle, groups by reviewer,
 * creates CycleReviewerLink records, and enqueues one summary email per reviewer.
 */
export async function handleCycleActivate(
  payload: CycleActivatePayload
): Promise<void> {
  const { cycleId, companyId, userId } = payload;

  const [cycle, company] = await Promise.all([
    prisma.evaluationCycle.findUnique({
      where: { id: cycleId },
      select: { name: true },
    }),
    prisma.company.findUnique({
      where: { id: companyId },
      select: { settings: true },
    }),
  ]);

  if (!cycle) throw new Error(`Cycle not found: ${cycleId}`);

  const notifications = (company?.settings as Record<string, unknown> | null)
    ?.notifications as Record<string, unknown> | undefined;
  const sendInvitations = notifications?.evaluationInvitations !== false;

  const assignments = await prisma.evaluationAssignment.findMany({
    where: { cycleId },
    select: {
      id: true,
      token: true,
      subjectId: true,
      reviewerId: true,
      direction: true,
    },
  });

  if (assignments.length === 0) return;

  // Fetch user info
  const userIds = new Set<string>();
  for (const a of assignments) {
    userIds.add(a.reviewerId);
    userIds.add(a.subjectId);
  }

  const users = await prisma.user.findMany({
    where: { id: { in: Array.from(userIds) } },
    select: { id: true, email: true, name: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  // Group assignments by reviewer
  const byReviewer = new Map<string, typeof assignments>();
  for (const a of assignments) {
    const list = byReviewer.get(a.reviewerId) ?? [];
    list.push(a);
    byReviewer.set(a.reviewerId, list);
  }

  // Build one email per reviewer
  const emailJobs: Array<{
    type: typeof JOB_TYPES.EMAIL_SEND;
    payload: EmailSendPayload;
  }> = [];

  for (const [reviewerId, reviewerAssignments] of byReviewer) {
    const reviewer = userMap.get(reviewerId);
    if (!reviewer) continue;

    // Upsert CycleReviewerLink (idempotent for retries) — always created so
    // reviewers can access evaluations regardless of invitation email setting
    const reviewerLink = await prisma.cycleReviewerLink.upsert({
      where: { cycleId_reviewerId: { cycleId, reviewerId } },
      create: { cycleId, reviewerId },
      update: {},
    });

    if (!sendInvitations) continue;

    const summaryUrl = `${APP_URL}/review/${reviewerLink.token}`;

    const subjectList = reviewerAssignments.map((a) => ({
      subjectName: userMap.get(a.subjectId)?.name ?? "Unknown",
      direction: DIRECTION_LABELS[a.direction] ?? a.direction,
    }));

    const { html, text } = getSummaryInviteEmail(
      reviewer.name,
      cycle.name,
      subjectList,
      summaryUrl
    );

    const count = subjectList.length;
    emailJobs.push({
      type: JOB_TYPES.EMAIL_SEND,
      payload: {
        to: reviewer.email,
        subject: `${cycle.name} — ${count} Evaluation${count === 1 ? "" : "s"} to Complete`,
        html,
        text,
      },
    });
  }

  if (emailJobs.length > 0) {
    await enqueueBatch(emailJobs);
  }

  await writeAuditLog({
    companyId,
    userId,
    action: "cycle_activate",
    target: `cycle:${cycleId}`,
    metadata: {
      totalAssignments: assignments.length,
      uniqueReviewers: byReviewer.size,
      emailsQueued: emailJobs.length,
    },
  });
}

/**
 * Sends summary reminder emails for pending/in-progress assignments, grouped by reviewer.
 */
export async function handleCycleRemind(
  payload: CycleRemindPayload
): Promise<void> {
  const { cycleId, companyId, assignmentId, reviewerId } = payload;

  const [cycle, company] = await Promise.all([
    prisma.evaluationCycle.findUnique({
      where: { id: cycleId },
      select: { name: true, endDate: true, status: true },
    }),
    prisma.company.findUnique({
      where: { id: companyId },
      select: { settings: true },
    }),
  ]);

  if (!cycle || cycle.status !== "ACTIVE") return;

  const notifications = (company?.settings as Record<string, unknown> | null)
    ?.notifications as Record<string, unknown> | undefined;
  if (notifications?.cycleReminders === false) return;

  const pendingAssignments = await prisma.evaluationAssignment.findMany({
    where: {
      cycleId,
      status: { in: ["PENDING", "IN_PROGRESS"] },
      ...(assignmentId ? { id: assignmentId } : {}),
      ...(reviewerId ? { reviewerId } : {}),
    },
    select: {
      token: true,
      reviewerId: true,
      subjectId: true,
      direction: true,
    },
  });

  if (pendingAssignments.length === 0) return;

  const userIds = Array.from(
    new Set(pendingAssignments.flatMap((a) => [a.reviewerId, a.subjectId]))
  );

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true, name: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  const deadline = cycle.endDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Group by reviewer
  const byReviewer = new Map<string, typeof pendingAssignments>();
  for (const a of pendingAssignments) {
    const list = byReviewer.get(a.reviewerId) ?? [];
    list.push(a);
    byReviewer.set(a.reviewerId, list);
  }

  const emailJobs: Array<{
    type: typeof JOB_TYPES.EMAIL_SEND;
    payload: EmailSendPayload;
  }> = [];

  for (const [reviewerId, reviewerAssignments] of byReviewer) {
    const reviewer = userMap.get(reviewerId);
    if (!reviewer) continue;

    // Look up existing CycleReviewerLink (created during activation)
    const reviewerLink = await prisma.cycleReviewerLink.findUnique({
      where: { cycleId_reviewerId: { cycleId, reviewerId } },
    });
    if (!reviewerLink) continue;

    const summaryUrl = `${APP_URL}/review/${reviewerLink.token}`;

    const subjectList = reviewerAssignments.map((a) => ({
      subjectName: userMap.get(a.subjectId)?.name ?? "Unknown",
      direction: DIRECTION_LABELS[a.direction] ?? a.direction,
    }));

    const count = subjectList.length;
    const { html, text } = getSummaryReminderEmail(
      reviewer.name,
      cycle.name,
      deadline,
      subjectList,
      summaryUrl
    );

    emailJobs.push({
      type: JOB_TYPES.EMAIL_SEND,
      payload: {
        to: reviewer.email,
        subject: `Reminder: ${count} Pending Evaluation${count === 1 ? "" : "s"} — ${cycle.name}`,
        html,
        text,
      },
    });
  }

  if (emailJobs.length > 0) {
    await enqueueBatch(emailJobs);
  }

  await writeAuditLog({
    companyId,
    action: "cycle_remind",
    target: `cycle:${cycleId}`,
    metadata: { remindersQueued: emailJobs.length },
  });
}

/**
 * Closes all ACTIVE cycles past their endDate.
 */
export async function handleCycleAutoClose(
  _payload: CycleAutoClosePayload
): Promise<void> {
  const overdueCycles = await prisma.evaluationCycle.findMany({
    where: {
      status: "ACTIVE",
      endDate: { lt: new Date() },
    },
    select: { id: true, companyId: true, name: true },
  });

  for (const cycle of overdueCycles) {
    await prisma.evaluationCycle.update({
      where: { id: cycle.id },
      data: { status: "CLOSED" },
    });

    await writeAuditLog({
      companyId: cycle.companyId,
      action: "cycle_close",
      target: `cycle:${cycle.id}`,
      metadata: { reason: "auto-close (past deadline)" },
    });

    console.log(`[Jobs] Auto-closed cycle "${cycle.name}" (${cycle.id})`);
  }

  // Safety net: close ACTIVE cycles where 100% of assignments are submitted
  const completedCycles = await prisma.evaluationCycle.findMany({
    where: {
      status: "ACTIVE",
      assignments: {
        every: { status: "SUBMITTED" },
        some: {},
      },
    },
    select: { id: true, companyId: true, name: true },
  });

  for (const cycle of completedCycles) {
    await prisma.evaluationCycle.update({
      where: { id: cycle.id },
      data: { status: "CLOSED" },
    });

    await writeAuditLog({
      companyId: cycle.companyId,
      action: "cycle_close",
      target: `cycle:${cycle.id}`,
      metadata: { reason: "auto-close (100% completion)" },
    });

    console.log(`[Jobs] Auto-closed cycle "${cycle.name}" (${cycle.id}) — 100% complete`);
  }
}
