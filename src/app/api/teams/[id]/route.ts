import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, requireAdminOrHR, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { validateCuidParam } from "@/lib/validation";
import { errorResponse, zodErrorResponse, internalErrorResponse } from "@/lib/api-responses";

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
    return errorResponse("Team not found", "NOT_FOUND", 404);
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
      return errorResponse("Team not found", "NOT_FOUND", 404);
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
      return zodErrorResponse(error);
    }
    return internalErrorResponse(error);
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
    return errorResponse("Team not found", "NOT_FOUND", 404);
  }

  const linkedCycleCount = await prisma.cycleTeam.count({
    where: { teamId: id },
  });

  if (linkedCycleCount > 0) {
    return errorResponse(
      `Team is linked to ${linkedCycleCount} evaluation cycle(s)`,
      "TEAM_IN_USE",
      409
    );
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
