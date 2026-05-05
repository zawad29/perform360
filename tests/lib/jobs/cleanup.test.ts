import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { pruneOldJobs } from "@/lib/queue";
import { handleCleanupOtpSessions } from "@/lib/jobs/cleanup";

describe("handleCleanupOtpSessions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes expired verified sessions and unverified OTPs", async () => {
    vi.mocked(prisma.otpSession.deleteMany)
      .mockResolvedValueOnce({ count: 5 } as any)   // expired verified
      .mockResolvedValueOnce({ count: 3 } as any);   // expired unverified
    vi.mocked(pruneOldJobs).mockResolvedValue(10);
    vi.mocked(prisma.auditLog.deleteMany).mockResolvedValue({ count: 0 } as any);

    await handleCleanupOtpSessions({});

    // First call: expired verified sessions
    expect(prisma.otpSession.deleteMany).toHaveBeenNthCalledWith(1, {
      where: {
        verifiedAt: { not: null },
        sessionExpiry: { lt: expect.any(Date) },
      },
    });

    // Second call: expired unverified OTPs
    expect(prisma.otpSession.deleteMany).toHaveBeenNthCalledWith(2, {
      where: {
        verifiedAt: null,
        expiresAt: { lt: expect.any(Date) },
      },
    });

    // Also prunes old jobs
    expect(pruneOldJobs).toHaveBeenCalledTimes(1);

    // Trims old audit logs
    expect(prisma.auditLog.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: expect.any(Date) } },
    });
  });

  it("handles zero records gracefully", async () => {
    vi.mocked(prisma.otpSession.deleteMany)
      .mockResolvedValueOnce({ count: 0 } as any)
      .mockResolvedValueOnce({ count: 0 } as any);
    vi.mocked(pruneOldJobs).mockResolvedValue(0);
    vi.mocked(prisma.auditLog.deleteMany).mockResolvedValue({ count: 0 } as any);

    await expect(handleCleanupOtpSessions({})).resolves.not.toThrow();
  });
});
