import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  deriveKey,
  encryptDataKey,
  generateDataKey,
  generateRecoveryCodes,
  generateSalt,
  hashRecoveryCode,
} from "@/lib/encryption";
import {
  COOKIE_NAME,
  encryptDataKeyForCookie,
} from "@/lib/encryption-session";
import { ENCRYPTION_CONFIG } from "@/lib/constants";
import { applyRateLimit } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit";

const hardResetSchema = z
  .object({
    newPassphrase: z
      .string()
      .min(
        ENCRYPTION_CONFIG.minPassphraseLength,
        `Passphrase must be at least ${ENCRYPTION_CONFIG.minPassphraseLength} characters`
      )
      .max(ENCRYPTION_CONFIG.maxPassphraseLength),
    confirmNewPassphrase: z.string(),
    confirmationText: z.string(),
  })
  .refine((data) => data.newPassphrase === data.confirmNewPassphrase, {
    message: "Passphrases do not match",
    path: ["confirmNewPassphrase"],
  })
  .refine((data) => data.confirmationText.trim() === "RESET ENCRYPTION", {
    message: "Type RESET ENCRYPTION to confirm",
    path: ["confirmationText"],
  });

export async function POST(request: NextRequest) {
  const rl = applyRateLimit(request);
  if (rl) return rl;

  const authResult = await requireRole("ADMIN");
  if (isAuthError(authResult)) return authResult;

  try {
    const body = await request.json();
    const parsed = hardResetSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { newPassphrase } = parsed.data;

    const company = await prisma.company.findUnique({
      where: { id: authResult.companyId },
      select: { encryptionSetupAt: true, keyVersion: true },
    });

    if (!company) {
      return NextResponse.json(
        { success: false, error: "Company not found" },
        { status: 404 }
      );
    }

    if (!company.encryptionSetupAt) {
      return NextResponse.json(
        { success: false, error: "Encryption is not set up" },
        { status: 400 }
      );
    }

    const salt = generateSalt();
    const saltBuffer = Buffer.from(salt, "base64");
    const masterKey = deriveKey(newPassphrase, saltBuffer);
    const dataKey = generateDataKey();
    const encryptedDataKey = encryptDataKey(dataKey, masterKey);
    const newKeyVersion = company.keyVersion + 1;
    const recoveryCodes = generateRecoveryCodes(ENCRYPTION_CONFIG.recoveryCodeCount);
    const cachedDataKeyEncrypted = encryptDataKeyForCookie(dataKey);

    const recoveryCodeRecords = await Promise.all(
      recoveryCodes.map(async (code) => {
        const codeHash = await hashRecoveryCode(code);
        const codeDerivedKey = deriveKey(
          code.toUpperCase().replace(/-/g, ""),
          saltBuffer
        );
        return {
          codeHash,
          encryptedDataKey: encryptDataKey(dataKey, codeDerivedKey),
        };
      })
    );

    await prisma.$transaction(async (tx) => {
      await tx.company.update({
        where: { id: authResult.companyId },
        data: {
          encryptionKeyEncrypted: encryptedDataKey,
          encryptionSalt: salt,
          encryptionSetupAt: new Date(),
          keyVersion: newKeyVersion,
        },
      });

      await tx.recoveryCode.deleteMany({
        where: { companyId: authResult.companyId },
      });

      await tx.recoveryCode.createMany({
        data: recoveryCodeRecords.map((record) => ({
          companyId: authResult.companyId,
          codeHash: record.codeHash,
          encryptedDataKey: record.encryptedDataKey,
        })),
      });

      await tx.evaluationCycle.updateMany({
        where: {
          companyId: authResult.companyId,
          cachedDataKeyEncrypted: { not: null },
        },
        data: { cachedDataKeyEncrypted },
      });
    });

    await writeAuditLog({
      companyId: authResult.companyId,
      userId: authResult.userId,
      action: "encryption_hard_reset",
      metadata: {
        newKeyVersion,
        previousKeyVersion: company.keyVersion,
      },
    });

    const response = NextResponse.json({
      success: true,
      data: {
        keyVersion: newKeyVersion,
        recoveryCodes,
      },
    });

    response.cookies.set(COOKIE_NAME, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Hard reset encryption error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to hard reset encryption" },
      { status: 500 }
    );
  }
}
