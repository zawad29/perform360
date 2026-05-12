import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrHR, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getDataKeyFromRequest, encryptDataKeyForCookie } from "@/lib/encryption-session";
import { applyRateLimit } from "@/lib/rate-limit";
import { validateCuidParam } from "@/lib/validation";
import { writeAuditLog } from "@/lib/audit";
import { enqueue } from "@/lib/queue";
import { JOB_TYPES } from "@/types/job";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = applyRateLimit(request);
  if (rl) return rl;
  const { id } = await params;
  const invalid = validateCuidParam(id);
  if (invalid) return invalid;

  const authResult = await requireAdminOrHR();
  if (isAuthError(authResult)) return authResult;

  const company = await prisma.company.findUnique({
    where: { id: authResult.companyId },
    select: { encryptionSetupAt: true, keyVersion: true },
  });

  if (!company?.encryptionSetupAt) {
    return NextResponse.json(
      {
        success: false,
        error: "Encryption is not set up. Complete encryption setup before activating a cycle.",
        code: "ENCRYPTION_NOT_SETUP",
      },
      { status: 400 }
    );
  }

  // 1. Fetch cycle and validate
  const cycle = await prisma.evaluationCycle.findFirst({
    where: {
      id,
      companyId: authResult.companyId,
    },
  });

  if (!cycle) {
    return NextResponse.json(
      { success: false, error: "Cycle not found", code: "NOT_FOUND" },
      { status: 404 }
    );
  }

  if (cycle.status !== "DRAFT") {
    return NextResponse.json(
      {
        success: false,
        error: "Only DRAFT cycles can be activated",
        code: "INVALID_STATUS",
      },
      { status: 400 }
    );
  }

  // Require the admin's decrypted data key (from encryption unlock session).
  // This is cached on the cycle so the submission route can encrypt reviewer answers.
  const dataKey = getDataKeyFromRequest(request, company.keyVersion);
  if (!dataKey) {
    return NextResponse.json(
      {
        success: false,
        error: "Encryption locked. Enter your passphrase before activating a cycle.",
        code: "ENCRYPTION_LOCKED",
      },
      { status: 403 }
    );
  }
  const cachedDataKeyEncrypted = encryptDataKeyForCookie(dataKey);

  // 2. Verify assignments already exist (created during DRAFT)
  const assignmentCount = await prisma.evaluationAssignment.count({
    where: { cycleId: cycle.id },
  });

  if (assignmentCount === 0) {
    return NextResponse.json(
      {
        success: false,
        error:
          "No assignments found. Ensure teams have members with Manager and Direct Report roles.",
        code: "NO_ASSIGNMENTS",
      },
      { status: 400 }
    );
  }

  // 3. Update cycle status to ACTIVE and cache the data key for submissions
  const updatedCycle = await prisma.evaluationCycle.update({
    where: { id: cycle.id },
    data: { status: "ACTIVE", cachedDataKeyEncrypted },
  });

  // 4. Enqueue email sending job (processed by worker)
  const jobId = await enqueue(
    JOB_TYPES.CYCLE_ACTIVATE,
    {
      cycleId: cycle.id,
      companyId: authResult.companyId,
      userId: authResult.userId,
      cachedDataKeyEncrypted,
    },
    { priority: 5 }
  );

  await writeAuditLog({
    companyId: authResult.companyId,
    userId: authResult.userId,
    action: "cycle_activate",
    target: `cycle:${updatedCycle.id}`,
    metadata: { totalAssignments: assignmentCount, jobId },
  });

  return NextResponse.json({
    success: true,
    data: {
      id: updatedCycle.id,
      status: updatedCycle.status,
      totalAssignments: assignmentCount,
      jobId,
    },
  });
}
