import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminOrHR, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { validateCuidParam } from "@/lib/validation";
import { writeAuditLog } from "@/lib/audit";
import { getArchivedEmail, getDisplayEmail, findActiveUserByEmail } from "@/lib/user-archive";

export async function GET(
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
    const user = await prisma.user.findFirst({
      where: { id: id, companyId: authResult.companyId },
      include: {
        teamMemberships: {
          include: {
            team: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: "User not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // Fetch evaluation assignments in both directions
    const [asSubject, asReviewer] = await Promise.all([
      prisma.evaluationAssignment.findMany({
        where: { subjectId: id, cycle: { companyId: authResult.companyId } },
        select: {
          id: true, cycleId: true, reviewerId: true,
          direction: true, status: true,
          cycle: { select: { id: true, name: true, status: true } },
        },
      }),
      prisma.evaluationAssignment.findMany({
        where: { reviewerId: id, cycle: { companyId: authResult.companyId } },
        select: {
          id: true, cycleId: true, subjectId: true,
          direction: true, status: true,
          cycle: { select: { id: true, name: true, status: true } },
        },
      }),
    ]);

    // Batch-resolve other user names
    const otherUserIds = new Set<string>();
    for (const a of asSubject) otherUserIds.add(a.reviewerId);
    for (const a of asReviewer) otherUserIds.add(a.subjectId);

    const otherUsers = otherUserIds.size > 0
      ? await prisma.user.findMany({
          where: { id: { in: Array.from(otherUserIds) } },
          select: { id: true, name: true },
        })
      : [];
    const userMap = new Map(otherUsers.map((u) => [u.id, u.name]));

    const unknownUser = "Unknown";

    const receivingEvaluations = asSubject.map((a) => ({
      id: a.id,
      cycleId: a.cycleId,
      cycleName: a.cycle.name,
      cycleStatus: a.cycle.status,
      direction: a.direction,
      status: a.status,
      reviewerName: userMap.get(a.reviewerId) ?? unknownUser,
    }));

    const givingEvaluations = asReviewer.map((a) => ({
      id: a.id,
      cycleId: a.cycleId,
      cycleName: a.cycle.name,
      cycleStatus: a.cycle.status,
      direction: a.direction,
      status: a.status,
      subjectName: userMap.get(a.subjectId) ?? unknownUser,
    }));

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: getDisplayEmail(user.email),
        archivedAt: user.archivedAt,
        avatar: user.avatar,
        role: user.role,
        createdAt: user.createdAt,
        teamMemberships: user.teamMemberships.map((tm) => ({
          id: tm.id,
          role: tm.role,
          team: tm.team,
        })),
        receivingEvaluations,
        givingEvaluations,
        stats: {
          totalTeams: user.teamMemberships.length,
          totalEvaluationsReceiving: asSubject.length,
          totalEvaluationsGiving: asReviewer.length,
          submittedReceiving: asSubject.filter((a) => a.status === "SUBMITTED").length,
          submittedGiving: asReviewer.filter((a) => a.status === "SUBMITTED").length,
        },
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

const updateUserSchema = z.object({
  role: z.enum(["ADMIN", "HR", "MEMBER"]).optional(),
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  archived: z.boolean().optional(),
});

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
    const validated = updateUserSchema.parse(body);

    // Only ADMINs can change roles to/from ADMIN
    if (validated.role === "ADMIN" && authResult.role !== "ADMIN") {
      return NextResponse.json({
        success: false,
        error: "Only admins can assign the ADMIN role",
        code: "FORBIDDEN",
      }, { status: 403 });
    }

    const existing = await prisma.user.findFirst({
      where: {
        id: id,
        companyId: authResult.companyId,
      },
    });

    if (!existing) {
      return NextResponse.json({
        success: false,
        error: "User not found",
        code: "NOT_FOUND",
      }, { status: 404 });
    }

    // Prevent demoting self from ADMIN
    if (existing.id === authResult.userId && existing.role === "ADMIN" && validated.role && validated.role !== "ADMIN") {
      return NextResponse.json({
        success: false,
        error: "Cannot demote yourself from ADMIN role",
        code: "FORBIDDEN",
      }, { status: 403 });
    }

    // Only ADMINs can modify other ADMINs
    if (existing.role === "ADMIN" && authResult.role !== "ADMIN") {
      return NextResponse.json({
        success: false,
        error: "Only admins can modify admin users",
        code: "FORBIDDEN",
      }, { status: 403 });
    }

    if (validated.archived === false && existing.archivedAt) {
      const restoredEmail = getDisplayEmail(existing.email);
      const conflictingUser = await findActiveUserByEmail(
        authResult.companyId,
        restoredEmail,
        id
      );

      if (conflictingUser) {
        return NextResponse.json({
          success: false,
          error: "Cannot restore user because the email is already in use",
          code: "DUPLICATE",
        }, { status: 409 });
      }

      const restoredUser = await prisma.user.update({
        where: { id },
        data: {
          archivedAt: null,
          email: restoredEmail,
        },
      });

      await writeAuditLog({
        companyId: authResult.companyId,
        userId: authResult.userId,
        action: "user_deactivate",
        target: `user:${id}`,
        metadata: { email: restoredEmail, role: existing.role, type: "restore" },
      });

      return NextResponse.json({
        success: true,
        data: {
          ...restoredUser,
          email: restoredEmail,
        },
      });
    }

    if (validated.email && validated.email !== getDisplayEmail(existing.email)) {
      const conflictingUser = await findActiveUserByEmail(
        authResult.companyId,
        validated.email,
        id
      );

      if (conflictingUser) {
        return NextResponse.json({
          success: false,
          error: "A user with this email already exists in the company",
          code: "DUPLICATE",
        }, { status: 409 });
      }
    }

    const user = await prisma.user.update({
      where: { id: id },
      data: {
        ...(validated.role !== undefined ? { role: validated.role } : {}),
        ...(validated.name !== undefined ? { name: validated.name } : {}),
        ...(validated.email !== undefined ? { email: validated.email } : {}),
      },
    });

    if (validated.role && validated.role !== existing.role) {
      await writeAuditLog({
        companyId: authResult.companyId,
        userId: authResult.userId,
        action: "role_change",
        target: `user:${id}`,
        metadata: { oldRole: existing.role, newRole: validated.role },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...user,
        email: getDisplayEmail(user.email ?? existing.email),
      },
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

  const { searchParams } = new URL(request.url);
  const isHardDelete = searchParams.get("hard") === "true";

  const user = await prisma.user.findFirst({
    where: {
      id: id,
      companyId: authResult.companyId,
    },
  });

  if (!user) {
    return NextResponse.json({
      success: false,
      error: "User not found",
      code: "NOT_FOUND",
    }, { status: 404 });
  }

  // Prevent deleting/archiving yourself
  if (user.id === authResult.userId) {
    return NextResponse.json({
      success: false,
      error: "Cannot remove your own account",
      code: "FORBIDDEN",
    }, { status: 403 });
  }

  // Only ADMINs can remove other ADMINs
  if (user.role === "ADMIN" && authResult.role !== "ADMIN") {
    return NextResponse.json({
      success: false,
      error: "Only admins can remove admin users",
      code: "FORBIDDEN",
    }, { status: 403 });
  }

  if (isHardDelete) {
    // Hard delete — permanently remove user and all related records
    await prisma.$transaction([
      prisma.otpSession.deleteMany({
        where: {
          assignment: {
            OR: [{ subjectId: id }, { reviewerId: id }],
          },
        },
      }),
      prisma.evaluationResponse.deleteMany({
        where: {
          assignment: {
            OR: [{ subjectId: id }, { reviewerId: id }],
          },
        },
      }),
      prisma.evaluationAssignment.deleteMany({
        where: {
          OR: [{ subjectId: id }, { reviewerId: id }],
        },
      }),
      prisma.teamMember.deleteMany({
        where: { userId: id },
      }),
      prisma.user.delete({
        where: { id: id },
      }),
    ]);

    // Clean up AuthUser if no other User records reference it
    if (user.authUserId) {
      const remainingUsers = await prisma.user.count({
        where: { authUserId: user.authUserId },
      });
      if (remainingUsers === 0) {
        await prisma.$transaction([
          prisma.session.deleteMany({ where: { userId: user.authUserId } }),
          prisma.account.deleteMany({ where: { userId: user.authUserId } }),
          prisma.authUser.delete({ where: { id: user.authUserId } }),
        ]);
      }
    }

    await writeAuditLog({
      companyId: authResult.companyId,
      userId: authResult.userId,
      action: "user_deactivate",
      target: `user:${id}`,
      metadata: { email: user.email, role: user.role, type: "hard_delete" },
    });

    return NextResponse.json({
      success: true,
      data: { deleted: true },
    });
  }

  // Soft delete — archive the user
  await prisma.user.update({
    where: { id: id },
    data: {
      archivedAt: new Date(),
      email: getArchivedEmail(getDisplayEmail(user.email), user.id),
    },
  });

  await writeAuditLog({
    companyId: authResult.companyId,
    userId: authResult.userId,
    action: "user_deactivate",
    target: `user:${id}`,
    metadata: { email: user.email, role: user.role, type: "archive" },
  });

  return NextResponse.json({
    success: true,
    data: { archived: true },
  });
}
