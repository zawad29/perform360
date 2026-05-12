import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

type AuditAction =
  | "decryption"
  | "role_change"
  | "user_invite"
  | "user_deactivate"
  | "cycle_activate"
  | "cycle_remind"
  | "cycle_close"
  | "encryption_setup"
  | "encryption_hard_reset"
  | "encryption_passphrase_change"
  | "encryption_recovery"
  | "recovery_codes_regenerate"
  | "key_rotation"
  | "bulk_import"
  | "data_export"
  | "calibration_adjust";

interface AuditLogInput {
  companyId: string;
  userId?: string;
  action: AuditAction;
  target?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}

/**
 * Write an audit log entry. Fire-and-forget — errors are logged but not thrown.
 */
export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        companyId: input.companyId,
        userId: input.userId ?? null,
        action: input.action,
        target: input.target ?? null,
        metadata: (input.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        ip: input.ip ?? null,
      },
    });
  } catch (error) {
    console.error("[AuditLog] Failed to write audit log:", error);
  }
}
