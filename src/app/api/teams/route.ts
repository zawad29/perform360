import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, requireAdminOrHR, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { parsePaginationParams, buildPaginationMeta } from "@/lib/utils";
import type { Prisma } from "@prisma/client";

const createTeamSchema = z.object({
  name: z.string().min(1, "Team name is required"),
  description: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const rl = applyRateLimit(request);
  if (rl) return rl;

  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const { searchParams } = new URL(request.url);
  const { page, limit, search } = parsePaginationParams(searchParams, 12);
  const showArchived = searchParams.get("archived") === "true";

  const where: Prisma.TeamWhereInput = {
    companyId: authResult.companyId,
    archivedAt: showArchived ? { not: null } : null,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [teams, total] = await Promise.all([
    prisma.team.findMany({
      where,
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true, avatar: true, role: true },
            },
            designation: { select: { id: true, name: true } },
          },
        },
        _count: {
          select: { members: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.team.count({ where }),
  ]);

  return NextResponse.json({
    success: true,
    data: teams,
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
    const validated = createTeamSchema.parse(body);

    const team = await prisma.team.create({
      data: {
        name: validated.name,
        description: validated.description,
        companyId: authResult.companyId,
      },
      include: {
        _count: {
          select: { members: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: team,
    }, { status: 201 });
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
