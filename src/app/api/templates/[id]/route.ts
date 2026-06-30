import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, requireAdminOrHR, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { validateCuidParam } from "@/lib/validation";
import { sectionSchema, directionWeightsSchema } from "@/lib/template-schema";
import { errorResponse, zodErrorResponse, internalErrorResponse } from "@/lib/api-responses";
import { normalizeTemplateSections } from "@/lib/template-sections";
import { Prisma, WeightPreset, TemplateRole } from "@prisma/client";

const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  designationIds: z.array(z.string()).optional(),
  appliesToRole: z.nativeEnum(TemplateRole).optional(),
  weightPreset: z.nativeEnum(WeightPreset).nullable().optional(),
  weightsMember: directionWeightsSchema.nullable().optional(),
  weightsManager: directionWeightsSchema.nullable().optional(),
  sections: z.array(sectionSchema).min(1).optional(),
});

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
      id: id,
      OR: [{ companyId: authResult.companyId }, { isGlobal: true }],
    },
  });

  if (!template) {
    return errorResponse("Template not found", "NOT_FOUND", 404);
  }

  return NextResponse.json({
    success: true,
    data: template,
  });
}

export async function PATCH(
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
    const validated = updateTemplateSchema.parse(body);

    const existing = await prisma.evaluationTemplate.findFirst({
      where: {
        id: id,
        companyId: authResult.companyId,
        isGlobal: false,
      },
    });

    if (!existing) {
      return errorResponse("Template not found or cannot be edited", "NOT_FOUND", 404);
    }

    if (validated.designationIds && validated.designationIds.length > 0) {
      const designations = await prisma.designation.findMany({
        where: { id: { in: validated.designationIds }, companyId: authResult.companyId },
        select: { id: true },
      });
      if (designations.length !== validated.designationIds.length) {
        return errorResponse("One or more designations not found", "NOT_FOUND", 404);
      }
    }

    const updateData: Prisma.EvaluationTemplateUpdateInput = {};
    if (validated.name) updateData.name = validated.name;
    if (validated.description !== undefined) updateData.description = validated.description;
    if (validated.designationIds) updateData.designationIds = validated.designationIds;
    if (validated.appliesToRole !== undefined) updateData.appliesToRole = validated.appliesToRole;
    if (validated.weightPreset !== undefined) updateData.weightPreset = validated.weightPreset;
    if (validated.weightsMember !== undefined) {
      updateData.weightsMember = validated.weightsMember ?? Prisma.JsonNull;
    }
    if (validated.weightsManager !== undefined) {
      updateData.weightsManager = validated.weightsManager ?? Prisma.JsonNull;
    }
    if (validated.sections) {
      updateData.sections = JSON.parse(JSON.stringify(normalizeTemplateSections(validated.sections)));
    }

    // Snapshot the new content into a fresh version row, then update the
    // main template row in the same transaction. Bumps `version` to match.
    const nextVersion = existing.version + 1;
    const template = await prisma.$transaction(async (tx) => {
      const updated = await tx.evaluationTemplate.update({
        where: { id: id },
        data: { ...updateData, version: nextVersion },
      });
      await tx.evaluationTemplateVersion.create({
        data: {
          templateId: updated.id,
          version: nextVersion,
          name: updated.name,
          description: updated.description,
          designationIds: updated.designationIds,
          appliesToRole: updated.appliesToRole,
          weightPreset: updated.weightPreset,
          weightsMember:
            updated.weightsMember === null
              ? Prisma.JsonNull
              : (updated.weightsMember as Prisma.InputJsonValue),
          weightsManager:
            updated.weightsManager === null
              ? Prisma.JsonNull
              : (updated.weightsManager as Prisma.InputJsonValue),
          sections: updated.sections as Prisma.InputJsonValue,
          createdBy: authResult.userId,
        },
      });
      return updated;
    });

    return NextResponse.json({
      success: true,
      data: template,
    });
  } catch (error) {
    if (error instanceof z.ZodError) return zodErrorResponse(error);
    return internalErrorResponse();
  }
}

export async function DELETE(
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

  const template = await prisma.evaluationTemplate.findFirst({
    where: {
      id: id,
      companyId: authResult.companyId,
      isGlobal: false,
    },
  });

  if (!template) {
    return errorResponse("Template not found or cannot be deleted", "NOT_FOUND", 404);
  }

  if (template.isArchived) {
    return errorResponse("Template is already archived", "ALREADY_ARCHIVED", 400);
  }

  await prisma.evaluationTemplate.update({
    where: { id: id },
    data: { isArchived: true },
  });

  return NextResponse.json({
    success: true,
    data: { id, archived: true },
  });
}
