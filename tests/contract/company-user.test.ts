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

describe("Contract: Company", () => {
  it("creates a company with required fields", async () => {
    const company = await factories.company();
    expect(company.id).toBeTruthy();
    expect(company.name).toBe("Test Corp");
    expect(company.keyVersion).toBe(1);
  });

  it("sets default timestamps", async () => {
    const company = await factories.company();
    expect(company.createdAt).toBeInstanceOf(Date);
    expect(company.updatedAt).toBeInstanceOf(Date);
  });

  it("enforces unique slug constraint", async () => {
    await factories.company({ slug: "duplicate-slug" });
    await expect(factories.company({ slug: "duplicate-slug" })).rejects.toThrow(
      /Unique constraint/i
    );
  });

  it("allows nullable fields", async () => {
    const company = await factories.company();
    expect(company.logo).toBeNull();
    expect(company.settings).toBeNull();
    expect(company.encryptionSetupAt).toBeNull();
  });
});

describe("Contract: User", () => {
  it("creates a user linked to a company", async () => {
    const company = await factories.company();
    const user = await factories.user(company.id, { email: "alice@test.com", name: "Alice" });

    expect(user.companyId).toBe(company.id);
    expect(user.role).toBe("MEMBER");
  });

  it("enforces unique email+companyId constraint", async () => {
    const company = await factories.company();
    await factories.user(company.id, { email: "dupe@test.com" });
    await expect(factories.user(company.id, { email: "dupe@test.com" })).rejects.toThrow(
      /Unique constraint/i
    );
  });

  it("allows same email in different companies", async () => {
    const company1 = await factories.company({ slug: "c1" });
    const company2 = await factories.company({ slug: "c2" });

    const user1 = await factories.user(company1.id, { email: "shared@test.com" });
    const user2 = await factories.user(company2.id, { email: "shared@test.com" });

    expect(user1.id).not.toBe(user2.id);
    expect(user1.email).toBe(user2.email);
  });

  it("validates UserRole enum values", async () => {
    const company = await factories.company();

    for (const role of ["ADMIN", "HR", "MEMBER"] as const) {
      const user = await factories.user(company.id, {
        role,
        email: `${role.toLowerCase()}@test.com`,
      });
      expect(user.role).toBe(role);
    }
  });

  it("defaults role to MEMBER", async () => {
    const company = await factories.company();
    const user = await factories.user(company.id);
    expect(user.role).toBe("MEMBER");
  });

  it("sets createdAt automatically", async () => {
    const company = await factories.company();
    const user = await factories.user(company.id);
    expect(user.createdAt).toBeInstanceOf(Date);
  });
});
