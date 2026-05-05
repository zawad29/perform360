import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { enqueueBatch } from "@/lib/queue";
import { sendEmail, getSummaryInviteEmail, getSummaryReminderEmail } from "@/lib/email";
import { writeAuditLog } from "@/lib/audit";

const { handleCycleActivate, handleCycleRemind, handleCycleAutoClose } =
  await import("@/lib/jobs/cycle");
const { handleEmailSend } = await import("@/lib/jobs/email");
const { handleCleanupOtpSessions } = await import("@/lib/jobs/cleanup");

describe("Job: handleEmailSend", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends email with correct params", async () => {
    await handleEmailSend({
      to: "user@test.com",
      subject: "Hello",
      html: "<p>Hi</p>",
      text: "Hi",
    });

    expect(sendEmail).toHaveBeenCalledWith({
      to: "user@test.com",
      subject: "Hello",
      html: "<p>Hi</p>",
      text: "Hi",
    });
  });
});

describe("Job: handleCycleActivate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("groups assignments by reviewer and enqueues one email per reviewer", async () => {
    vi.mocked(prisma.evaluationCycle.findUnique).mockResolvedValue({
      name: "Q1 2026",
    } as any);

    vi.mocked(prisma.evaluationAssignment.findMany).mockResolvedValue([
      { id: "a1", token: "tok1", subjectId: "s1", reviewerId: "r1", direction: "LATERAL" },
      { id: "a2", token: "tok2", subjectId: "s2", reviewerId: "r1", direction: "DOWNWARD" },
    ] as any);

    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: "r1", email: "reviewer@test.com", name: "Reviewer" },
      { id: "s1", email: "subject1@test.com", name: "Subject 1" },
      { id: "s2", email: "subject2@test.com", name: "Subject 2" },
    ] as any);

    vi.mocked(prisma.cycleReviewerLink.upsert).mockResolvedValue({
      id: "rl-1",
      token: "summary-token-1",
      cycleId: "cycle-1",
      reviewerId: "r1",
    } as any);

    await handleCycleActivate({
      cycleId: "cycle-1",
      companyId: "co-1",
      userId: "u1",
      cachedDataKeyEncrypted: "key",
    });

    // Should upsert one CycleReviewerLink
    expect(prisma.cycleReviewerLink.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.cycleReviewerLink.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { cycleId_reviewerId: { cycleId: "cycle-1", reviewerId: "r1" } },
        create: { cycleId: "cycle-1", reviewerId: "r1" },
        update: {},
      })
    );

    // Should call getSummaryInviteEmail
    expect(getSummaryInviteEmail).toHaveBeenCalledWith(
      "Reviewer",
      "Q1 2026",
      expect.arrayContaining([
        expect.objectContaining({ subjectName: "Subject 1" }),
        expect.objectContaining({ subjectName: "Subject 2" }),
      ]),
      expect.stringContaining("/review/summary-token-1")
    );

    // Should enqueue exactly one email (grouped)
    expect(enqueueBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          payload: expect.objectContaining({ to: "reviewer@test.com" }),
        }),
      ])
    );

    // Audit log should include uniqueReviewers count
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "cycle_activate",
        metadata: expect.objectContaining({
          totalAssignments: 2,
          uniqueReviewers: 1,
          emailsQueued: 1,
        }),
      })
    );
  });

  it("sends separate emails for different reviewers", async () => {
    vi.mocked(prisma.evaluationCycle.findUnique).mockResolvedValue({
      name: "Q1 2026",
    } as any);

    vi.mocked(prisma.evaluationAssignment.findMany).mockResolvedValue([
      { id: "a1", token: "tok1", subjectId: "s1", reviewerId: "r1", direction: "LATERAL" },
      { id: "a2", token: "tok2", subjectId: "s1", reviewerId: "r2", direction: "DOWNWARD" },
    ] as any);

    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: "r1", email: "reviewer1@test.com", name: "Reviewer 1" },
      { id: "r2", email: "reviewer2@test.com", name: "Reviewer 2" },
      { id: "s1", email: "subject@test.com", name: "Subject" },
    ] as any);

    vi.mocked(prisma.cycleReviewerLink.upsert)
      .mockResolvedValueOnce({ id: "rl-1", token: "tok-r1", cycleId: "c1", reviewerId: "r1" } as any)
      .mockResolvedValueOnce({ id: "rl-2", token: "tok-r2", cycleId: "c1", reviewerId: "r2" } as any);

    await handleCycleActivate({
      cycleId: "c1",
      companyId: "co-1",
      userId: "u1",
      cachedDataKeyEncrypted: "key",
    });

    expect(prisma.cycleReviewerLink.upsert).toHaveBeenCalledTimes(2);
    expect(enqueueBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ payload: expect.objectContaining({ to: "reviewer1@test.com" }) }),
        expect.objectContaining({ payload: expect.objectContaining({ to: "reviewer2@test.com" }) }),
      ])
    );
  });

  it("throws if cycle not found", async () => {
    vi.mocked(prisma.evaluationCycle.findUnique).mockResolvedValue(null);

    await expect(
      handleCycleActivate({
        cycleId: "bad",
        companyId: "co-1",
        userId: "u1",
        cachedDataKeyEncrypted: "key",
      })
    ).rejects.toThrow("Cycle not found");
  });

  it("returns early when no assignments exist", async () => {
    vi.mocked(prisma.evaluationCycle.findUnique).mockResolvedValue({
      name: "Q1",
    } as any);
    vi.mocked(prisma.evaluationAssignment.findMany).mockResolvedValue([]);

    await handleCycleActivate({
      cycleId: "c1",
      companyId: "co-1",
      userId: "u1",
      cachedDataKeyEncrypted: "key",
    });

    expect(enqueueBatch).not.toHaveBeenCalled();
  });
});

