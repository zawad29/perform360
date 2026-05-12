import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrHR, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getDataKeyFromRequest } from "@/lib/encryption-session";
import { buildTrendsReport } from "@/lib/trends";
import { applyRateLimit } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit";
import type { TrendsReport } from "@/types/trends";

type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

export async function GET(request: NextRequest) {
  const rl = applyRateLimit(request);
  if (rl) return rl;

  const authResult = await requireAdminOrHR();
  if (isAuthError(authResult)) return authResult;
  const { companyId, userId } = authResult;

  // Check encryption is still set up
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { encryptionSetupAt: true, keyVersion: true },
  });
  if (!company?.encryptionSetupAt) {
    return NextResponse.json<ApiResponse<never>>(
      {
        success: false,
        error: "Encryption key was changed. Data from the previous encryption key cannot be viewed.",
        code: "ENCRYPTION_RESET",
      },
      { status: 403 }
    );
  }

  const dataKey = getDataKeyFromRequest(request, company.keyVersion);
  if (!dataKey) {
    return NextResponse.json<ApiResponse<never>>(
      {
        success: false,
        error: "Encryption locked. Enter your passphrase to view trends.",
        code: "ENCRYPTION_LOCKED",
      },
      { status: 403 }
    );
  }

  try {
    const report = await buildTrendsReport(companyId, dataKey);

    await writeAuditLog({
      companyId,
      userId,
      action: "decryption",
      target: "trends",
      metadata: { type: "trends_report", cycleCount: report.cycles.length },
    });

    return NextResponse.json<ApiResponse<TrendsReport>>({
      success: true,
      data: report,
    });
  } catch (error) {
    console.error("Trends report error:", error);
    const message = error instanceof Error ? error.message : "Failed to generate trends report";
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
