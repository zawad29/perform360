import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrHR, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { buildIndividualReport } from "@/lib/reports";
import { getDataKeyFromRequest } from "@/lib/encryption-session";
import type { IndividualReport } from "@/types/report";
import { applyRateLimit } from "@/lib/rate-limit";
import { validateCuidParam } from "@/lib/validation";
import { writeAuditLog } from "@/lib/audit";

type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; uid: string }> }
) {
  const rl = applyRateLimit(request);
  if (rl) return rl;
  const { id: cycleId, uid: subjectId } = await params;
  const invalidId = validateCuidParam(cycleId, "cycleId");
  if (invalidId) return invalidId;
  const invalidUid = validateCuidParam(subjectId, "userId");
  if (invalidUid) return invalidUid;

  const authResult = await requireAdminOrHR();
  if (isAuthError(authResult)) return authResult;
  const { companyId } = authResult;

  // Verify cycle belongs to user's company
  const cycle = await prisma.evaluationCycle.findFirst({
    where: { id: cycleId, companyId },
    select: { id: true },
  });

  if (!cycle) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Cycle not found", code: "NOT_FOUND" },
      { status: 404 }
    );
  }

  // Verify subject belongs to user's company
  const subject = await prisma.user.findFirst({
    where: { id: subjectId, companyId },
    select: { id: true },
  });

  if (!subject) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "User not found", code: "NOT_FOUND" },
      { status: 404 }
    );
  }

  // Check if encryption is still set up (may have been reset by superadmin)
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { encryptionSetupAt: true, keyVersion: true },
  });
  if (!company?.encryptionSetupAt) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Encryption key was changed. Data from the previous encryption key cannot be viewed.", code: "ENCRYPTION_RESET" },
      { status: 403 }
    );
  }

  const dataKey = getDataKeyFromRequest(request, company.keyVersion);
  if (!dataKey) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Encryption locked. Enter your passphrase to view reports.", code: "ENCRYPTION_LOCKED" },
      { status: 403 }
    );
  }

  try {
    const report = await buildIndividualReport(cycleId, subjectId, companyId, dataKey);

    await writeAuditLog({
      companyId,
      userId: authResult.userId,
      action: "decryption",
      target: `user:${subjectId}`,
      metadata: { type: "individual_report", cycleId },
    });

    return NextResponse.json<ApiResponse<IndividualReport>>({
      success: true,
      data: report,
    });
  } catch (error) {
    console.error("Report generation error:", error);
    const message = error instanceof Error ? error.message : "Failed to generate report";
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