describe("Job: handleCycleRemind", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends grouped reminders for pending assignments", async () => {
    vi.mocked(prisma.evaluationCycle.findUnique).mockResolvedValue({
      name: "Q1 2026",
      endDate: new Date("2026-04-01"),
      status: "ACTIVE",
    } as any);

    vi.mocked(prisma.evaluationAssignment.findMany).mockResolvedValue([
      { token: "tok1", reviewerId: "r1", subjectId: "s1", direction: "LATERAL" },
      { token: "tok2", reviewerId: "r1", subjectId: "s2", direction: "DOWNWARD" },
    ] as any);

    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: "r1", email: "reviewer@test.com", name: "Reviewer" },
      { id: "s1", email: "subject1@test.com", name: "Subject 1" },
      { id: "s2", email: "subject2@test.com", name: "Subject 2" },
    ] as any);

    vi.mocked(prisma.cycleReviewerLink.findUnique).mockResolvedValue({
      id: "rl-1",
      token: "summary-tok",
      cycleId: "c1",
      reviewerId: "r1",
    } as any);

    await handleCycleRemind({ cycleId: "c1", companyId: "co-1" });

    expect(prisma.cycleReviewerLink.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { cycleId_reviewerId: { cycleId: "c1", reviewerId: "r1" } },
      })
    );

    expect(getSummaryReminderEmail).toHaveBeenCalledWith(
      "Reviewer",
      "Q1 2026",
      expect.any(String), // deadline string
      expect.arrayContaining([
        expect.objectContaining({ subjectName: "Subject 1" }),
        expect.objectContaining({ subjectName: "Subject 2" }),
      ]),
      expect.stringContaining("/review/summary-tok")
    );

    expect(enqueueBatch).toHaveBeenCalled();
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "cycle_remind" })
    );
  });

  it("skips reviewer without CycleReviewerLink", async () => {
    vi.mocked(prisma.evaluationCycle.findUnique).mockResolvedValue({
      name: "Q1 2026",
      endDate: new Date("2026-04-01"),
      status: "ACTIVE",
    } as any);

    vi.mocked(prisma.evaluationAssignment.findMany).mockResolvedValue([
      { token: "tok1", reviewerId: "r1", subjectId: "s1", direction: "LATERAL" },
    ] as any);

    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: "r1", email: "reviewer@test.com", name: "Reviewer" },
      { id: "s1", email: "subject@test.com", name: "Subject" },
    ] as any);

    // No reviewer link found
    vi.mocked(prisma.cycleReviewerLink.findUnique).mockResolvedValue(null);

    await handleCycleRemind({ cycleId: "c1", companyId: "co-1" });

    // No emails should be queued (no reviewer link)
    expect(enqueueBatch).not.toHaveBeenCalled();
  });

  it("skips non-ACTIVE cycle", async () => {
    vi.mocked(prisma.evaluationCycle.findUnique).mockResolvedValue({
      name: "Q1",
      status: "CLOSED",
    } as any);

    await handleCycleRemind({ cycleId: "c1", companyId: "co-1" });

    expect(prisma.evaluationAssignment.findMany).not.toHaveBeenCalled();
  });
});

describe("Job: handleCycleAutoClose", () => {
  beforeEach(() => vi.clearAllMocks());

  it("closes overdue ACTIVE cycles", async () => {
    vi.mocked(prisma.evaluationCycle.findMany)
      .mockResolvedValueOnce([
        { id: "c1", companyId: "co-1", name: "Q1" },
        { id: "c2", companyId: "co-2", name: "Q2" },
      ] as any)
      .mockResolvedValueOnce([] as any); // no 100%-complete cycles

    vi.mocked(prisma.evaluationCycle.update).mockResolvedValue({} as any);

    await handleCycleAutoClose({});

    expect(prisma.evaluationCycle.update).toHaveBeenCalledTimes(2);
    expect(writeAuditLog).toHaveBeenCalledTimes(2);
  });

  it("closes cycles that reached 100% completion", async () => {
    vi.mocked(prisma.evaluationCycle.findMany)
      .mockResolvedValueOnce([] as any) // no overdue cycles
      .mockResolvedValueOnce([
        { id: "c3", companyId: "co-1", name: "Q3" },
      ] as any);

    vi.mocked(prisma.evaluationCycle.update).mockResolvedValue({} as any);

    await handleCycleAutoClose({});

    expect(prisma.evaluationCycle.update).toHaveBeenCalledTimes(1);
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { reason: "auto-close (100% completion)" },
      })
    );
  });

  it("does nothing when no overdue or completed cycles", async () => {
    vi.mocked(prisma.evaluationCycle.findMany)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any);

    await handleCycleAutoClose({});

    expect(prisma.evaluationCycle.update).not.toHaveBeenCalled();
  });
});

describe("Job: handleCleanupOtpSessions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes expired sessions and OTPs", async () => {
    vi.mocked(prisma.otpSession.deleteMany)
      .mockResolvedValueOnce({ count: 3 } as any)
      .mockResolvedValueOnce({ count: 5 } as any);
    vi.mocked(prisma.auditLog.deleteMany).mockResolvedValue({ count: 0 } as any);

    await handleCleanupOtpSessions({});

    expect(prisma.otpSession.deleteMany).toHaveBeenCalledTimes(2);
  });
});
