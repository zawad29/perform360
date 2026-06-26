import { describe, it, expect } from "vitest";
import { companyImportSchema, weightsForPreset, type CompanyImport } from "@/lib/company-import-schema";
import { companyImportToWorkbook, workbookToCompanyImport } from "@/lib/company-import-xlsx";

// A generic fixture exercising every part of the format, incl. tricky cases:
//  - a designation name containing a comma ("EDA Engineer, DV")
//  - scaleLabels with empty middle slots
//  - a cross-team manager with no designation
//  - an optional cycle
const fixture: CompanyImport = companyImportSchema.parse({
  formatVersion: 1,
  company: { name: "Acme Inc", slug: "acme" },
  designations: ["Software Engineer", "EDA Engineer, DV", "Senior Engineer"],
  users: [
    { email: "boss@acme.com", name: "The Boss", role: "ADMIN" },
    { email: "alice@acme.com", name: "Alice", role: "MEMBER" },
    { email: "bob@acme.com", name: "Bob", role: "MEMBER" },
  ],
  teams: [
    {
      name: "Core",
      description: "Core team",
      members: [
        { email: "boss@acme.com", role: "MANAGER" }, // no designation
        { email: "alice@acme.com", role: "MEMBER", designation: "Software Engineer" },
        { email: "bob@acme.com", role: "MEMBER", designation: "EDA Engineer, DV" },
      ],
    },
  ],
  templates: [
    {
      name: "Eng Review",
      description: "360 for engineers",
      weightPreset: "equal",
      designations: ["Software Engineer", "EDA Engineer, DV", "Senior Engineer"],
      appliesToRole: "MEMBER",
      sections: [
        {
          id: "s1",
          title: "Value-Based",
          description: "Core values",
          directions: ["SELF", "LATERAL", "DOWNWARD"],
          questions: [
            { id: "s1-q1", text: "Delivers quality", type: "rating_scale", required: true, scaleMin: 1, scaleMax: 5, scaleLabels: ["Low", "", "Mid", "", "High"] },
            { id: "s1-q2", text: "What went well?", type: "text", required: false },
          ],
        },
      ],
    },
    {
      name: "Eng Lead Review",
      description: "360 for engineering leads",
      weightPreset: "supervisor_focus",
      designations: ["Senior Engineer"],
      appliesToRole: "MANAGER",
      sections: [
        {
          id: "s1",
          title: "Leadership",
          directions: ["SELF", "UPWARD"],
          questions: [
            { id: "s1-q1", text: "Sets clear direction", type: "rating_scale", required: true, scaleMin: 1, scaleMax: 5 },
          ],
        },
      ],
    },
  ],
  cycles: [
    { name: "Annual", status: "ACTIVE", startDate: "2025-07-01", endDate: "2026-06-30", teams: "ALL", templateMode: "matching", generateAssignments: true },
  ],
});

describe("companyImportSchema validation", () => {
  it("rejects a payload missing required company.name", () => {
    expect(companyImportSchema.safeParse({ users: [{ email: "a@b.com", name: "A" }] }).success).toBe(false);
  });
  it("rejects invalid emails", () => {
    expect(companyImportSchema.safeParse({ company: { name: "X" }, users: [{ email: "nope", name: "A" }] }).success).toBe(false);
  });
  it("accepts a minimal valid payload and applies defaults", () => {
    const r = companyImportSchema.safeParse({ company: { name: "X" }, users: [{ email: "a@b.com", name: "A", role: "ADMIN" }] });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.designations).toEqual([]);
      expect(r.data.teams).toEqual([]);
      expect(r.data.templates).toEqual([]);
    }
  });
});

describe("weightsForPreset", () => {
  it("returns member+manager weights for a known preset", () => {
    const w = weightsForPreset("supervisor_focus");
    expect(w.weightsMember).toBeTruthy();
    expect(w.weightsManager).toBeTruthy();
  });
  it("returns a defined JsonNull sentinel for unknown/absent preset", () => {
    const w = weightsForPreset(null);
    expect(w.weightsMember).toBeDefined();
    expect(w.weightsManager).toBeDefined();
  });
});

