import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminOrHR, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { validateCuidParam } from "@/lib/validation";

import { Direction } from "@prisma/client";

const updateMemberSchema = z.object({
  levelId: z.string().nullable().optional(),
  role: z.enum(["MANAGER", "MEMBER", "EXTERNAL", "IMPERSONATOR"]).optional(),
  impersonatorDirections: z
    .array(z.nativeEnum(Direction))
    .optional(),
}).refine(
  (data) => data.role !== "IMPERSONATOR" || (data.impersonatorDirections && data.impersonatorDirections.length > 0),
  { message: "Impersonator must handle at least one direction", path: ["impersonatorDirections"] }
);

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; uid: string }> }
) {
  const rl = applyRateLimit(request);
  if (rl) return rl;
  const { id, uid } = await params;
  const invalidId = validateCuidParam(id, "teamId");
  if (invalidId) return invalidId;
  const invalidUid = validateCuidParam(uid, "userId");
  if (invalidUid) return invalidUid;

  const authResult = await requireAdminOrHR();
  if (isAuthError(authResult)) return authResult;

  // Verify team belongs to company
  const team = await prisma.team.findFirst({
    where: {
      id: id,
      companyId: authResult.companyId,
    },
  });

  if (!team) {
    return NextResponse.json({
      success: false,
      error: "Team not found",
      code: "NOT_FOUND",
    }, { status: 404 });
  }

  const membership = await prisma.teamMember.findUnique({
    where: {
      userId_teamId: {
        userId: uid,
        teamId: id,
      },
    },
  });

  if (!membership) {
    return NextResponse.json({
      success: false,
      error: "Team member not found",
      code: "NOT_FOUND",
    }, { status: 404 });
  }

  await prisma.teamMember.delete({
    where: { id: membership.id },
  });

  return NextResponse.json({
    success: true,
    data: { deleted: true },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; uid: string }> }
) {
  const rl = applyRateLimit(request);
  if (rl) return rl;
  const { id, uid } = await params;
  const invalidId = validateCuidParam(id, "teamId");
  if (invalidId) return invalidId;
  const invalidUid = validateCuidParam(uid, "userId");
  if (invalidUid) return invalidUid;

  const authResult = await requireAdminOrHR();
  if (isAuthError(authResult)) return authResult;

  const team = await prisma.team.findFirst({
    where: { id, companyId: authResult.companyId },
  });

  if (!team) {
    return NextResponse.json(
      { success: false, error: "Team not found", code: "NOT_FOUND" },
      { status: 404 }
    );
  }

  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: uid, teamId: id } },
  });

  if (!membership) {
    return NextResponse.json(
      { success: false, error: "Team member not found", code: "NOT_FOUND" },
      { status: 404 }
    );
  }

  try {
    const body = await request.json();
    const validated = updateMemberSchema.parse(body);

    const updateData: {
      levelId?: string | null;
      role?: "MANAGER" | "MEMBER" | "EXTERNAL" | "IMPERSONATOR";
      impersonatorDirections?: Direction[];
    } = {};

    if (validated.levelId !== undefined) {
      if (validated.levelId) {
        const level = await prisma.level.findFirst({
          where: { id: validated.levelId, companyId: authResult.companyId },
        });
        if (!level) {
          return NextResponse.json(
            { success: false, error: "Level not found", code: "NOT_FOUND" },
            { status: 404 }
          );
        }
      }
      updateData.levelId = validated.levelId;
    }

    if (validated.role) {
      updateData.role = validated.role;
      if (validated.role !== "IMPERSONATOR") {
        updateData.impersonatorDirections = [];
      }
    }

    if (validated.impersonatorDirections !== undefined) {
      updateData.impersonatorDirections = validated.impersonatorDirections;
    }

    const updated = await prisma.teamMember.update({
      where: { id: membership.id },
      data: updateData,
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true, role: true } },
        level: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Validation failed", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
