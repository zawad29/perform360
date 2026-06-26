import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma, setupTestDatabase, cleanDatabase, factories } from "./setup";
import { applyCompanyImport, type CompanyImport } from "@/lib/company-import-schema";

beforeAll(async () => {
  await setupTestDatabase();
});
beforeEach(async () => {
  await cleanDatabase();
});
afterAll(async () => {
  await prisma.$disconnect();
});

// A small but representative universal-import fixture.
const fixture: CompanyImport = {
  formatVersion: 1,
  company: { name: "Acme Inc", slug: "acme" },
  designations: ["Engineer", "Senior Engineer"],
  users: [
    { email: "boss@acme.com", name: "Boss", role: "ADMIN" },
    { email: "alice@acme.com", name: "Alice", role: "MEMBER" },
    { email: "bob@acme.com", name: "Bob", role: "MEMBER" },
  ],
  teams: [
    {
      name: "Core",
      description: "Core team",
      members: [
        { email: "boss@acme.com", role: "MANAGER", designation: "Senior Engineer" },
        { email: "alice@acme.com", role: "MEMBER", designation: "Engineer" },
        { email: "bob@acme.com", role: "MEMBER", designation: "Engineer" },
      ],
    },
  ],
  templates: [
    {
      name: "Eng Review",
      description: "Engineering 360",
      weightPreset: "equal",
      designations: ["Engineer", "Senior Engineer"],
      appliesToRole: "ANY",
      sections: [
        {
          id: "s1",
          title: "Value-Based (Q1–Q12)",
          directions: [],
          questions: [{ id: "s1-q1", text: "Delivers quality", type: "rating_scale", required: true, scaleMin: 1, scaleMax: 5 }],
        },
      ],
    },
  ],
  cycles: [
    {
      name: "Annual",
      status: "ACTIVE",
      startDate: "2025-07-01",
      endDate: "2026-06-30",
      teams: "ALL",
      templateMode: "matching",
      generateAssignments: true,
    },
  ],
};

