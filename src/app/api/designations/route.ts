import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminOrHR, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";

const createDesignationSchema = z.object({
  name: z.string().min(1, "Designation name is required").max(50),
});

export async function GET(request: NextRequest) {
  const rl = applyRateLimit(request);
  if (rl) return rl;

  const authResult = await requireAdminOrHR();
  if (isAuthError(authResult)) return authResult;

  const designations = await prisma.designation.findMany({
    where: { companyId: authResult.companyId },
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { teamMembers: true } },
    },
  });

  return NextResponse.json({ success: true, data: designations });
}

export async function POST(request: NextRequest) {
  const rl = applyRateLimit(request);
  if (rl) return rl;

  const authResult = await requireAdminOrHR();
  if (isAuthError(authResult)) return authResult;

  try {
    const body = await request.json();
    const validated = createDesignationSchema.parse(body);

    const existing = await prisma.designation.findUnique({
      where: {
        companyId_name: {
          companyId: authResult.companyId,
          name: validated.name,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: "A designation with this name already exists" },
        { status: 409 }
      );
    }

    const designation = await prisma.designation.create({
      data: {
        name: validated.name,
        companyId: authResult.companyId,
      },
      include: {
        _count: { select: { teamMembers: true } },
      },
    });

    return NextResponse.json({ success: true, data: designation }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
