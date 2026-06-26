/**
 * Excel ⇄ universal company-import bridge.
 *
 * Serializes the `CompanyImport` format (src/lib/company-import-schema.ts) to/from a lean,
 * human-readable multi-sheet `.xlsx`. The internal JSON format is unchanged — this module only
 * defines a compact spreadsheet shape and reassembles the nested structure on import.
 *
 * Design goals: no duplicated data, no machine IDs, easy to read/edit.
 *  - People     — one row per person-in-team (email/name/orgRole + team/teamRole/designation).
 *                 Users are de-duplicated by email; designations are derived from usage.
 *  - Teams      — optional team descriptions (name/description).
 *  - Blocks     — REUSABLE question sets, each defined ONCE (a "block" = a named section).
 *  - Templates  — name/description/weightPreset/designations + an ordered list of block names.
 *                 Every question lives once in Blocks; templates just compose blocks.
 *  - Cycles     — optional review cycles.
 *
 * There is no Company sheet (single-instance app — import targets the caller's company) and no
 * standalone Designations sheet (derived from People + Templates). Section/question IDs are
 * auto-generated from template + block + row position.
 *
 * `workbookToCompanyImport(buf)` parses + validates; `companyImportToWorkbook(data)` is the
 * inverse (factoring identical sections into shared blocks).
 */

import ExcelJS from "exceljs";
import { companyImportSchema, type CompanyImport } from "./company-import-schema";

// ─── Sheet + column names (exported so route/example/tests stay in sync) ───

export const SHEETS = {
  people: "People",
  teams: "Teams",
  blocks: "Blocks",
  templates: "Templates",
  cycles: "Cycles",
} as const;

export const COLUMNS = {
  people: ["email", "name", "orgRole", "team", "teamRole", "designation"],
  teams: ["name", "description"],
  blocks: ["block", "sectionTitle", "sectionDescription", "directions", "text", "type", "required", "scaleMin", "scaleMax", "scaleLabels", "options"],
  templates: ["name", "description", "weightPreset", "designations", "blocks"],
  cycles: ["name", "status", "startDate", "endDate", "teams", "templateMode", "generateAssignments"],
} as const;

// All multi-value cells use "|" — names (designations/teams) can contain commas
// (e.g. "EDA Engineer, DV", "Designer, UX"), so a comma separator would corrupt them.
const LIST_SEP = "|";

// ─── Cell helpers ───

function cellText(cell: ExcelJS.Cell | undefined): string {
  if (!cell) return "";
  let v = cell.value as unknown;
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as { richText?: { text: string }[]; text?: string; result?: unknown };
    if (o.richText) v = o.richText.map((t) => t.text).join("");
    else if (o.text !== undefined) v = o.text;
    else if (o.result !== undefined) v = o.result;
    else v = "";
  }
  return String(v).trim();
}

const parseBool = (s: string): boolean => /^(true|1|yes|y)$/i.test(s.trim());
const splitNames = (s: string): string[] => s.split(LIST_SEP).map((x) => x.trim()).filter(Boolean);
/** Split a positional list (scaleLabels/options), PRESERVING empty middle slots. Empty → []. */
const splitList = (s: string): string[] => (s.trim() === "" ? [] : s.split(LIST_SEP).map((x) => x.trim()));

function headerMap(ws: ExcelJS.Worksheet): Map<string, number> {
  const map = new Map<string, number>();
  ws.getRow(1).eachCell((cell, col) => {
    const name = cellText(cell);
    if (name) map.set(name, col);
  });
  return map;
}

function eachDataRow(ws: ExcelJS.Worksheet, headers: Map<string, number>, fn: (get: (c: string) => string) => void) {
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const get = (c: string): string => {
      const idx = headers.get(c);
      return idx ? cellText(row.getCell(idx)) : "";
    };
    if (![...headers.keys()].some((h) => get(h) !== "")) return; // skip blank rows
    fn(get);
  });
}

// ─── Sheet writer: content-aware widths, frozen+bold header, autofilter (Sheets-friendly) ───

