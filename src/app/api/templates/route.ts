import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, requireAdminOrHR, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { parsePaginationParams, buildPaginationMeta } from "@/lib/utils";
import { sectionSchema, directionWeightsSchema } from "@/lib/template-schema";
import { errorResponse, zodErrorResponse, internalErrorResponse } from "@/lib/api-responses";
import { Prisma, WeightPreset, TemplateRole } from "@prisma/client";

const createTemplateSchema = z.object({
  name: z.string().min(1, "Template name is required"),
  description: z.string().optional(),
  designationIds: z.array(z.string()).default([]),
  appliesToRole: z.nativeEnum(TemplateRole).default(TemplateRole.ANY),
  weightPreset: z.nativeEnum(WeightPreset).nullable().optional(),
  weightsMember: directionWeightsSchema.nullable().optional(),
  weightsManager: directionWeightsSchema.nullable().optional(),
  sections: z.array(sectionSchema).min(1, "At least one section is required"),
});

export async function GET(request: NextRequest) {
  const rl = applyRateLimit(request);
  if (rl) return rl;

  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const { searchParams } = new URL(request.url);
  const { page, limit, search } = parsePaginationParams(searchParams, 12);
  const scope = searchParams.get("scope"); // "global" | "company" | null (all)

  const scopeFilter: Prisma.EvaluationTemplateWhereInput =
    scope === "global"
      ? { isGlobal: true }
      : scope === "company"
        ? { companyId: authResult.companyId, isGlobal: false }
        : { OR: [{ companyId: authResult.companyId }, { isGlobal: true }] };

  const archiveFilter: Prisma.EvaluationTemplateWhereInput = { isArchived: false };

  const where: Prisma.EvaluationTemplateWhereInput = {
    AND: [
      scopeFilter,
      archiveFilter,
      ...(search
        ? [
            {
              OR: [
                { name: { contains: search, mode: "insensitive" as const } },
                { description: { contains: search, mode: "insensitive" as const } },
              ],
            },
          ]
        : []),
    ],
  };

  const [templates, total] = await Promise.all([
    prisma.evaluationTemplate.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.evaluationTemplate.count({ where }),
  ]);

  return NextResponse.json({
    success: true,
    data: templates,
    pagination: buildPaginationMeta(page, limit, total),
  });
}

export async function POST(request: NextRequest) {
  const rl = applyRateLimit(request);
  if (rl) return rl;

  const authResult = await requireAdminOrHR();
  if (isAuthError(authResult)) return authResult;

  try {
    const body = await request.json();
    const validated = createTemplateSchema.parse(body);

    // Verify designationIds belong to company (when provided)
    if (validated.designationIds.length > 0) {
      const designations = await prisma.designation.findMany({
        where: { id: { in: validated.designationIds }, companyId: authResult.companyId },
        select: { id: true },
      });
      if (designations.length !== validated.designationIds.length) {
        return errorResponse("One or more designations not found", "NOT_FOUND", 404);
      }
    }

    const sectionsJson = JSON.parse(JSON.stringify(validated.sections));
    const weightsMember = validated.weightsMember ?? Prisma.JsonNull;
    const weightsManager = validated.weightsManager ?? Prisma.JsonNull;

    const template = await prisma.$transaction(async (tx) => {
      const created = await tx.evaluationTemplate.create({
        data: {
          name: validated.name,
          description: validated.description,
          designationIds: validated.designationIds,
          appliesToRole: validated.appliesToRole,
          weightPreset: validated.weightPreset ?? null,
          weightsMember,
          weightsManager,
          sections: sectionsJson,
          companyId: authResult.companyId,
          createdBy: authResult.userId,
          isGlobal: false,
        },
      });
      // Snapshot v1 alongside creation — every template has a complete
      // history starting from its first save.
      await tx.evaluationTemplateVersion.create({
        data: {
          templateId: created.id,
          version: 1,
          name: created.name,
          description: created.description,
          designationIds: created.designationIds,
          appliesToRole: created.appliesToRole,
          weightPreset: created.weightPreset,
          weightsMember,
          weightsManager,
          sections: sectionsJson,
          createdBy: authResult.userId,
        },
      });
      return created;
    });

    return NextResponse.json({
      success: true,
      data: template,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return zodErrorResponse(error);
    return internalErrorResponse();
  }
}
