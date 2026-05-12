import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { deriveKey, decryptDataKey } from "@/lib/encryption";
import {
  encryptDataKeyForCookie,
  getDataKeyFromRequest,
  COOKIE_NAME,
  COOKIE_MAX_AGE,
} from "@/lib/encryption-session";
import { applyRateLimit } from "@/lib/rate-limit";

type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

const unlockSchema = z.object({
  passphrase: z.string().min(1, "Passphrase is required"),
});

/**
 * POST: Unlock encryption by entering the company passphrase.
 * Derives the data key and caches it in an encrypted httpOnly cookie.
 */
export async function POST(request: NextRequest) {
  const rl = applyRateLimit(request);
  if (rl) return rl;

  const authResult = await requireRole("ADMIN", "HR");
  if (isAuthError(authResult)) return authResult;

  try {
    const body = await request.json();
    const parsed = unlockSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json<ApiResponse<never>>(
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
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "Encryption is not set up" },
        { status: 400 }
      );
    }

    const saltBuffer = Buffer.from(company.encryptionSalt, "base64");
    const masterKey = deriveKey(passphrase, saltBuffer);

    let dataKey: Buffer;
    try {
      dataKey = decryptDataKey(company.encryptionKeyEncrypted, masterKey);
    } catch {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "Incorrect passphrase" },
        { status: 400 }
      );
    }

    const cookieValue = encryptDataKeyForCookie(dataKey, company.keyVersion);

    const response = NextResponse.json<ApiResponse<{ unlocked: true }>>({
      success: true,
      data: { unlocked: true },
    });

    response.cookies.set(COOKIE_NAME, cookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Encryption unlock error:", error);
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Failed to unlock encryption" },
      { status: 500 }
    );
  }
}

/**
 * GET: Check whether the encryption data key cookie is present and valid.
 */
export async function GET(request: NextRequest) {
  const rl = applyRateLimit(request);
  if (rl) return rl;

  const authResult = await requireRole("ADMIN", "HR");
  if (isAuthError(authResult)) return authResult;

  const company = await prisma.company.findUnique({
    where: { id: authResult.companyId },
    select: { encryptionSetupAt: true, keyVersion: true },
  });

  const dataKey =
    company?.encryptionSetupAt
      ? getDataKeyFromRequest(request, company.keyVersion)
      : null;

  return NextResponse.json<ApiResponse<{ unlocked: boolean }>>({
    success: true,
    data: { unlocked: dataKey !== null },
  });
}
