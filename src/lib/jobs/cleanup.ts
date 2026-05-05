import { prisma } from "@/lib/prisma";
import { pruneOldJobs } from "@/lib/queue";
import type { CleanupOtpSessionsPayload } from "@/types/job";

// AuditLog rows older than this are deleted by the cleanup job.
// Compliance/audit retention is bounded — without pruning the table grows
// unbounded since every decryption / role change / cycle action writes a row.
const AUDIT_LOG_RETENTION_DAYS = 365;

/**
 * Deletes expired OTP sessions, prunes old completed/dead jobs, and trims
 * audit logs past retention.
 */
export async function handleCleanupOtpSessions(
  _payload: CleanupOtpSessionsPayload
): Promise<void> {
  const now = new Date();

  // Delete expired verified sessions (past sessionExpiry)
  const expiredSessions = await prisma.otpSession.deleteMany({
    where: {
      verifiedAt: { not: null },
      sessionExpiry: { lt: now },
    },
  });

  // Delete expired unverified OTPs (past expiresAt, never verified)
  const expiredOtps = await prisma.otpSession.deleteMany({
    where: {
      verifiedAt: null,
      expiresAt: { lt: now },
    },
  });

  // Prune old completed/dead jobs
  const prunedJobs = await pruneOldJobs();

  // Trim audit logs past retention window
  const auditCutoff = new Date(now.getTime() - AUDIT_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const prunedAuditLogs = await prisma.auditLog.deleteMany({
    where: { createdAt: { lt: auditCutoff } },
  });

  console.log(
    `[Jobs] Cleanup: ${expiredSessions.count} expired sessions, ` +
    `${expiredOtps.count} expired OTPs, ${prunedJobs} old jobs, ` +
    `${prunedAuditLogs.count} audit logs pruned (>${AUDIT_LOG_RETENTION_DAYS}d)`
  );
}