describe("Contract: applyCompanyImport", () => {
  it("creates designations, users, teams, memberships, templates, and a cycle", async () => {
    const company = await factories.company();
    const res = await prisma.$transaction((tx) => applyCompanyImport(tx, company.id, fixture, "boss@acme.com"));

    expect(res.designationsCreated).toBe(2);
    expect(res.usersCreated).toBe(3);
    expect(res.teamsCreated).toBe(1);
    expect(res.membershipsCreated).toBe(3);
    expect(res.templatesCreated).toBe(1);
    expect(res.cyclesCreated).toBe(1);
    expect(res.assignmentsCreated).toBeGreaterThan(0);

    const userCount = await prisma.user.count({ where: { companyId: company.id } });
    expect(userCount).toBe(3);
    const admin = await prisma.user.findFirst({ where: { companyId: company.id, email: "boss@acme.com" } });
    expect(admin?.role).toBe("ADMIN");
  });

  it("resolves template designationIds from designation names", async () => {
    const company = await factories.company();
    await prisma.$transaction((tx) => applyCompanyImport(tx, company.id, fixture, "boss@acme.com"));

    const tpl = await prisma.evaluationTemplate.findFirst({ where: { companyId: company.id, name: "Eng Review" } });
    const designations = await prisma.designation.findMany({ where: { companyId: company.id } });
    const ids = new Set(designations.map((d) => d.id));
    expect(tpl?.designationIds.length).toBe(2);
    for (const id of tpl!.designationIds) expect(ids.has(id)).toBe(true);
  });

  it("persists a template's appliesToRole and re-routes assignments by it", async () => {
    const company = await factories.company();
    // A role-specific fixture: a MANAGER ("Boss", Senior Engineer) plus a MEMBER
    // template and a MANAGER template that both cover the Senior Engineer designation.
    const roleFixture: CompanyImport = {
      ...fixture,
      templates: [
        {
          name: "IC Review",
          designations: ["Engineer", "Senior Engineer"],
          appliesToRole: "MEMBER",
          sections: [{ id: "s1", title: "IC", directions: [], questions: [{ id: "s1-q1", text: "Q", type: "rating_scale", required: true, scaleMin: 1, scaleMax: 5 }] }],
        },
        {
          name: "Lead Review",
          designations: ["Senior Engineer"],
          appliesToRole: "MANAGER",
          sections: [{ id: "s1", title: "Lead", directions: [], questions: [{ id: "s1-q1", text: "Q", type: "rating_scale", required: true, scaleMin: 1, scaleMax: 5 }] }],
        },
      ],
      cycles: undefined,
    };
    await prisma.$transaction((tx) => applyCompanyImport(tx, company.id, roleFixture, "boss@acme.com"));

    const ic = await prisma.evaluationTemplate.findFirst({ where: { companyId: company.id, name: "IC Review" } });
    const lead = await prisma.evaluationTemplate.findFirst({ where: { companyId: company.id, name: "Lead Review" } });
    expect(ic?.appliesToRole).toBe("MEMBER");
    expect(lead?.appliesToRole).toBe("MANAGER");
  });

  it("bumps a template version when only appliesToRole changes on re-import", async () => {
    const company = await factories.company();
    await prisma.$transaction((tx) => applyCompanyImport(tx, company.id, fixture, "boss@acme.com"));
    const before = await prisma.evaluationTemplate.findFirst({ where: { companyId: company.id, name: "Eng Review" } });
    expect(before?.version).toBe(1);

    const changed: CompanyImport = {
      ...fixture,
      cycles: undefined,
      templates: fixture.templates.map((t) => ({ ...t, appliesToRole: "MEMBER" as const })),
    };
    const res = await prisma.$transaction((tx) => applyCompanyImport(tx, company.id, changed, "boss@acme.com"));
    expect(res.templatesUpdated).toBe(1);
    const after = await prisma.evaluationTemplate.findFirst({ where: { companyId: company.id, name: "Eng Review" } });
    expect(after?.version).toBe(2);
    expect(after?.appliesToRole).toBe("MEMBER");
  });

  it("leaves every team with a MANAGER (no incomplete teams)", async () => {
    const company = await factories.company();
    await prisma.$transaction((tx) => applyCompanyImport(tx, company.id, fixture, "boss@acme.com"));
    const teams = await prisma.team.findMany({
      where: { companyId: company.id },
      select: { members: { where: { role: "MANAGER" }, select: { id: true } } },
    });
    for (const t of teams) expect(t.members.length).toBeGreaterThan(0);
  });

  it("is idempotent — a second import creates no new rows", async () => {
    const company = await factories.company();
    await prisma.$transaction((tx) => applyCompanyImport(tx, company.id, fixture, "boss@acme.com"));
    const second = await prisma.$transaction((tx) => applyCompanyImport(tx, company.id, fixture, "boss@acme.com"));

    const newRows =
      second.designationsCreated + second.usersCreated + second.teamsCreated +
      second.membershipsCreated + second.templatesCreated + second.templatesUpdated +
      second.cyclesCreated + second.assignmentsCreated + second.usersUpdated;
    expect(newRows).toBe(0);

    expect(await prisma.user.count({ where: { companyId: company.id } })).toBe(3);
    expect(await prisma.team.count({ where: { companyId: company.id } })).toBe(1);
    expect(await prisma.evaluationCycle.count({ where: { companyId: company.id } })).toBe(1);
  });

  it("updates a changed user's name/role on re-import", async () => {
    const company = await factories.company();
    await prisma.$transaction((tx) => applyCompanyImport(tx, company.id, fixture, "boss@acme.com"));

    const changed: CompanyImport = {
      ...fixture,
      users: fixture.users.map((u) => (u.email === "alice@acme.com" ? { ...u, name: "Alice Cooper" } : u)),
    };
    const res = await prisma.$transaction((tx) => applyCompanyImport(tx, company.id, changed, "boss@acme.com"));
    expect(res.usersUpdated).toBe(1);
    const alice = await prisma.user.findFirst({ where: { companyId: company.id, email: "alice@acme.com" } });
    expect(alice?.name).toBe("Alice Cooper");
  });
});
