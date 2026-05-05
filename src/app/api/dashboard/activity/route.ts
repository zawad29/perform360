import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { DIRECTION_LABELS } from "@/lib/directions";

interface ActivityItem {
  id: string;
  type: "submission" | "cycle_status" | "team_created" | "user_invited" | "cycle_created";
  title: string;
  description: string;
  timestamp: string;
  metadata?: Record<string, string>;
}

export async function GET(request: NextRequest) {
  const rl = applyRateLimit(request);
  if (rl) return rl;

  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const companyId = authResult.companyId;

  const [recentSubmissions, recentCycles, recentTeams, recentUsers] =
    await Promise.all([
      prisma.evaluationResponse.findMany({
        where: {
          assignment: { cycle: { companyId } },
          submittedAt: { not: null },
        },
        orderBy: { submittedAt: "desc" },
        take: 10,
        select: {
          id: true,
          submittedAt: true,
          reviewer: { select: { name: true } },
          subject: { select: { name: true } },
          assignment: {
            select: {
              direction: true,
              cycle: { select: { name: true } },
            },
          },
        },
      }),
      prisma.evaluationCycle.findMany({
        where: { companyId },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.team.findMany({
        where: { companyId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          name: true,
          createdAt: true,
          _count: { select: { members: true } },
        },
      }),
      prisma.user.findMany({
        where: { companyId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          name: true,
          role: true,
          createdAt: true,
        },
      }),
    ]);

  const activities: ActivityItem[] = [];

  for (const sub of recentSubmissions) {
    const relationLabel = DIRECTION_LABELS[sub.assignment.direction];
    activities.push({
      id: `sub-${sub.id}`,
      type: "submission",
      title: "Evaluation submitted",
      description: `${sub.reviewer.name} submitted a ${relationLabel.toLowerCase()} review for ${sub.subject.name}`,
      timestamp: sub.submittedAt!.toISOString(),
      metadata: { cycle: sub.assignment.cycle.name, direction: relationLabel },
    });
  }

  for (const cycle of recentCycles) {
    const isNew =
      Math.abs(cycle.createdAt.getTime() - cycle.updatedAt.getTime()) < 5000;
    activities.push({
      id: `cycle-${cycle.id}`,
      type: isNew ? "cycle_created" : "cycle_status",
      title: isNew ? "Cycle created" : `Cycle ${cycle.status.toLowerCase()}`,
      description: isNew
        ? `"${cycle.name}" was created`
        : `"${cycle.name}" status changed to ${cycle.status.toLowerCase()}`,
      timestamp: (isNew ? cycle.createdAt : cycle.updatedAt).toISOString(),
      metadata: { status: cycle.status },
    });
  }

  for (const team of recentTeams) {
    activities.push({
      id: `team-${team.id}`,
      type: "team_created",
      title: "Team created",
      description: `"${team.name}" was created with ${team._count.members} member${team._count.members !== 1 ? "s" : ""}`,
      timestamp: team.createdAt.toISOString(),
    });
  }

  for (const user of recentUsers) {
    activities.push({
      id: `user-${user.id}`,
      type: "user_invited",
      title: "User added",
      description: `${user.name} joined as ${user.role.toLowerCase()}`,
      timestamp: user.createdAt.toISOString(),
      metadata: { role: user.role },
    });
  }

  activities.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return NextResponse.json({
    success: true,
    data: activities.slice(0, 15),
  });
}
