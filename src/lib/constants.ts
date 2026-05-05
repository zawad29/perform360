export const APP_NAME = "Performs360";
export const APP_DESCRIPTION = "360° Performance Evaluation Platform";

export const OTP_CONFIG = {
  length: 6,
  expiryMinutes: 10,
  maxAttempts: 3,
  cooldownMinutes: 15,
  sessionDurationHours: 4,
  summarySessionDurationHours: 4,
  rateLimitPerEmail: 5,
} as const;

export const ROLES = {
  ADMIN: "ADMIN",
  HR: "HR",
  EMPLOYEE: "EMPLOYEE",
  EXTERNAL: "EXTERNAL",
} as const;

export const CYCLE_STATUSES = {
  DRAFT: "DRAFT",
  ACTIVE: "ACTIVE",
  CLOSED: "CLOSED",
  ARCHIVED: "ARCHIVED",
} as const;

export const ASSIGNMENT_STATUSES = {
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  SUBMITTED: "SUBMITTED",
} as const;

export const TEAM_ROLES = {
  MANAGER: "MANAGER",
  MEMBER: "MEMBER",
  EXTERNAL: "EXTERNAL",
} as const;

export const ENCRYPTION_CONFIG = {
  recoveryCodeCount: 8,
  minPassphraseLength: 12,
  maxPassphraseLength: 128,
} as const;

export const JOB_CONFIG = {
  pollIntervalMs: 1000,
  schedulerIntervalMs: 5 * 60 * 1000,
  defaultMaxAttempts: 3,
  retentionDays: 7,
  staleThresholdMinutes: 30,
  reEncryptBatchSize: 100,
} as const;
