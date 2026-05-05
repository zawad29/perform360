import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { validateCuidParam } from "@/lib/validation";
import { errorResponse } from "@/lib/api-responses";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = applyRateLimit(request);
  if (rl) return rl;

  const { id } = await params;
  const invalid = validateCuidParam(id);
  if (invalid) return invalid;

  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const template = await prisma.evaluationTemplate.findFirst({
    where: {
      id,
      OR: [{ companyId: authResult.companyId }, { isGlobal: true }],
    },
    select: { id: true, version: true },
  });
  if (!template) {
    return errorResponse("Template not found", "NOT_FOUND", 404);
  }

  const versions = await prisma.evaluationTemplateVersion.findMany({
    where: { templateId: id },
    orderBy: { version: "desc" },
  });

  return NextResponse.json({
    success: true,
    data: { currentVersion: template.version, versions },
  });
}
