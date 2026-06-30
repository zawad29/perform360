import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrHR, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { parsePaginationParams, buildPaginationMeta } from "@/lib/utils";
import type { Prisma } from "@prisma/client";
import { getDisplayEmail } from "@/lib/user-archive";

export async function GET(request: NextRequest) {
  const rl = applyRateLimit(request);
  if (rl) return rl;

  const authResult = await requireAdminOrHR();
  if (isAuthError(authResult)) return authResult;

  const { searchParams } = new URL(request.url);
  const { page, limit, search } = parsePaginationParams(searchParams, 20);

  const includeArchived = searchParams.get("archived") === "true";
  const roleFilter = searchParams.get("role");

  const where: Prisma.UserWhereInput = {
    companyId: authResult.companyId,
    ...(includeArchived ? {} : { archivedAt: null }),
    ...(roleFilter === "HR_ADMIN"
      ? { role: { in: ["HR", "ADMIN"] } }
      : roleFilter === "MEMBER"
        ? { role: { in: ["MEMBER"] } }
        : roleFilter === "MEMBER" || roleFilter === "EXTERNAL"
          ? { role: roleFilter }
          : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        teamMemberships: {
          include: {
            team: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  return NextResponse.json({
    success: true,
    data: users.map((user) => ({
      ...user,
      email: getDisplayEmail(user.email),
    })),
    pagination: buildPaginationMeta(page, limit, total),
  });
}