function writeSheet(
  wb: ExcelJS.Workbook,
  name: string,
  headers: readonly string[],
  rows: (string | number)[][],
  hintRowCount = 0,
) {
  const ws = wb.addWorksheet(name);
  ws.addRow([...headers]);
  for (const r of rows) ws.addRow(r);

  // Per-column width fit to the longest cell (incl. header), clamped to a sane range.
  const MIN = 10, MAX = 60;
  headers.forEach((h, i) => {
    let longest = String(h).length;
    for (const r of rows) {
      const v = r[i];
      if (v !== undefined && v !== null) longest = Math.max(longest, String(v).length);
    }
    ws.getColumn(i + 1).width = Math.max(MIN, Math.min(MAX, longest + 2));
  });

  // Header: bold + light fill; freeze it; enable autofilter for sort/filter in Sheets/Excel.
  const header = ws.getRow(1);
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };

  // Style optional hint rows (the example template) as muted italic.
  for (let i = 0; i < hintRowCount; i++) {
    ws.getRow(2 + i).font = { italic: true, color: { argb: "FF999999" } };
  }
  return ws;
}

// ─── Shared question shapes ───

interface XQuestion { id: string; text: string; type: string; required: boolean; scaleMin?: number; scaleMax?: number; scaleLabels?: string[]; options?: string[] }
interface XSection { id: string; title: string; description?: string; directions: string[]; questions: XQuestion[] }

function buildQuestion(get: (c: string) => string, id: string): XQuestion {
  const type = (get("type") || "rating_scale") as string;
  const q: XQuestion = { id, text: get("text"), type, required: parseBool(get("required") || "true") };
  const min = get("scaleMin");
  const max = get("scaleMax");
  const labels = splitList(get("scaleLabels"));
  const options = splitList(get("options"));
  if (min !== "") q.scaleMin = Number(min);
  if (max !== "") q.scaleMax = Number(max);
  if (labels.length) q.scaleLabels = labels;
  if (options.length) q.options = options;
  return q;
}

// ─── Workbook → CompanyImport ───

export async function workbookToCompanyImport(buf: ArrayBuffer | Buffer): Promise<CompanyImport> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as ArrayBuffer);

  const sheet = (name: string) => wb.getWorksheet(name);
  const required = (name: string): ExcelJS.Worksheet => {
    const ws = sheet(name);
    if (!ws) throw new Error(`Workbook is missing required sheet "${name}"`);
    return ws;
  };

  // People → users (deduped by email) + teams[].members[]; designations derived from usage.
  const peopleWs = required(SHEETS.people);
  const peopleHeaders = headerMap(peopleWs);
  const usersByEmail = new Map<string, CompanyImport["users"][number]>();
  const teamMembers = new Map<string, CompanyImport["teams"][number]["members"]>();
  const teamOrder: string[] = [];
  const designationSet = new Set<string>();
  eachDataRow(peopleWs, peopleHeaders, (get) => {
    const email = get("email").trim().toLowerCase();
    if (!email) return;
    if (!usersByEmail.has(email)) {
      usersByEmail.set(email, {
        email,
        name: get("name"),
        role: (get("orgRole") || "MEMBER") as CompanyImport["users"][number]["role"],
      });
    }
    const team = get("team");
    if (team) {
      if (!teamMembers.has(team)) { teamMembers.set(team, []); teamOrder.push(team); }
      const designation = get("designation") || undefined;
      if (designation) designationSet.add(designation);
      teamMembers.get(team)!.push({
        email,
        role: (get("teamRole") || "MEMBER") as CompanyImport["teams"][number]["members"][number]["role"],
        designation,
      });
    }
  });
  const users = [...usersByEmail.values()];

  // Teams metadata (optional)
  const teamMeta = new Map<string, { description?: string }>();
  const teamsWs = sheet(SHEETS.teams);
  if (teamsWs) {
    const h = headerMap(teamsWs);
    eachDataRow(teamsWs, h, (get) => {
      const name = get("name");
      if (name) teamMeta.set(name, { description: get("description") || undefined });
    });
  }
  const teams: CompanyImport["teams"] = teamOrder.map((name) => ({
    name,
    description: teamMeta.get(name)?.description,
    members: teamMembers.get(name)!,
  }));

  // Blocks → reusable named sections.
  const blocks = new Map<string, XSection>();
  const blocksWs = sheet(SHEETS.blocks);
  if (blocksWs) {
    const h = headerMap(blocksWs);
    const counters = new Map<string, number>();
    eachDataRow(blocksWs, h, (get) => {
      const block = get("block");
      if (!block) return;
      if (!blocks.has(block)) {
        blocks.set(block, {
          id: block,
          title: get("sectionTitle"),
          description: get("sectionDescription") || undefined,
          directions: splitNames(get("directions")),
          questions: [],
        });
        counters.set(block, 0);
      }
      const n = counters.get(block)! + 1;
      counters.set(block, n);
      blocks.get(block)!.questions.push(buildQuestion(get, `${block}-q${n}`));
    });
  }

  // Templates → compose blocks (in listed order) into sections; resolve designations.
  const templates: CompanyImport["templates"] = [];
  const templatesWs = sheet(SHEETS.templates);
  if (templatesWs) {
    const h = headerMap(templatesWs);
    eachDataRow(templatesWs, h, (get) => {
      const name = get("name");
      if (!name) return;
      const designations = splitNames(get("designations"));
      designations.forEach((d) => designationSet.add(d));
      const blockNames = splitNames(get("blocks"));
      const sections = blockNames
        .map((bn, i) => {
          const b = blocks.get(bn);
          if (!b) throw new Error(`Template "${name}" references unknown block "${bn}"`);
          // Re-key section + questions to be unique within the template.
          const secId = `${name}-s${i + 1}`;
          return {
            id: secId,
            title: b.title,
            description: b.description,
            directions: b.directions,
            questions: b.questions.map((q, qi) => ({ ...q, id: `${secId}-q${qi + 1}` })),
          };
        });
      templates.push({
        name,
        description: get("description") || undefined,
        weightPreset: (get("weightPreset") || null) as CompanyImport["templates"][number]["weightPreset"],
        designations,
        sections: sections as unknown as CompanyImport["templates"][number]["sections"],
      });
    });
  }

  // Cycles (optional)
  let cycles: CompanyImport["cycles"];
  const cyclesWs = sheet(SHEETS.cycles);
  if (cyclesWs) {
    const h = headerMap(cyclesWs);
    const rows: NonNullable<CompanyImport["cycles"]> = [];
    eachDataRow(cyclesWs, h, (get) => {
      const name = get("name");
      if (!name) return;
      const teamsCell = get("teams").trim();
      const tmCell = get("templateMode").trim();
      rows.push({
        name,
        status: (get("status") || "DRAFT") as NonNullable<CompanyImport["cycles"]>[number]["status"],
        startDate: get("startDate"),
        endDate: get("endDate"),
        teams: teamsCell === "" || teamsCell.toUpperCase() === "ALL" ? "ALL" : splitNames(teamsCell),
        templateMode: tmCell === "" || tmCell.toLowerCase() === "matching" ? "matching" : splitNames(tmCell),
        generateAssignments: parseBool(get("generateAssignments")),
      });
    });
    if (rows.length) cycles = rows;
  }

  const draft = {
    formatVersion: 1 as const,
    // Single-instance app: the API overrides company with the caller's company. A name is
    // required by the schema, so use a neutral placeholder that the API ignores.
    company: { name: "Imported Company" },
    designations: [...designationSet].sort(),
    users,
    teams,
    templates,
    ...(cycles ? { cycles } : {}),
  };

  return companyImportSchema.parse(draft);
}

