import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit";
import { zodErrorResponse, internalErrorResponse } from "@/lib/api-responses";
import { applyCompanyImport } from "@/lib/company-import-schema";
import { workbookToCompanyImport } from "@/lib/company-import-xlsx";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * POST /api/import/company  (multipart/form-data, field "file" = .xlsx)
 * Admin-only. Imports a multi-sheet company workbook (designations, users, teams + hierarchy,
 * templates, optional cycles) into the caller's company. Upsert by natural key — idempotent.
 * No encryption passphrase required.
 */
export async function POST(request: NextRequest) {
  const rl = applyRateLimit(request);
  if (rl) return rl;

  const authResult = await requireRole("ADMIN");
  if (isAuthError(authResult)) return authResult;

  let file: File;
  try {
    const formData = await request.formData();
    const f = formData.get("file");
    if (!f || !(f instanceof File)) {
      return NextResponse.json(
        { success: false, error: "No file provided (expected form field 'file')", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }
    const isXlsx = f.type === XLSX_TYPE || f.name.toLowerCase().endsWith(".xlsx");
    if (!isXlsx) {
      return NextResponse.json(
        { success: false, error: "File must be an .xlsx workbook", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }
    if (f.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { success: false, error: "File must be under 10 MB", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }
    file = f;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid upload", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }

  let data;
  try {
    data = await workbookToCompanyImport(Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    if (error instanceof z.ZodError) return zodErrorResponse(error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Could not parse workbook", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }

  try {
    const result = await prisma.$transaction(
      (tx) => applyCompanyImport(tx, authResult.companyId, data, authResult.userId),
      { timeout: 120_000 },
    );

    writeAuditLog({
      companyId: authResult.companyId,
      userId: authResult.userId,
      action: "bulk_import",
      target: `company:${authResult.companyId}`,
      metadata: {
        kind: "company_xlsx",
        designationsCreated: result.designationsCreated,
        usersCreated: result.usersCreated,
        teamsCreated: result.teamsCreated,
        templatesCreated: result.templatesCreated,
        cyclesCreated: result.cyclesCreated,
        assignmentsCreated: result.assignmentsCreated,
      },
    }).catch(() => {});

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    console.error("[Import:company] Error:", error);
    return internalErrorResponse(error);
  }
}
