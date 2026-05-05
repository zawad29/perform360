import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminOrHR, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";

const updateLevelSchema = z.object({
  name: z.string().min(1, "Level name is required").max(50),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = applyRateLimit(request);
  if (rl) return rl;

  const authResult = await requireAdminOrHR();
  if (isAuthError(authResult)) return authResult;

  const { id } = await params;

  const level = await prisma.level.findFirst({
    where: { id, companyId: authResult.companyId },
  });

  if (!level) {
    return NextResponse.json(
      { success: false, error: "Level not found" },
      { status: 404 }
    );
  }

  try {
    const body = await request.json();
    const validated = updateLevelSchema.parse(body);

    const duplicate = await prisma.level.findFirst({
      where: {
        companyId: authResult.companyId,
        name: validated.name,
        id: { not: id },
      },
    });

    if (duplicate) {
      return NextResponse.json(
        { success: false, error: "A level with this name already exists" },
        { status: 409 }
      );
    }

    const updated = await prisma.level.update({
      where: { id },
      data: { name: validated.name },
      include: {
        _count: { select: { teamMembers: true } },
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Validation failed" },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = applyRateLimit(request);
  if (rl) return rl;

  const authResult = await requireAdminOrHR();
  if (isAuthError(authResult)) return authResult;

  const { id } = await params;

  const level = await prisma.level.findFirst({
    where: { id, companyId: authResult.companyId },
    include: { _count: { select: { teamMembers: true } } },
  });

  if (!level) {
    return NextResponse.json(
      { success: false, error: "Level not found" },
      { status: 404 }
    );
  }

  if (level._count.teamMembers > 0) {
    return NextResponse.json(
      {
        success: false,
        error: `Cannot delete — ${level._count.teamMembers} team member(s) are assigned this level. Unassign them first.`,
      },
      { status: 409 }
    );
  }

  // Block deletion if any template uses this level
  const templateUsage = await prisma.evaluationTemplate.count({
    where: { companyId: authResult.companyId, levelIds: { has: id } },
  });
  if (templateUsage > 0) {
    return NextResponse.json(
      {
        success: false,
        error: `Cannot delete — ${templateUsage} template(s) restrict to this level. Remove the level from those templates first.`,
      },
      { status: 409 }
    );
  }

  await prisma.level.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