// ─── CompanyImport → Workbook (factoring identical sections into shared blocks) ───

export async function companyImportToWorkbook(data: CompanyImport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Perform360";

  const addSheet = (name: string, headers: readonly string[], rows: (string | number)[][]) =>
    writeSheet(wb, name, headers, rows);

  // People: one row per person-in-team; a person with no team still appears once (blank team).
  const userByEmail = new Map(data.users.map((u) => [u.email, u]));
  const peopleRows: (string | number)[][] = [];
  const placedEmails = new Set<string>();
  for (const t of data.teams) {
    for (const m of t.members) {
      const u = userByEmail.get(m.email);
      peopleRows.push([m.email, u?.name ?? "", u?.role ?? "MEMBER", t.name, m.role, m.designation ?? ""]);
      placedEmails.add(m.email);
    }
  }
  for (const u of data.users) {
    if (!placedEmails.has(u.email)) peopleRows.push([u.email, u.name, u.role, "", "", ""]);
  }
  addSheet(SHEETS.people, COLUMNS.people, peopleRows);

  // Teams (only those with a description worth recording; still list all for clarity)
  addSheet(SHEETS.teams, COLUMNS.teams, data.teams.map((t) => [t.name, t.description ?? ""]));

  // Factor identical sections across templates into shared, named blocks.
  // A block key = canonical JSON of {title, description, directions, questions(text/type/scale/options)}.
  type Section = { id: string; title: string; description?: string; directions?: string[]; questions: XQuestion[] };
  const blockKeyToName = new Map<string, string>();
  const blockNameToSection = new Map<string, Section>();
  const templateBlockNames = new Map<string, string[]>();

  const canonOfSection = (s: Section): string =>
    JSON.stringify({
      title: s.title,
      description: s.description ?? "",
      directions: [...(s.directions ?? [])],
      questions: s.questions.map((q) => ({
        text: q.text, type: q.type, required: q.required,
        scaleMin: q.scaleMin ?? null, scaleMax: q.scaleMax ?? null,
        scaleLabels: q.scaleLabels ?? [], options: q.options ?? [],
      })),
    });

  // Stable, readable block names: prefer the section title (slugged), de-duped.
  const slug = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "block";
  const usedNames = new Set<string>();
  const uniqueName = (base: string) => {
    let n = base, i = 2;
    while (usedNames.has(n)) n = `${base}-${i++}`;
    usedNames.add(n);
    return n;
  };

  for (const t of data.templates) {
    const names: string[] = [];
    for (const sRaw of t.sections) {
      const s = sRaw as Section;
      const key = canonOfSection(s);
      let blockName = blockKeyToName.get(key);
      if (!blockName) {
        // Disambiguate same-title-different-content sections by template prefix.
        const base = slug(s.title);
        blockName = uniqueName(base);
        blockKeyToName.set(key, blockName);
        blockNameToSection.set(blockName, s);
      }
      names.push(blockName);
    }
    templateBlockNames.set(t.name, names);
  }

  // Blocks sheet — each block's questions once.
  const blockRows: (string | number)[][] = [];
  for (const [blockName, s] of blockNameToSection) {
    for (const q of s.questions) {
      blockRows.push([
        blockName, s.title, s.description ?? "", (s.directions ?? []).join(LIST_SEP),
        q.text, q.type, q.required ? "TRUE" : "FALSE",
        q.scaleMin ?? "", q.scaleMax ?? "",
        (q.scaleLabels ?? []).join(LIST_SEP), (q.options ?? []).join(LIST_SEP),
      ]);
    }
  }
  addSheet(SHEETS.blocks, COLUMNS.blocks, blockRows);

  // Templates sheet — compose blocks.
  addSheet(SHEETS.templates, COLUMNS.templates, data.templates.map((t) => [
    t.name, t.description ?? "", t.weightPreset ?? "",
    t.designations.join(LIST_SEP), (templateBlockNames.get(t.name) ?? []).join(LIST_SEP),
  ]));

  if (data.cycles?.length) {
    addSheet(SHEETS.cycles, COLUMNS.cycles, data.cycles.map((c) => [
      c.name, c.status, c.startDate, c.endDate,
      c.teams === "ALL" ? "ALL" : c.teams.join(LIST_SEP),
      c.templateMode === "matching" ? "matching" : c.templateMode.join(LIST_SEP),
      c.generateAssignments ? "TRUE" : "FALSE",
    ]));
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

/**
 * A blank workbook with every sheet + headers and one hint row per sheet — a fill-in-the-blanks
 * starting point. The hint rows form a tiny but valid import.
 */
export async function emptyTemplateWorkbook(): Promise<Buffer> {
  const hints: Record<string, (string | number)[][]> = {
    [SHEETS.people]: [
      ["jane@acme.com", "Jane Doe", "ADMIN", "Core", "MANAGER", "Senior Engineer"],
      ["bob@acme.com", "Bob Lee", "MEMBER", "Core", "MEMBER", "Engineer"],
    ],
    [SHEETS.teams]: [["Core", "Core engineering team"]],
    [SHEETS.blocks]: [
      ["Values", "Value-Based", "Core values", "SELF|LATERAL|DOWNWARD", "Delivers quality work", "rating_scale", "TRUE", 1, 5, "Low||Mid||High", ""],
      ["Values", "Value-Based", "Core values", "SELF|LATERAL|DOWNWARD", "What went well?", "text", "FALSE", "", "", "", ""],
    ],
    [SHEETS.templates]: [["Eng Review", "360 for engineers", "equal", "Engineer|Senior Engineer", "Values"]],
    [SHEETS.cycles]: [["Annual Review", "ACTIVE", "2025-07-01", "2026-06-30", "ALL", "matching", "TRUE"]],
  };

  const wb = new ExcelJS.Workbook();
  wb.creator = "Perform360";
  for (const [key, cols] of Object.entries(COLUMNS)) {
    const name = SHEETS[key as keyof typeof SHEETS];
    const rows = hints[name] ?? [];
    writeSheet(wb, name, cols, rows, rows.length);
  }
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
