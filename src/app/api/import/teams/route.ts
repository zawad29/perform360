import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminOrHR, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit";
import type { ImportResult } from "@/types/import";

const csvRowSchema = z.object({
  name: z.string().min(1),
  email: z.string(),
  team: z.string().min(1),
  role: z.string().min(1),
  level: z.string().optional(),
});

const importSchema = z.object({
  rows: z.array(csvRowSchema).min(1, "CSV must contain at least one row"),
});

export async function POST(request: NextRequest) {
  const rl = applyRateLimit(request);
  if (rl) return rl;

  const authResult = await requireAdminOrHR();
  if (isAuthError(authResult)) return authResult;

  try {
    const body = await request.json();
    const validated = importSchema.parse(body);
    const { companyId } = authResult;

    const validRows = validated.rows.filter(
      (r) => r.email.trim() !== "" && r.email.includes("@")
    );
    const skippedRows = validated.rows.filter(
      (r) => r.email.trim() === "" || !r.email.includes("@")
    );

    const result = await prisma.$transaction(
      async (tx) => {
        const stats: ImportResult = {
          teamsCreated: 0,
          teamsExisted: 0,
          usersCreated: 0,
          usersExisted: 0,
          membershipsCreated: 0,
          membershipsExisted: 0,
          rowsSkipped: skippedRows.length,
          skippedDetails: skippedRows.map((r) => ({
            name: r.name,
            reason: "No email address",
          })),
          managersLinked: 0,
          managersNotFound: [],
        };

        // 1. Create teams
        const uniqueTeamNames = Array.from(
          new Set(validRows.map((r) => r.team.trim()))
        );
        const teamMap = new Map<string, string>();

        for (const teamName of uniqueTeamNames) {
          const existing = await tx.team.findFirst({
            where: { name: teamName, companyId },
          });
          if (existing) {
            teamMap.set(teamName, existing.id);
            stats.teamsExisted++;
          } else {
            const created = await tx.team.create({
              data: { name: teamName, companyId },
            });
            teamMap.set(teamName, created.id);
            stats.teamsCreated++;
          }
        }

        // 2. Create users (AuthUser + User per unique email)
        const emailInfo = new Map<string, { name: string; isExternal: boolean }>();
        for (const row of validRows) {
          const email = row.email.trim().toLowerCase();
          if (!emailInfo.has(email)) {
            const isExternal = row.role.toLowerCase() === "external";
            emailInfo.set(email, { name: row.name.trim(), isExternal });
          }
        }

        const userMap = new Map<string, string>(); // email -> userId
        for (const [email, { name, isExternal }] of Array.from(emailInfo.entries())) {
          const existingUser = await tx.user.findUnique({
            where: { email_companyId: { email, companyId } },
          });
          if (existingUser) {
            userMap.set(email, existingUser.id);
            stats.usersExisted++;
          } else {
            const authUser = await tx.authUser.upsert({
              where: { email },
              create: { email, name },
              update: {},
            });
            const newUser = await tx.user.create({
              data: {
                email,
                name,
                role: isExternal ? "EXTERNAL" : "MEMBER",
                companyId,
                authUserId: authUser.id,
              },
            });
            userMap.set(email, newUser.id);
            stats.usersCreated++;
          }
        }

        // 3. Find-or-create levels from CSV
        const levelMap = new Map<string, string>(); // levelName -> levelId
        const uniqueLevelNames = Array.from(
          new Set(validRows.map((r) => r.level?.trim()).filter((l): l is string => !!l))
        );
        for (const levelName of uniqueLevelNames) {
          const existing = await tx.level.findUnique({
            where: { companyId_name: { companyId, name: levelName } },
          });
          if (existing) {
            levelMap.set(levelName, existing.id);
          } else {
            const created = await tx.level.create({
              data: { name: levelName, companyId },
            });
            levelMap.set(levelName, created.id);
          }
        }

        // 4. Create team memberships
        for (const row of validRows) {
          const email = row.email.trim().toLowerCase();
          const teamName = row.team.trim();
          const levelName = row.level?.trim();
          const userId = userMap.get(email);
          const teamId = teamMap.get(teamName);

          if (!userId || !teamId) continue;

          const ROLE_MAP = {
            manager: "MANAGER",
            member: "MEMBER",
            external: "EXTERNAL",
          } as const;
          const role = ROLE_MAP[row.role.toLowerCase() as keyof typeof ROLE_MAP] ?? ("MEMBER" as const);
          const levelId = levelName ? (levelMap.get(levelName) ?? null) : null;

          const existingMembership = await tx.teamMember.findUnique({
            where: { userId_teamId: { userId, teamId } },
          });
          if (existingMembership) {
            // Update level or role if different
            const updates: Record<string, string | null> = {};
            if (levelId && existingMembership.levelId !== levelId) {
              updates.levelId = levelId;
            }
            if (Object.keys(updates).length > 0) {
              await tx.teamMember.update({
                where: { id: existingMembership.id },
                data: updates,
              });
            }
            stats.membershipsExisted++;
          } else {
            await tx.teamMember.create({ data: { userId, teamId, role, levelId } });
            stats.membershipsCreated++;
          }
        }

        return stats;
      },
      { timeout: 30000 }
    );

    writeAuditLog({
      companyId: authResult.companyId,
      userId: authResult.userId,
      action: "bulk_import",
      metadata: {
        teamsCreated: result.teamsCreated,
        usersCreated: result.usersCreated,
        membershipsCreated: result.membershipsCreated,
        rowsSkipped: result.rowsSkipped,
      },
    }).catch(() => {});

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed",
          code: "VALIDATION_ERROR",
        },
        { status: 400 }
      );
    }
    console.error("[Import] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
