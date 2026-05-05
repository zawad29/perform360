import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma, setupTestDatabase, cleanDatabase, factories } from "./setup";

beforeAll(async () => {
  await setupTestDatabase();
});

beforeEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Contract: EvaluationCycle", () => {
  it("creates a cycle with default DRAFT status", async () => {
    const company = await factories.company();
    const cycle = await factories.cycle(company.id);

    expect(cycle.status).toBe("DRAFT");
    expect(cycle.startDate).toBeInstanceOf(Date);
    expect(cycle.endDate).toBeInstanceOf(Date);
  });

  it("validates CycleStatus enum values", async () => {
    const company = await factories.company();

    for (const status of ["DRAFT", "ACTIVE", "CLOSED", "ARCHIVED"] as const) {
      const cycle = await factories.cycle(company.id, { status, name: `Cycle-${status}` });
      expect(cycle.status).toBe(status);
    }
  });

  it("auto-updates updatedAt on modification", async () => {
    const company = await factories.company();
    const cycle = await factories.cycle(company.id);
    const originalUpdatedAt = cycle.updatedAt;

    await new Promise((r) => setTimeout(r, 50));

    const updated = await prisma.evaluationCycle.update({
      where: { id: cycle.id },
      data: { status: "ACTIVE" },
    });

    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(originalUpdatedAt.getTime());
  });
});

describe("Contract: EvaluationAssignment", () => {
  it("creates an assignment with unique token", async () => {
    const company = await factories.company();
    const cycle = await factories.cycle(company.id);
    const reviewer = await factories.user(company.id, { email: "reviewer@test.com" });
    const subject = await factories.user(company.id, { email: "subject@test.com" });
    const template = await factories.template({ companyId: company.id, isGlobal: false });

    const assignment = await prisma.evaluationAssignment.create({
      data: {
        cycleId: cycle.id,
        templateId: template.id,
        subjectId: subject.id,
        reviewerId: reviewer.id,
        direction: "LATERAL",
      },
    });

    expect(assignment.status).toBe("PENDING");
    expect(assignment.token).toBeTruthy();
  });

  it("enforces unique cycleId+subjectId+reviewerId+templateId", async () => {
    const company = await factories.company();
    const cycle = await factories.cycle(company.id);
    const reviewer = await factories.user(company.id, { email: "r@test.com" });
    const subject = await factories.user(company.id, { email: "s@test.com" });
    const template = await factories.template();

    const data = {
      cycleId: cycle.id,
      templateId: template.id,
      subjectId: subject.id,
      reviewerId: reviewer.id,
      direction: "LATERAL" as const,
    };

    await prisma.evaluationAssignment.create({ data });
    await expect(prisma.evaluationAssignment.create({ data })).rejects.toThrow(
      /Unique constraint/i
    );
  });

  it("validates AssignmentStatus enum", async () => {
    const company = await factories.company();
    const cycle = await factories.cycle(company.id);
    const template = await factories.template();

    for (const status of ["PENDING", "IN_PROGRESS", "SUBMITTED"] as const) {
      const reviewer = await factories.user(company.id, { email: `rev-${status}@test.com` });
      const subject = await factories.user(company.id, { email: `sub-${status}@test.com` });

      const a = await prisma.evaluationAssignment.create({
        data: {
          cycleId: cycle.id,
          templateId: template.id,
          subjectId: subject.id,
          reviewerId: reviewer.id,
          direction: "SELF",
          status,
        },
      });
      expect(a.status).toBe(status);
    }
  });
});

describe("Contract: CycleTeam", () => {
  it("enforces unique cycleId+teamId", async () => {
    const company = await factories.company();
    const cycle = await factories.cycle(company.id);
    const team = await factories.team(company.id);
    const template = await factories.template();

    await prisma.cycleTeam.create({
      data: {
        cycleId: cycle.id,
        teamId: team.id,
        templates: { create: [{ templateId: template.id }] },
      },
    });

    await expect(
      prisma.cycleTeam.create({
        data: {
          cycleId: cycle.id,
          teamId: team.id,
          templates: { create: [{ templateId: template.id }] },
        },
      })
    ).rejects.toThrow(/Unique constraint/i);
  });

  it("cascades delete when cycle is deleted", async () => {
    const company = await factories.company();
    const cycle = await factories.cycle(company.id);
    const team = await factories.team(company.id);
    const template = await factories.template();

    await prisma.cycleTeam.create({
      data: {
        cycleId: cycle.id,
        teamId: team.id,
        templates: { create: [{ templateId: template.id }] },
      },
    });

    await prisma.evaluationCycle.delete({ where: { id: cycle.id } });

    const remaining = await prisma.cycleTeam.count({ where: { cycleId: cycle.id } });
    expect(remaining).toBe(0);
  });
});
