import { NextResponse } from "next/server";
import { requireRole, isAuthError } from "@/lib/api-auth";
import { internalErrorResponse } from "@/lib/api-responses";
import { emptyTemplateWorkbook } from "@/lib/company-import-xlsx";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * GET /api/import/company/example
 * Admin-only. Returns a blank multi-sheet workbook (all sheets + headers + one hint row) as a
 * fill-in-the-blanks starting point for POST /api/import/company.
 */
export async function GET() {
  const authResult = await requireRole("ADMIN");
  if (isAuthError(authResult)) return authResult;

  try {
    const buf = await emptyTemplateWorkbook();
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": XLSX_TYPE,
        "Content-Disposition": 'attachment; filename="company-import-template.xlsx"',
      },
    });
  } catch (error) {
    console.error("[Import:company:example] Error:", error);
    return internalErrorResponse(error);
  }
}
