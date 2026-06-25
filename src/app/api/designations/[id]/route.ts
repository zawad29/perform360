import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminOrHR, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";

const updateDesignationSchema = z.object({
  name: z.string().min(1, "Designation name is required").max(50),
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

  const designation = await prisma.designation.findFirst({
    where: { id, companyId: authResult.companyId },
  });

  if (!designation) {
    return NextResponse.json(
      { success: false, error: "Designation not found" },
      { status: 404 }
    );
  }

  try {
    const body = await request.json();
    const validated = updateDesignationSchema.parse(body);

    const duplicate = await prisma.designation.findFirst({
      where: {
        companyId: authResult.companyId,
        name: validated.name,
        id: { not: id },
      },
    });

    if (duplicate) {
      return NextResponse.json(
        { success: false, error: "A designation with this name already exists" },
        { status: 409 }
      );
    }

    const updated = await prisma.designation.update({
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

  const designation = await prisma.designation.findFirst({
    where: { id, companyId: authResult.companyId },
    include: { _count: { select: { teamMembers: true } } },
  });

  if (!designation) {
    return NextResponse.json(
      { success: false, error: "Designation not found" },
      { status: 404 }
    );
  }

  if (designation._count.teamMembers > 0) {
    return NextResponse.json(
      {
        success: false,
        error: `Cannot delete — ${designation._count.teamMembers} team member(s) are assigned this designation. Unassign them first.`,
      },
      { status: 409 }
    );
  }

  // Block deletion if any template uses this designation
  const templateUsage = await prisma.evaluationTemplate.count({
    where: { companyId: authResult.companyId, designationIds: { has: id } },
  });
  if (templateUsage > 0) {
    return NextResponse.json(
      {
        success: false,
        error: `Cannot delete — ${templateUsage} template(s) restrict to this designation. Remove the designation from those templates first.`,
      },
      { status: 409 }
    );
  }

  await prisma.designation.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
