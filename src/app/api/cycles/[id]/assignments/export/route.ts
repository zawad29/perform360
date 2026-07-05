import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { internalErrorResponse } from "@/lib/api-responses";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { validateCuidParam } from "@/lib/validation";
import {
  renderAssignmentsToExcel,
  type ExportTeam,
} from "@/lib/excel/render-assignments";

const XLSX_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 50);
}

/**
 * POST /api/cycles/:id/assignments/export
 * Renders the (already filtered + grouped) assignments payload the client sends
 * into a downloadable .xlsx. The body echoes what's on screen, so this route
 * only formats — it does not re-query the assignments.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = applyRateLimit(request);
  if (rl) return rl;
  const { id: cycleId } = await params;
  const invalid = validateCuidParam(cycleId);
  if (invalid) return invalid;

  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const cycle = await prisma.evaluationCycle.findFirst({
    where: { id: cycleId, companyId: authResult.companyId },
    select: { id: true, name: true },
  });
  if (!cycle) {
    return NextResponse.json(
      { success: false, error: "Cycle not found", code: "NOT_FOUND" },
      { status: 404 }
    );
  }

  try {
    const body = (await request.json()) as { teams?: unknown };
    if (!Array.isArray(body.teams)) {
      return NextResponse.json(
        { success: false, error: "Invalid payload", code: "BAD_REQUEST" },
        { status: 400 }
      );
    }

    const teams = body.teams as ExportTeam[];
    const buf = await renderAssignmentsToExcel(teams, cycle.name);

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": XLSX_TYPE,
        "Content-Disposition": `attachment; filename="${sanitizeFilename(cycle.name)}-assignments.xlsx"`,
      },
    });
  } catch (error) {
    console.error("[Cycles:assignments:export] Error:", error);
    return internalErrorResponse(error);
  }
}
