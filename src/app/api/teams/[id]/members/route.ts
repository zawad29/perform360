import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminOrHR, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { validateCuidParam } from "@/lib/validation";

import { Direction } from "@prisma/client";

const addMemberSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  role: z.enum(["MANAGER", "MEMBER", "EXTERNAL", "IMPERSONATOR"]),
  designationId: z.string().optional().nullable(),
  impersonatorDirections: z
    .array(z.nativeEnum(Direction))
    .optional()
    .default([]),
}).refine(
  (data) => data.role !== "IMPERSONATOR" || (data.impersonatorDirections && data.impersonatorDirections.length > 0),
  { message: "Impersonator must handle at least one direction", path: ["impersonatorDirections"] }
);

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
    const validated = addMemberSchema.parse(body);

    // Parallel validation: team, user, existing membership, and optional designation
    const [team, user, existingMembership, designation] = await Promise.all([
      prisma.team.findFirst({
        where: { id, companyId: authResult.companyId },
        select: { id: true },
      }),
      prisma.user.findFirst({
        where: { id: validated.userId, companyId: authResult.companyId },
        select: { id: true },
      }),
      prisma.teamMember.findUnique({
        where: { userId_teamId: { userId: validated.userId, teamId: id } },
        select: { id: true },
      }),
      validated.designationId
        ? prisma.designation.findFirst({
            where: { id: validated.designationId, companyId: authResult.companyId },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);

    if (!team) {
      return NextResponse.json({
        success: false,
        error: "Team not found",
        code: "NOT_FOUND",
      }, { status: 404 });
    }

    if (!user) {
      return NextResponse.json({
        success: false,
        error: "User not found in company",
        code: "NOT_FOUND",
      }, { status: 404 });
    }

    if (existingMembership) {
      return NextResponse.json({
        success: false,
        error: "User is already a member of this team",
        code: "DUPLICATE",
      }, { status: 409 });
    }

    if (validated.designationId && !designation) {
      return NextResponse.json({
        success: false,
        error: "Designation not found",
        code: "NOT_FOUND",
      }, { status: 404 });
    }

    const member = await prisma.teamMember.create({
      data: {
        userId: validated.userId,
        teamId: id,
        role: validated.role,
        designationId: validated.designationId ?? null,
        impersonatorDirections: validated.role === "IMPERSONATOR" ? validated.impersonatorDirections : [],
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatar: true, role: true },
        },
        designation: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: member,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: "Validation failed",
        code: "VALIDATION_ERROR",
      }, { status: 400 });
    }
    console.error("[POST /api/teams/[id]/members]", error);
    return NextResponse.json({
      success: false,
      error: "Internal server error",
    }, { status: 500 });
  }
}
