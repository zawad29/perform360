import type { Prisma } from "@prisma/client";

// ─── Job Type Registry ───

export const JOB_TYPES = {
  EMAIL_SEND: "email.send",
  CYCLE_ACTIVATE: "cycle.activate",
  CYCLE_REMIND: "cycle.remind",
  CYCLE_AUTO_CLOSE: "cycle.auto-close",
  ENCRYPTION_ROTATE_KEY: "encryption.rotate-key",
  CLEANUP_OTP_SESSIONS: "cleanup.otp-sessions",
  DATA_EXPORT: "data.export",
  REPORTS_EXPORT_CYCLE_EXCEL: "reports.export-cycle-excel",
} as const;

export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES];

// ─── Payload Types ───

export interface EmailSendPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface CycleActivatePayload {
  cycleId: string;
  companyId: string;
  userId: string;
  cachedDataKeyEncrypted: string;
}

export interface CycleRemindPayload {
  cycleId: string;
  companyId: string;
  assignmentId?: string;
  reviewerId?: string;
}

export type CycleAutoClosePayload = Record<string, never>;

export interface EncryptionRotateKeyPayload {
  companyId: string;
  userId: string;
  masterKeyHex: string;
  oldDataKeyHex: string;
  newKeyVersion: number;
}

export type CleanupOtpSessionsPayload = Record<string, never>;

export interface DataExportPayload {
  companyId: string;
  userId: string;
  userEmail: string;
  dataKeyHex: string;
}

export interface ReportsExportCycleExcelPayload {
  cycleId: string;
  companyId: string;
  userId: string;
  userEmail: string;
  dataKeyHex: string;
}

// ─── Payload Map ───

export interface JobPayloadMap {
  "email.send": EmailSendPayload;
  "cycle.activate": CycleActivatePayload;
  "cycle.remind": CycleRemindPayload;
  "cycle.auto-close": CycleAutoClosePayload;
  "encryption.rotate-key": EncryptionRotateKeyPayload;
  "cleanup.otp-sessions": CleanupOtpSessionsPayload;
  "data.export": DataExportPayload;
  "reports.export-cycle-excel": ReportsExportCycleExcelPayload;
}

// ─── Handler Interface ───

export type JobHandler<T extends JobType = JobType> = (
  payload: JobPayloadMap[T],
  jobId: string
) => Promise<void>;

// ─── Enqueue Options ───

export interface EnqueueOptions {
  priority?: number;
  maxAttempts?: number;
  runAt?: Date;
}

// ─── Job Row (raw SQL return type) ───

export interface JobRow {
  id: string;
  type: string;
  payload: Prisma.JsonValue;
  status: string;
  priority: number;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  runAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
