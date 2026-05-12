import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  deriveKey,
  generateDataKey,
  decryptDataKey,
  encryptDataKey,
} from "@/lib/encryption";
import { encryptDataKeyForCookie } from "@/lib/encryption-session";
import { applyRateLimit } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit";
import { enqueue } from "@/lib/queue";
import { JOB_TYPES } from "@/types/job";

const rotateSchema = z.object({
  passphrase: z.string().min(1, "Passphrase is required"),
});

export async function POST(request: NextRequest) {
  const rl = applyRateLimit(request);
  if (rl) return rl;

  const authResult = await requireRole("ADMIN");
  if (isAuthError(authResult)) return authResult;

  try {
    const body = await request.json();
    const parsed = rotateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { passphrase } = parsed.data;

    const company = await prisma.company.findUnique({
      where: { id: authResult.companyId },
      select: {
        encryptionKeyEncrypted: true,
        encryptionSalt: true,
        encryptionSetupAt: true,
        keyVersion: true,
      },
    });

    if (!company || !company.encryptionSetupAt || !company.encryptionSalt) {
      return NextResponse.json(
        { success: false, error: "Encryption is not set up" },
        { status: 400 }
      );
    }

    // Verify passphrase by decrypting old data key
    const saltBuffer = Buffer.from(company.encryptionSalt, "base64");
    const masterKey = deriveKey(passphrase, saltBuffer);

    let oldDataKey: Buffer;
    try {
      oldDataKey = decryptDataKey(company.encryptionKeyEncrypted, masterKey);
    } catch {
      return NextResponse.json(
        { success: false, error: "Incorrect passphrase" },
        { status: 400 }
      );
    }

    // Generate new data key and encrypt it with existing master key
    const newDataKey = generateDataKey();
    const newEncryptedDataKey = encryptDataKey(newDataKey, masterKey);
    const cachedDataKeyEncrypted = encryptDataKeyForCookie(newDataKey);
    const newKeyVersion = company.keyVersion + 1;

    // Recovery codes store an independently encrypted copy of the data key.
    // Since we only have hashes (not plain codes), we can't re-encrypt under the new key.
    // We must delete them and require regeneration after key rotation.
    const unusedCodes = await prisma.recoveryCode.findMany({
      where: { companyId: authResult.companyId, usedAt: null },
    });
    const recoveryCodesInvalidated = unusedCodes.length > 0;

    // Update company key + version and invalidate recovery codes (sync — fast ops)
    await prisma.$transaction(async (tx) => {
      await tx.company.update({
        where: { id: authResult.companyId },
        data: {
          encryptionKeyEncrypted: newEncryptedDataKey,
          keyVersion: newKeyVersion,
        },
      });

      await tx.evaluationCycle.updateMany({
        where: {
          companyId: authResult.companyId,
          cachedDataKeyEncrypted: { not: null },
        },
        data: { cachedDataKeyEncrypted },
      });

      if (recoveryCodesInvalidated) {
        await tx.recoveryCode.deleteMany({
          where: { companyId: authResult.companyId },
        });
      }
    });

    // Enqueue background re-encryption job (passes derived keys, not passphrase)
    const jobId = await enqueue(
      JOB_TYPES.ENCRYPTION_ROTATE_KEY,
      {
        companyId: authResult.companyId,
        userId: authResult.userId,
        masterKeyHex: masterKey.toString("hex"),
        oldDataKeyHex: oldDataKey.toString("hex"),
        newKeyVersion,
      },
      { maxAttempts: 1 }
    );

    await writeAuditLog({
      companyId: authResult.companyId,
      userId: authResult.userId,
      action: "key_rotation",
      metadata: {
        oldKeyVersion: company.keyVersion,
        newKeyVersion,
        recoveryCodesInvalidated,
        jobId,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        newKeyVersion,
        recoveryCodesInvalidated,
        jobId,
        message: "Key rotation started. Re-encryption in progress.",
      },
    });
  } catch (error) {
    console.error("Key rotation error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to rotate encryption key" },
      { status: 500 }
    );
  }
}
