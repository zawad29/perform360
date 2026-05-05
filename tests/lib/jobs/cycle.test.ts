import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { enqueueBatch } from "@/lib/queue";
import { writeAuditLog } from "@/lib/audit";
import {
  handleCycleActivate,
  handleCycleRemind,
  handleCycleAutoClose,
} from "@/lib/jobs/cycle";

describe("handleCycleActivate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates reviewer links and enqueues invite emails", async () => {
    vi.mocked(prisma.evaluationCycle.findUnique).mockResolvedValue({
      name: "Q1 2026",
    } as any);
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      settings: { notifications: { evaluationInvitations: true } },
    } as any);

    vi.mocked(prisma.evaluationAssignment.findMany).mockResolvedValue([
      { id: "a1", token: "tok-1", subjectId: "u-sub", reviewerId: "u-rev", direction: "LATERAL" },
    ] as any);

    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: "u-rev", email: "reviewer@test.com", name: "Reviewer" },
      { id: "u-sub", email: "subject@test.com", name: "Subject" },
    ] as any);

    vi.mocked(prisma.cycleReviewerLink.upsert).mockResolvedValue({
      token: "link-token-1",
    } as any);

    await handleCycleActivate({
      cycleId: "cycle-1",
      companyId: "co-1",
      userId: "admin-1",
      cachedDataKeyEncrypted: "encrypted-key-1",
    });

    expect(prisma.cycleReviewerLink.upsert).toHaveBeenCalledTimes(1);
    expect(enqueueBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          type: "email.send",
          payload: expect.objectContaining({
            to: "reviewer@test.com",
          }),
        }),
      ])
    );
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "cycle_activate",
        target: "cycle:cycle-1",
      })
    );
  });

  it("skips emails when company notifications are disabled", async () => {
    vi.mocked(prisma.evaluationCycle.findUnique).mockResolvedValue({ name: "Q1" } as any);
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      settings: { notifications: { evaluationInvitations: false } },
    } as any);

    vi.mocked(prisma.evaluationAssignment.findMany).mockResolvedValue([
      { id: "a1", token: "t", subjectId: "s", reviewerId: "r", direction: "LATERAL" },
    ] as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: "r", email: "r@t.com", name: "R" },
      { id: "s", email: "s@t.com", name: "S" },
    ] as any);
    vi.mocked(prisma.cycleReviewerLink.upsert).mockResolvedValue({ token: "t" } as any);

    await handleCycleActivate({ cycleId: "c1", companyId: "co-1", userId: "u1", cachedDataKeyEncrypted: "encrypted-key-1" });

    // Links still created, but no emails enqueued
    expect(prisma.cycleReviewerLink.upsert).toHaveBeenCalled();
    expect(enqueueBatch).not.toHaveBeenCalled();
  });

  it("returns early when no assignments exist", async () => {
    vi.mocked(prisma.evaluationCycle.findUnique).mockResolvedValue({ name: "Q1" } as any);
    vi.mocked(prisma.company.findUnique).mockResolvedValue({ settings: null } as any);
    vi.mocked(prisma.evaluationAssignment.findMany).mockResolvedValue([]);

    await handleCycleActivate({ cycleId: "c1", companyId: "co-1", userId: "u1", cachedDataKeyEncrypted: "encrypted-key-1" });

    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(enqueueBatch).not.toHaveBeenCalled();
  });

  it("throws when cycle not found", async () => {
    vi.mocked(prisma.evaluationCycle.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.company.findUnique).mockResolvedValue({ settings: null } as any);

    await expect(
      handleCycleActivate({ cycleId: "bad-id", companyId: "co-1", userId: "u1", cachedDataKeyEncrypted: "encrypted-key-1" })
    ).rejects.toThrow("Cycle not found");
  });
});

describe("handleCycleRemind", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends reminders for pending assignments", async () => {
    vi.mocked(prisma.evaluationCycle.findUnique).mockResolvedValue({
      name: "Q1",
      endDate: new Date("2026-06-30"),
      status: "ACTIVE",
    } as any);
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      settings: { notifications: {} },
    } as any);

    vi.mocked(prisma.evaluationAssignment.findMany).mockResolvedValue([
      { token: "t1", reviewerId: "r1", subjectId: "s1", direction: "LATERAL" },
    ] as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: "r1", email: "r@t.com", name: "Reviewer" },
      { id: "s1", email: "s@t.com", name: "Subject" },
    ] as any);
    vi.mocked(prisma.cycleReviewerLink.findUnique).mockResolvedValue({
      token: "link-tok",
    } as any);

    await handleCycleRemind({ cycleId: "c1", companyId: "co-1" });

    expect(enqueueBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          payload: expect.objectContaining({
            to: "r@t.com",
            subject: expect.stringContaining("Reminder"),
          }),
        }),
      ])
    );
  });

  it("skips when cycle is not active", async () => {
    vi.mocked(prisma.evaluationCycle.findUnique).mockResolvedValue({
      name: "Q1",
      status: "CLOSED",
    } as any);
    vi.mocked(prisma.company.findUnique).mockResolvedValue({ settings: null } as any);

    await handleCycleRemind({ cycleId: "c1", companyId: "co-1" });

    expect(prisma.evaluationAssignment.findMany).not.toHaveBeenCalled();
  });

  it("skips when reminders are disabled in settings", async () => {
    vi.mocked(prisma.evaluationCycle.findUnique).mockResolvedValue({
      name: "Q1",
      endDate: new Date(),
      status: "ACTIVE",
    } as any);
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      settings: { notifications: { cycleReminders: false } },
    } as any);

    await handleCycleRemind({ cycleId: "c1", companyId: "co-1" });

    expect(prisma.evaluationAssignment.findMany).not.toHaveBeenCalled();
  });
});

describe("handleCycleAutoClose", () => {
  beforeEach(() => vi.clearAllMocks());

  it("closes overdue active cycles", async () => {
    vi.mocked(prisma.evaluationCycle.findMany)
      .mockResolvedValueOnce([
        { id: "c1", companyId: "co-1", name: "Overdue Cycle" },
      ] as any)
      .mockResolvedValueOnce([] as any); // 100% completion query

    vi.mocked(prisma.evaluationCycle.update).mockResolvedValue({} as any);

    await handleCycleAutoClose({});

    expect(prisma.evaluationCycle.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { status: "CLOSED" },
    });
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "cycle_close",
        metadata: expect.objectContaining({ reason: expect.stringContaining("past deadline") }),
      })
    );
  });

  it("closes cycles where all assignments are submitted", async () => {
    vi.mocked(prisma.evaluationCycle.findMany)
      .mockResolvedValueOnce([] as any) // no overdue
      .mockResolvedValueOnce([
        { id: "c2", companyId: "co-1", name: "Complete Cycle" },
      ] as any);

    vi.mocked(prisma.evaluationCycle.update).mockResolvedValue({} as any);

    await handleCycleAutoClose({});

    expect(prisma.evaluationCycle.update).toHaveBeenCalledWith({
      where: { id: "c2" },
      data: { status: "CLOSED" },
    });
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ reason: expect.stringContaining("100% completion") }),
      })
    );
  });

  it("does nothing when no cycles need closing", async () => {
    vi.mocked(prisma.evaluationCycle.findMany)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any);

    await handleCycleAutoClose({});

    expect(prisma.evaluationCycle.update).not.toHaveBeenCalled();
  });
});