describe("Excel ⇄ company-import round-trip", () => {
  // Compare only the content that the lean workbook preserves. By design the workbook drops the
  // company name (single-instance app), derives designations from usage (sorted), and
  // auto-generates section/question IDs — so we assert semantic equality, not raw deep-equal.
  const semantic = (d: CompanyImport) => ({
    users: [...d.users].sort((a, b) => a.email.localeCompare(b.email)),
    designations: [...d.designations].sort(),
    teams: d.teams.map((t) => ({
      name: t.name,
      description: t.description ?? null,
      members: t.members.map((m) => ({ email: m.email, role: m.role, designation: m.designation ?? null })),
    })),
    templates: d.templates.map((t) => ({
      name: t.name,
      description: t.description ?? null,
      weightPreset: t.weightPreset ?? null,
      appliesToRole: t.appliesToRole,
      designations: [...t.designations].sort(),
      sections: t.sections.map((s) => {
        const sec = s as { title: string; description?: string; directions?: string[]; questions: { text: string; type: string; required: boolean; scaleMin?: number; scaleMax?: number; scaleLabels?: string[]; options?: string[] }[] };
        return {
          title: sec.title,
          description: sec.description ?? null,
          directions: sec.directions ?? [],
          questions: sec.questions.map((q) => ({ text: q.text, type: q.type, required: q.required, scaleMin: q.scaleMin ?? null, scaleMax: q.scaleMax ?? null, scaleLabels: q.scaleLabels ?? [], options: q.options ?? [] })),
        };
      }),
    })),
    cycles: d.cycles ?? null,
  });

  it("preserves all content through a workbook round-trip (semantic equality)", async () => {
    const buf = await companyImportToWorkbook(fixture);
    const back = await workbookToCompanyImport(buf);
    expect(semantic(back)).toEqual(semantic(fixture));
  });

  it("preserves each template's appliesToRole through a round-trip", async () => {
    const back = await workbookToCompanyImport(await companyImportToWorkbook(fixture));
    const member = back.templates.find((t) => t.name === "Eng Review");
    const lead = back.templates.find((t) => t.name === "Eng Lead Review");
    expect(member?.appliesToRole).toBe("MEMBER");
    expect(lead?.appliesToRole).toBe("MANAGER");
  });

  it("defaults a template with a blank appliesToRole cell to ANY", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await companyImportToWorkbook(fixture)).buffer as ArrayBuffer);
    const ws = wb.getWorksheet("Templates")!;
    const headers = (ws.getRow(1).values as unknown[]).slice(1).map((v) => String(v ?? ""));
    const roleCol = headers.indexOf("appliesToRole") + 1;
    expect(roleCol).toBeGreaterThan(0);
    // Blank out every appliesToRole cell.
    for (let i = 2; i <= ws.rowCount; i++) ws.getRow(i).getCell(roleCol).value = null;
    const cleared = Buffer.from(await wb.xlsx.writeBuffer());
    const back = await workbookToCompanyImport(cleared);
    expect(back.templates.every((t) => t.appliesToRole === "ANY")).toBe(true);
  });

  it("preserves a designation name that contains a comma", async () => {
    const back = await workbookToCompanyImport(await companyImportToWorkbook(fixture));
    expect(back.designations).toContain("EDA Engineer, DV");
    expect(back.templates[0].designations).toContain("EDA Engineer, DV");
  });

  it("preserves empty middle slots in scaleLabels", async () => {
    const back = await workbookToCompanyImport(await companyImportToWorkbook(fixture));
    const q = back.templates[0].sections[0].questions[0] as { scaleLabels?: string[] };
    expect(q.scaleLabels).toEqual(["Low", "", "Mid", "", "High"]);
  });

  it("keeps a manager with no designation, and the cycle", async () => {
    const back = await workbookToCompanyImport(await companyImportToWorkbook(fixture));
    const mgr = back.teams[0].members.find((m) => m.role === "MANAGER")!;
    expect(mgr.email).toBe("boss@acme.com");
    expect(mgr.designation == null).toBe(true);
    expect(back.cycles?.[0].status).toBe("ACTIVE");
  });

  it("factors identical sections across templates into a single shared block (no duplication)", async () => {
    // Two templates sharing the exact same section → that section's questions appear ONCE in Blocks.
    const shared: CompanyImport = companyImportSchema.parse({
      company: { name: "X" },
      users: [{ email: "a@b.com", name: "A", role: "ADMIN" }],
      designations: ["Eng"],
      teams: [{ name: "T", members: [{ email: "a@b.com", role: "MANAGER" }] }],
      templates: [
        { name: "T1", designations: ["Eng"], sections: [{ id: "x", title: "Shared", directions: [], questions: [{ id: "x-q1", text: "Q one", type: "rating_scale", required: true, scaleMin: 1, scaleMax: 5 }] }] },
        { name: "T2", designations: ["Eng"], sections: [{ id: "y", title: "Shared", directions: [], questions: [{ id: "y-q1", text: "Q one", type: "rating_scale", required: true, scaleMin: 1, scaleMax: 5 }] }] },
      ],
    });
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await companyImportToWorkbook(shared)).buffer as ArrayBuffer);
    const blocks = wb.getWorksheet("Blocks")!;
    // header + exactly ONE question row (the shared block defined once)
    expect(blocks.rowCount).toBe(2);
    // both templates still reconstruct their section on re-import
    const back = await workbookToCompanyImport(await companyImportToWorkbook(shared));
    expect(back.templates).toHaveLength(2);
    expect(back.templates[0].sections[0].questions[0].text).toBe("Q one");
    expect(back.templates[1].sections[0].questions[0].text).toBe("Q one");
  });

  it("throws a clear error when the required People sheet is missing", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Teams").addRow(["name", "description"]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    await expect(workbookToCompanyImport(buf)).rejects.toThrow(/People/);
  });
});
