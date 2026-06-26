import { Prisma, PrismaClient } from "@prisma/client";
import { execSync } from "child_process";
import { config } from "dotenv";

config({ path: ".env.test" });

export const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL },
  },
});

export async function setupTestDatabase(): Promise<void> {
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
    stdio: "inherit",
  });
}

export async function cleanDatabase(): Promise<void> {
  await prisma.evaluationResponse.deleteMany();
  await prisma.otpSession.deleteMany();
  await prisma.evaluationAssignment.deleteMany();
  await prisma.cycleTeam.deleteMany();
  await prisma.evaluationCycle.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.team.deleteMany();
  await prisma.evaluationTemplate.deleteMany();
  await prisma.recoveryCode.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.jobQueue.deleteMany();
  await prisma.user.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.authUser.deleteMany();
  await prisma.verificationToken.deleteMany();
  // Designations are FK-referenced by Company; delete them before companies.
  // (TeamMember rows that reference designations are already removed above.)
  await prisma.designation.deleteMany();
  await prisma.company.deleteMany();
}

export const factories = {
  company: (overrides: Partial<Prisma.CompanyUncheckedCreateInput> = {}) =>
    prisma.company.create({
      data: {
        name: "Test Corp",
        slug: `test-corp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        encryptionKeyEncrypted: "test-encrypted-key",
        encryptionSalt: "dGVzdC1zYWx0",
        ...overrides,
      },
    }),

  user: (companyId: string, overrides: Partial<Prisma.UserUncheckedCreateInput> = {}) =>
    prisma.user.create({
      data: {
        email: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.com`,
        name: "Test User",
        role: "MEMBER",
        companyId,
        ...overrides,
      },
    }),

  team: (companyId: string, overrides: Partial<Prisma.TeamUncheckedCreateInput> = {}) =>
    prisma.team.create({
      data: {
        name: `Team ${Date.now()}`,
        companyId,
        ...overrides,
      },
    }),

  cycle: (companyId: string, overrides: Partial<Prisma.EvaluationCycleUncheckedCreateInput> = {}) =>
    prisma.evaluationCycle.create({
      data: {
        name: `Cycle ${Date.now()}`,
        companyId,
        status: "DRAFT",
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 86_400_000),
        ...overrides,
      },
    }),

  template: (overrides: Partial<Prisma.EvaluationTemplateUncheckedCreateInput> = {}) =>
    prisma.evaluationTemplate.create({
      data: {
        name: `Template ${Date.now()}`,
        sections: [
          {
            title: "Test Section",
            questions: [{ id: "q1", text: "Rating", type: "rating_scale", required: true }],
          },
        ],
        isGlobal: true,
        createdBy: "test@test.com",
        ...overrides,
      },
    }),
};
