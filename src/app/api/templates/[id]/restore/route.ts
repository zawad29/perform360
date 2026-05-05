import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireAdminOrHR, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { validateCuidParam } from "@/lib/validation";
import { errorResponse, zodErrorResponse, internalErrorResponse } from "@/lib/api-responses";

const restoreSchema = z.object({
  versionId: z.string().min(1),
});

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
    const body = await request.json();
    const { versionId } = restoreSchema.parse(body);

    const existing = await prisma.evaluationTemplate.findFirst({
      where: { id, companyId: authResult.companyId, isGlobal: false },
    });
    if (!existing) {
      return errorResponse("Template not found or cannot be edited", "NOT_FOUND", 404);
    }

    const snapshot = await prisma.evaluationTemplateVersion.findFirst({
      where: { id: versionId, templateId: id },
    });
    if (!snapshot) {
      return errorResponse("Version not found", "NOT_FOUND", 404);
    }

    // Restore = copy snapshot content onto the live row + write a NEW version
    // entry (so history reflects "v3 was restored from v1, becoming v4").
    const nextVersion = existing.version + 1;
    const weightsMember =
      snapshot.weightsMember === null
        ? Prisma.JsonNull
        : (snapshot.weightsMember as Prisma.InputJsonValue);
    const weightsManager =
      snapshot.weightsManager === null
        ? Prisma.JsonNull
        : (snapshot.weightsManager as Prisma.InputJsonValue);
    const sections = snapshot.sections as Prisma.InputJsonValue;

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.evaluationTemplate.update({
        where: { id },
        data: {
          name: snapshot.name,
          description: snapshot.description,
          levelIds: snapshot.levelIds,
          weightPreset: snapshot.weightPreset,
          weightsMember,
          weightsManager,
          sections,
          version: nextVersion,
        },
      });
      await tx.evaluationTemplateVersion.create({
        data: {
          templateId: id,
          version: nextVersion,
          name: snapshot.name,
          description: snapshot.description,
          levelIds: snapshot.levelIds,
          weightPreset: snapshot.weightPreset,
          weightsMember,
          weightsManager,
          sections,
          createdBy: authResult.userId,
        },
      });
      return result;
    });

    return NextResponse.json({
      success: true,
      data: { template: updated, restoredFromVersion: snapshot.version },
    });
  } catch (error) {
    if (error instanceof z.ZodError) return zodErrorResponse(error);
    return internalErrorResponse(error);
  }
}
