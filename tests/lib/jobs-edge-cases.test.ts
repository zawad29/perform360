import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { enqueueBatch } from "@/lib/queue";
import { getSummaryInviteEmail } from "@/lib/email";
import { writeAuditLog } from "@/lib/audit";

const { handleCycleActivate, handleCycleRemind, handleCycleAutoClose } =
  await import("@/lib/jobs/cycle");
const { handleCleanupOtpSessions } = await import("@/lib/jobs/cleanup");

describe("Job: handleCycleActivate — edge cases", () => {
  beforeEach(() => vi.clearAllMocks());

  it("skips reviewer not found in user lookup", async () => {
    vi.mocked(prisma.evaluationCycle.findUnique).mockResolvedValue({
      name: "Q1 2026",
    } as any);

    vi.mocked(prisma.evaluationAssignment.findMany).mockResolvedValue([
      { id: "a1", token: "tok1", subjectId: "s1", reviewerId: "r-missing", direction: "LATERAL" },
    ] as any);

    // User lookup returns empty — reviewer not found
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as any);

    await handleCycleActivate({
      cycleId: "cycle-1",
      companyId: "co-1",
      userId: "u1",
      cachedDataKeyEncrypted: "key",
    });

    // No emails should be queued since reviewer not found
    expect(enqueueBatch).not.toHaveBeenCalled();
    // Audit log should still be written
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "cycle_activate",
        metadata: expect.objectContaining({
          emailsQueued: 0,
        }),
      })
    );
  });

  it("uses 'Unknown' fallback for missing subject name", async () => {
    vi.mocked(prisma.evaluationCycle.findUnique).mockResolvedValue({
      name: "Q1",
    } as any);

    vi.mocked(prisma.evaluationAssignment.findMany).mockResolvedValue([
      { id: "a1", token: "tok1", subjectId: "s-missing", reviewerId: "r1", direction: "LATERAL" },
    ] as any);

    // Only reviewer found, subject missing
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: "r1", email: "reviewer@test.com", name: "Reviewer" },
    ] as any);

    vi.mocked(prisma.cycleReviewerLink.upsert).mockResolvedValue({
      id: "rl-1",
      token: "summary-tok",
      cycleId: "c1",
      reviewerId: "r1",
    } as any);

    await handleCycleActivate({
      cycleId: "c1",
      companyId: "co-1",
      userId: "u1",
      cachedDataKeyEncrypted: "key",
    });

    expect(getSummaryInviteEmail).toHaveBeenCalledWith(
      "Reviewer",
      "Q1",
      expect.arrayContaining([
        expect.objectContaining({ subjectName: "Unknown" }),
      ]),
      expect.any(String)
    );
  });
});

describe("Job: handleCycleRemind — edge cases", () => {
  beforeEach(() => vi.clearAllMocks());

  it("filters by assignmentId when provided", async () => {
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

    vi.mocked(prisma.cycleReviewerLink.findUnique).mockResolvedValue({
      id: "rl-1",
      token: "tok-r1",
      cycleId: "c1",
      reviewerId: "r1",
    } as any);

    await handleCycleRemind({
      cycleId: "c1",
      companyId: "co-1",
      assignmentId: "a-specific",
    });

    // Should filter by assignmentId
    expect(prisma.evaluationAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "a-specific",
        }),
      })
    );

    expect(enqueueBatch).toHaveBeenCalled();
  });

  it("returns early when no pending assignments", async () => {
    vi.mocked(prisma.evaluationCycle.findUnique).mockResolvedValue({
      name: "Q1",
      endDate: new Date("2026-04-01"),
      status: "ACTIVE",
    } as any);

    vi.mocked(prisma.evaluationAssignment.findMany).mockResolvedValue([]);

    await handleCycleRemind({ cycleId: "c1", companyId: "co-1" });

    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(enqueueBatch).not.toHaveBeenCalled();
  });

  it("returns early when cycle not found", async () => {
    vi.mocked(prisma.evaluationCycle.findUnique).mockResolvedValue(null);

    await handleCycleRemind({ cycleId: "c-bad", companyId: "co-1" });

    expect(prisma.evaluationAssignment.findMany).not.toHaveBeenCalled();
  });
});

describe("Job: handleCycleAutoClose — edge cases", () => {
  beforeEach(() => vi.clearAllMocks());

  it("processes multiple overdue cycles sequentially", async () => {
    vi.mocked(prisma.evaluationCycle.findMany)
      .mockResolvedValueOnce([
        { id: "c1", companyId: "co-1", name: "Q1" },
        { id: "c2", companyId: "co-1", name: "Q2" },
        { id: "c3", companyId: "co-2", name: "Q3" },
      ] as any)
      .mockResolvedValueOnce([] as any); // no 100%-complete cycles

    vi.mocked(prisma.evaluationCycle.update).mockResolvedValue({} as any);

    await handleCycleAutoClose({});

    expect(prisma.evaluationCycle.update).toHaveBeenCalledTimes(3);
    expect(writeAuditLog).toHaveBeenCalledTimes(3);

    // Verify each cycle was closed
    for (const id of ["c1", "c2", "c3"]) {
      expect(prisma.evaluationCycle.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id },
          data: { status: "CLOSED" },
        })
      );
    }
  });
});

describe("Job: handleCleanupOtpSessions — edge cases", () => {
  beforeEach(() => vi.clearAllMocks());

  it("handles zero expired sessions gracefully", async () => {
    vi.mocked(prisma.otpSession.deleteMany)
      .mockResolvedValueOnce({ count: 0 } as any)
      .mockResolvedValueOnce({ count: 0 } as any);
    vi.mocked(prisma.auditLog.deleteMany).mockResolvedValue({ count: 0 } as any);

    await handleCleanupOtpSessions({});

    expect(prisma.otpSession.deleteMany).toHaveBeenCalledTimes(2);
  });
});
