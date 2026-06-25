import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, requireAdminOrHR, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { validateCuidParam } from "@/lib/validation";

const updateTeamSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  archived: z.boolean().optional(),
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

  const team = await prisma.team.findFirst({
    where: {
      id: id,
      companyId: authResult.companyId,
    },
    include: {
      members: {
        include: {
          user: {
            select: { id: true, name: true, email: true, avatar: true, role: true },
          },
          designation: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!team) {
    return NextResponse.json({
      success: false,
      error: "Team not found",
      code: "NOT_FOUND",
    }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    data: team,
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
    const validated = updateTeamSchema.parse(body);

    const existing = await prisma.team.findFirst({
      where: {
        id: id,
        companyId: authResult.companyId,
      },
    });

    if (!existing) {
      return NextResponse.json({
        success: false,
        error: "Team not found",
        code: "NOT_FOUND",
      }, { status: 404 });
    }

    const { archived, ...fields } = validated;
    const data: Record<string, unknown> = { ...fields };
    if (archived === true) data.archivedAt = new Date();
    if (archived === false) data.archivedAt = null;

    const team = await prisma.team.update({
      where: { id: id },
      data,
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true, avatar: true, role: true },
            },
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: team,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: "Validation failed",
        code: "VALIDATION_ERROR",
      }, { status: 400 });
    }
    return NextResponse.json({
      success: false,
      error: "Internal server error",
    }, { status: 500 });
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

  const linkedCycleCount = await prisma.cycleTeam.count({
    where: { teamId: id },
  });

  if (linkedCycleCount > 0) {
    return NextResponse.json({
      success: false,
      error: `Team is linked to ${linkedCycleCount} evaluation cycle(s)`,
      code: "TEAM_IN_USE",
    }, { status: 409 });
  }

  await prisma.$transaction([
    prisma.teamMember.deleteMany({
      where: { teamId: id },
    }),
    prisma.team.delete({
      where: { id: id },
    }),
  ]);

  return NextResponse.json({
    success: true,
    data: { deleted: true },
  });
}
