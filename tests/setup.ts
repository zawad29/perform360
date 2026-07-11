import { vi } from "vitest";

// Mock Prisma client globally
vi.mock("@/lib/prisma", () => {
  const prisma = {
    user: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    team: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    teamMember: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    evaluationCycle: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    evaluationAssignment: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn(), create: vi.fn(), createMany: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn(), groupBy: vi.fn() },
    evaluationTemplate: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    evaluationResponse: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    cycleTeam: { findMany: vi.fn(), createMany: vi.fn(), count: vi.fn(), deleteMany: vi.fn(), update: vi.fn() },
    cycleSubjectTemplate: { findMany: vi.fn(() => Promise.resolve([])), findFirst: vi.fn(), create: vi.fn(), createMany: vi.fn(), update: vi.fn(), upsert: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    calibrationAdjustment: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), upsert: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    auditLog: { create: vi.fn(), findMany: vi.fn(), count: vi.fn(), deleteMany: vi.fn() },
    jobQueue: { create: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    otpSession: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn(), count: vi.fn() },
    cycleReviewerLink: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), upsert: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    company: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    session: { deleteMany: vi.fn() },
    recoveryCode: { findMany: vi.fn(), count: vi.fn(), create: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn(), update: vi.fn() },
    authUser: { findUnique: vi.fn(), create: vi.fn(), upsert: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn() },
    account: { deleteMany: vi.fn() },
    $transaction: vi.fn((cb: unknown) =>
      typeof cb === "function" ? cb({}) : Promise.all(cb as Promise<unknown>[])
    ),
    $queryRawUnsafe: vi.fn(),
    $queryRaw: vi.fn(),
  };
  return { prisma };
});

// Mock NextAuth
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

// Mock email service
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  sendEmailWithAttachments: vi.fn().mockResolvedValue(undefined),
  getOTPEmail: vi.fn().mockReturnValue({ html: "<p>OTP</p>", text: "OTP" }),
  getUserInviteEmail: vi.fn().mockReturnValue({ html: "<p>Invite</p>", text: "Invite" }),
  getEvaluationInviteEmail: vi.fn().mockReturnValue({ html: "<p>Invite</p>", text: "Invite" }),
  getEvaluationReminderEmail: vi.fn().mockReturnValue({ html: "<p>Reminder</p>", text: "Reminder" }),
  getSummaryInviteEmail: vi.fn().mockReturnValue({ html: "<p>Summary Invite</p>", text: "Summary Invite" }),
  getSummaryReminderEmail: vi.fn().mockReturnValue({ html: "<p>Summary Reminder</p>", text: "Summary Reminder" }),
  getDataExportEmail: vi.fn().mockReturnValue({ html: "<p>Export</p>", text: "Export" }),
}));

// Mock encryption session
vi.mock("@/lib/encryption-session", () => ({
  getDataKeyFromRequest: vi.fn().mockReturnValue(null),
  encryptDataKeyForCookie: vi.fn().mockReturnValue("encrypted-cookie-value"),
  decryptDataKeyFromCookie: vi.fn().mockReturnValue(null),
  COOKIE_NAME: "_enc_dk",
  COOKIE_MAX_AGE: 14400,
}));

// Mock queue
vi.mock("@/lib/queue", () => ({
  enqueue: vi.fn().mockResolvedValue("job-123"),
  enqueueBatch: vi.fn().mockResolvedValue(["job-1", "job-2"]),
  getJobStatus: vi.fn().mockResolvedValue(null),
  pruneOldJobs: vi.fn().mockResolvedValue(5),
}));

// Mock rate-limit
vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: vi.fn().mockReturnValue(null),
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true }),
  rateLimitResponse: vi.fn(),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  AUTH_RATE_LIMIT: { maxRequests: 5, windowMs: 900000 },
  API_RATE_LIMIT: { maxRequests: 100, windowMs: 60000 },
  OTP_SEND_RATE_LIMIT: { maxRequests: 5, windowMs: 3600000 },
}));

// Mock audit
vi.mock("@/lib/audit", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

// Mock session validation
vi.mock("@/lib/session-validation", () => ({
  validateEvaluationSession: vi.fn(),
  validateSummarySession: vi.fn(),
}));
