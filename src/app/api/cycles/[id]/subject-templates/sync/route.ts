import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrHR, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { validateCuidParam } from "@/lib/validation";
import { errorResponse, internalErrorResponse } from "@/lib/api-responses";
import {
  regenerateCycleAssignments,
  syncSubjectTemplateMap,
  validateTeamTemplateCoverage,
} from "@/lib/assignments";

/**
 * Re-sync a DRAFT cycle's subject→template mapping to current team membership
 * (adds rows for new members, drops departed ones, keeps MANUAL choices), then
 * regenerate the cycle's assignments. Used by the "membership out of date"
 * banner on the cycle detail page.
 */
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

  try {
    const cycle = await prisma.evaluationCycle.findFirst({
      where: { id, companyId: authResult.companyId },
      select: {
        status: true,
        cycleTeams: {
          select: {
            teamId: true,
            templates: { select: { templateId: true } },
          },
        },
      },
    });
    if (!cycle) return errorResponse("Cycle not found", "NOT_FOUND", 404);
    if (cycle.status !== "DRAFT") {
      return errorResponse(
        "Templates can only be changed while the cycle is a draft",
        "INVALID_STATUS",
        400
      );
    }

    const teamTemplates = cycle.cycleTeams
      .map((ct) => ({
        teamId: ct.teamId,
        templateIds: ct.templates.map((t) => t.templateId),
      }))
      .filter((tt) => tt.templateIds.length > 0);

    // Rebuild the per-team template metadata (pairs) for routing.
    const validation = await validateTeamTemplateCoverage(authResult.companyId, teamTemplates);
    if (!validation.ok) return errorResponse(validation.error, validation.code, 404);

    const teamTemplatesMap = new Map(
      validation.data.pairs.map((p) => [p.teamId, p.templates])
    );

    await syncSubjectTemplateMap(id, authResult.companyId, teamTemplatesMap);
    await regenerateCycleAssignments(id, authResult.companyId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return internalErrorResponse(error);
  }
}
