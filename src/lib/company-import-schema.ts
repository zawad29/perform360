/**
 * Universal company-import format.
 *
 * One self-contained JSON describes an entire company's org + templates (+ optional cycles):
 * designations, users, teams (with members & manager role), evaluation templates (referencing
 * designations by name), and optionally review cycles. It is portable across companies — no IDs,
 * everything is keyed by natural identity (email / name).
 *
 * This module is the single source of truth shared by:
 *   - the in-app import API (`src/app/api/import/company/route.ts`)
 *   - the Excel bridge (`src/lib/company-import-xlsx.ts`)
 *
 * Importing org + templates requires NO encryption passphrase (only evaluation *responses* use
 * the data key). Cycles created here generate assignments but never responses.
 */

import { z } from "zod";
import { Prisma } from "@prisma/client";
import type { PrismaClient, TeamMemberRole, UserRole } from "@prisma/client";
import { sectionSchema } from "./template-schema";
import { WEIGHT_PRESETS } from "./directions";
import { resolveTemplateForSubject, type TemplateMeta, type SubjectRole } from "./template-routing";

// ─── Zod schema for the universal format ───

const roleEnum = z.enum(["ADMIN", "HR", "MEMBER", "EXTERNAL"]);
const teamRoleEnum = z.enum(["MANAGER", "MEMBER", "EXTERNAL"]);
const weightPresetEnum = z.enum(["equal", "supervisor_focus", "peer_focus", "custom", "default"]);

export const importUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: roleEnum.default("MEMBER"),
});

export const importTeamMemberSchema = z.object({
  email: z.string().email(),
  role: teamRoleEnum.default("MEMBER"),
  designation: z.string().nullable().optional(),
});

export const importTeamSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  members: z.array(importTeamMemberSchema).min(1),
});

export const importTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  weightPreset: weightPresetEnum.nullable().optional(),
  designations: z.array(z.string()).default([]),
  // Which team-role the template serves. Defaults to ANY (role-agnostic) so
  // legacy imports without the column behave exactly as before.
  appliesToRole: z.enum(["MANAGER", "MEMBER", "ANY"]).default("ANY"),
  sections: z.array(sectionSchema).min(1),
});

export const importCycleSchema = z.object({
  name: z.string().min(1),
  status: z.enum(["DRAFT", "ACTIVE", "CLOSED", "ARCHIVED"]).default("DRAFT"),
  startDate: z.string(),
  endDate: z.string(),
  teams: z.union([z.literal("ALL"), z.array(z.string())]).default("ALL"),
  templateMode: z.union([z.literal("matching"), z.array(z.string())]).default("matching"),
  generateAssignments: z.boolean().default(false),
});

export const companyImportSchema = z.object({
  formatVersion: z.literal(1).default(1),
  company: z.object({ name: z.string().min(1), slug: z.string().optional() }),
  designations: z.array(z.string()).default([]),
  users: z.array(importUserSchema).min(1),
  teams: z.array(importTeamSchema).default([]),
  templates: z.array(importTemplateSchema).default([]),
  cycles: z.array(importCycleSchema).optional(),
});

export type CompanyImport = z.infer<typeof companyImportSchema>;
export type ImportTeam = z.infer<typeof importTeamSchema>;
export type ImportTemplate = z.infer<typeof importTemplateSchema>;

// ─── Weights from a preset (used by apply) ───

type JsonOrNull = Prisma.InputJsonValue | typeof Prisma.JsonNull;
export function weightsForPreset(preset: string | null | undefined): {
  weightsMember: JsonOrNull;
  weightsManager: JsonOrNull;
} {
  const def = preset ? (WEIGHT_PRESETS as Record<string, { member: unknown; manager: unknown }>)[preset] : null;
  if (!def) return { weightsMember: Prisma.JsonNull, weightsManager: Prisma.JsonNull };
  return {
    weightsMember: def.member as unknown as Prisma.InputJsonValue,
    weightsManager: def.manager as unknown as Prisma.InputJsonValue,
  };
}

// ─── Apply a CompanyImport into the DB (shared by seed + API; upsert by natural key) ───

export interface ApplyImportResult {
  designationsCreated: number;
  designationsExisted: number;
  usersCreated: number;
  usersExisted: number;
  usersUpdated: number;
  teamsCreated: number;
  teamsExisted: number;
  membershipsCreated: number;
  membershipsExisted: number;
  templatesCreated: number;
  templatesUpdated: number;
  cyclesCreated: number;
  assignmentsCreated: number;
  warnings: string[];
}

// A minimal transactional client surface (works with prisma.$transaction(tx => ...) and the
// PrismaClient itself). Typed loosely to avoid coupling to a specific tx generic.
type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

function emptyResult(): ApplyImportResult {
  return {
    designationsCreated: 0, designationsExisted: 0,
    usersCreated: 0, usersExisted: 0, usersUpdated: 0,
    teamsCreated: 0, teamsExisted: 0,
    membershipsCreated: 0, membershipsExisted: 0,
    templatesCreated: 0, templatesUpdated: 0,
    cyclesCreated: 0, assignmentsCreated: 0,
    warnings: [],
  };
}

/**
 * Create/update all entities described by `data` inside the given company. Upsert by natural
 * key (email / name) so it is safe to re-run. Pass `createdBy` (a user id or email) for
 * template authorship. Generates assignments for cycles but never evaluation responses.
 */
export async function applyCompanyImport(
  tx: Tx,
  companyId: string,
  data: CompanyImport,
  createdBy: string,
): Promise<ApplyImportResult> {
  const res = emptyResult();

  // 1. Designations — find-or-create by (companyId, name).
  const designationId = new Map<string, string>();
  for (const name of data.designations) {
    const existing = await tx.designation.findUnique({
      where: { companyId_name: { companyId, name } },
    });
    if (existing) {
      designationId.set(name, existing.id);
      res.designationsExisted++;
    } else {
      const created = await tx.designation.create({ data: { name, companyId } });
      designationId.set(name, created.id);
      res.designationsCreated++;
    }
  }

  // 2. Users — upsert by (email, companyId). ADMIN/HR also get an AuthUser (login capability).
  const userId = new Map<string, string>(); // email(lower) → userId
  for (const u of data.users) {
    const email = u.email.trim().toLowerCase();
    const needsAuth = u.role === "ADMIN" || u.role === "HR";
    const existing = await tx.user.findUnique({
      where: { email_companyId: { email, companyId } },
    });
    if (existing) {
      userId.set(email, existing.id);
      res.usersExisted++;
      if (existing.name !== u.name || existing.role !== u.role) {
        await tx.user.update({ where: { id: existing.id }, data: { name: u.name, role: u.role as UserRole } });
        res.usersUpdated++;
      }
      if (needsAuth && !existing.authUserId) {
        const authUser = await tx.authUser.upsert({ where: { email }, create: { email, name: u.name }, update: {} });
        await tx.user.update({ where: { id: existing.id }, data: { authUserId: authUser.id } });
      }
    } else {
      let authUserId: string | undefined;
      if (needsAuth) {
        const authUser = await tx.authUser.upsert({ where: { email }, create: { email, name: u.name }, update: {} });
        authUserId = authUser.id;
      }
      const created = await tx.user.create({
        data: { email, name: u.name, role: u.role as UserRole, companyId, ...(authUserId ? { authUserId } : {}) },
      });
      userId.set(email, created.id);
      res.usersCreated++;
    }
  }

  // 3. Teams — find-or-create by (name, companyId); then upsert each membership.
  const teamId = new Map<string, string>();
  for (const t of data.teams) {
    let id: string;
    const existing = await tx.team.findFirst({ where: { name: t.name, companyId } });
    if (existing) {
      id = existing.id;
      res.teamsExisted++;
    } else {
      const created = await tx.team.create({
        data: { name: t.name, description: t.description ?? null, companyId },
      });
      id = created.id;
      res.teamsCreated++;
    }
    teamId.set(t.name, id);

    for (const m of t.members) {
      const uid = userId.get(m.email.trim().toLowerCase());
      if (!uid) {
        res.warnings.push(`Team "${t.name}": member email ${m.email} not found among users — skipped`);
        continue;
      }
      const did = m.designation ? designationId.get(m.designation) ?? null : null;
      const existingMember = await tx.teamMember.findUnique({
        where: { userId_teamId: { userId: uid, teamId: id } },
      });
      if (existingMember) {
        const updates: Record<string, unknown> = {};
        if (existingMember.role !== m.role) updates.role = m.role as TeamMemberRole;
        if (did && existingMember.designationId !== did) updates.designationId = did;
        if (Object.keys(updates).length) await tx.teamMember.update({ where: { id: existingMember.id }, data: updates });
        res.membershipsExisted++;
      } else {
        await tx.teamMember.create({ data: { userId: uid, teamId: id, role: m.role as TeamMemberRole, designationId: did } });
        res.membershipsCreated++;
      }
    }
  }

  // 4. Templates — find-or-create by (name, companyId); version-snapshot on update.
  const templateId = new Map<string, string>();
  for (const tpl of data.templates) {
    const resolvedDesignationIds = tpl.designations
      .map((n) => designationId.get(n))
      .filter((x): x is string => !!x);
    const { weightsMember, weightsManager } = weightsForPreset(tpl.weightPreset);
    const sectionsJson = tpl.sections as unknown as Prisma.InputJsonValue;

    const existing = await tx.evaluationTemplate.findFirst({ where: { name: tpl.name, companyId } });
    if (existing) {
      // Only bump the version + snapshot when content actually changed — keeps re-import
      // idempotent. Compare with key-order-independent canonical JSON (stored vs in-memory
      // objects can serialize keys in different orders for identical content).
      const changed =
        canonicalJson(existing.sections) !== canonicalJson(tpl.sections) ||
        JSON.stringify([...existing.designationIds].sort()) !== JSON.stringify([...resolvedDesignationIds].sort()) ||
        (existing.description ?? null) !== (tpl.description ?? null) ||
        existing.appliesToRole !== tpl.appliesToRole ||
        (existing.weightPreset ?? null) !== (tpl.weightPreset ?? null);
      if (changed) {
        const nextVersion = existing.version + 1;
        const updated = await tx.evaluationTemplate.update({
          where: { id: existing.id },
          data: {
            description: tpl.description ?? null,
            designationIds: resolvedDesignationIds,
            appliesToRole: tpl.appliesToRole,
            weightPreset: tpl.weightPreset ?? null,
            weightsMember, weightsManager,
            sections: sectionsJson,
            version: nextVersion,
          },
        });
        await tx.evaluationTemplateVersion.create({
          data: {
            templateId: updated.id, version: nextVersion, name: updated.name, description: updated.description,
            designationIds: resolvedDesignationIds, appliesToRole: updated.appliesToRole, weightPreset: updated.weightPreset,
            weightsMember, weightsManager, sections: sectionsJson, createdBy,
          },
        });
        res.templatesUpdated++;
      }
      templateId.set(tpl.name, existing.id);
    } else {
      const created = await tx.evaluationTemplate.create({
        data: {
          name: tpl.name, description: tpl.description ?? null, isGlobal: false, companyId, createdBy,
          designationIds: resolvedDesignationIds, appliesToRole: tpl.appliesToRole, weightPreset: tpl.weightPreset ?? null,
          weightsMember, weightsManager, sections: sectionsJson,
        },
      });
      await tx.evaluationTemplateVersion.create({
        data: {
          templateId: created.id, version: 1, name: created.name, description: created.description,
          designationIds: resolvedDesignationIds, appliesToRole: created.appliesToRole, weightPreset: created.weightPreset,
          weightsMember, weightsManager, sections: sectionsJson, createdBy,
        },
      });
      templateId.set(tpl.name, created.id);
      res.templatesCreated++;
    }
  }

  // 5. Cycles (optional) — create cycle + cycle-teams + (optionally) assignments. No responses.
  if (data.cycles && data.cycles.length) {
    // Build routing metadata (one TemplateMeta per template) so cycle assignment uses the
    // exact same role+designation routing as the live engine (resolveTemplateForSubject).
    const templateMetas: TemplateMeta[] = [];
    for (const tpl of data.templates) {
      const id = templateId.get(tpl.name);
      if (!id) continue;
      templateMetas.push({
        id,
        appliesToRole: tpl.appliesToRole,
        designationIds: tpl.designations
          .map((dn) => designationId.get(dn))
          .filter((x): x is string => !!x),
        sections: [],
      });
    }
    // Resolve the owning template id for a (role, designationName) subject.
    const templateIdFor = (designationName: string | null | undefined, role: SubjectRole): string | null => {
      const did = designationName ? designationId.get(designationName) ?? null : null;
      return resolveTemplateForSubject(templateMetas, did, role)?.template.id ?? null;
    };

    for (const c of data.cycles) {
      // Upsert cycle by (name, companyId) so re-import does not create duplicate cycles.
      const existingCycle = await tx.evaluationCycle.findFirst({ where: { name: c.name, companyId } });
      if (existingCycle) {
        // Cycle already imported — leave its teams/assignments intact (idempotent).
        continue;
      }
      const cycle = await tx.evaluationCycle.create({
        data: {
          name: c.name, companyId, status: c.status,
          startDate: new Date(c.startDate), endDate: new Date(c.endDate),
        },
      });
      res.cyclesCreated++;

      // A person can belong to several teams in one cycle (e.g. a squad lead also sits on the
      // Unit-leadership team), which would generate the same assignment twice. Dedupe per cycle.
      const seenAssignments = new Set<string>();

      const targetTeamNames = c.teams === "ALL" ? data.teams.map((t) => t.name) : c.teams;
      for (const teamName of targetTeamNames) {
        const tid = teamId.get(teamName);
        const team = data.teams.find((t) => t.name === teamName);
        if (!tid || !team) continue;

        // Resolve templates for this team.
        let tplIds: string[];
        if (c.templateMode === "matching") {
          const set = new Set<string>();
          for (const m of team.members) {
            // Only cycle subjects (MANAGER/MEMBER) drive template matching.
            if (m.role !== "MANAGER" && m.role !== "MEMBER") continue;
            const matched = templateIdFor(m.designation, m.role);
            if (matched) set.add(matched);
          }
          tplIds = [...set];
        } else {
          tplIds = c.templateMode.map((n) => templateId.get(n)).filter((x): x is string => !!x);
        }
        if (tplIds.length === 0) continue;

        await tx.cycleTeam.create({
          data: { cycleId: cycle.id, teamId: tid, templates: { create: tplIds.map((templateId) => ({ templateId })) } },
        });

        if (c.generateAssignments && c.status !== "DRAFT") {
          const mgrEmails = team.members.filter((m) => m.role === "MANAGER").map((m) => m.email.trim().toLowerCase());
          const memberEmails = team.members.filter((m) => m.role !== "MANAGER").map((m) => m.email.trim().toLowerCase());
          const templateForEmail = (email: string): string | null => {
            const mem = team.members.find((m) => m.email.trim().toLowerCase() === email);
            const role: SubjectRole = mem?.role === "MANAGER" ? "MANAGER" : "MEMBER";
            return templateIdFor(mem?.designation, role) || tplIds[0] || null;
          };
          const addAssignment = async (reviewer: string, subject: string, direction: string) => {
            const rId = userId.get(reviewer);
            const sId = userId.get(subject);
            const tplId = templateForEmail(subject);
            if (!rId || !sId || !tplId) return;
            const dedupeKey = `${sId}|${rId}|${tplId}|${direction}`;
            if (seenAssignments.has(dedupeKey)) return; // same pair already created in this cycle
            seenAssignments.add(dedupeKey);
            await tx.evaluationAssignment.create({
              data: {
                cycleId: cycle.id, templateId: tplId, subjectId: sId, reviewerId: rId,
                direction: direction as never, status: "PENDING",
                token: cryptoToken(),
              },
            });
            res.assignmentsCreated++;
          };
          // SELF
          for (const e of [...mgrEmails, ...memberEmails]) await addAssignment(e, e, "SELF");
          // DOWNWARD (manager → member) and UPWARD (member → manager)
          for (const mg of mgrEmails) for (const me of memberEmails) {
            await addAssignment(mg, me, "DOWNWARD");
            await addAssignment(me, mg, "UPWARD");
          }
          // LATERAL among first few members (cap to avoid blowup)
          const peers = memberEmails.slice(0, 6);
          for (const a of peers) for (const b of peers) if (a !== b) await addAssignment(a, b, "LATERAL");
        }
      }
    }
  }

  return res;
}

// Key-order-independent JSON serialization, for comparing stored vs in-memory template content.
function canonicalJson(value: unknown): string {
  const seen = new WeakSet();
  const norm = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v as object)) return null;
    seen.add(v as object);
    if (Array.isArray(v)) return v.map(norm);
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      const val = (v as Record<string, unknown>)[k];
      if (val !== undefined) out[k] = norm(val);
    }
    return out;
  };
  return JSON.stringify(norm(value));
}

// Lightweight token generator (avoids importing node:crypto into client bundles via this lib's
// other consumers; only the API/seed path that creates assignments reaches this).
function cryptoToken(): string {
  // 32 random bytes hex. Uses Web Crypto if present, else node:crypto.
  const g = (globalThis as { crypto?: Crypto }).crypto;
  if (g?.getRandomValues) {
    const a = new Uint8Array(32);
    g.getRandomValues(a);
    return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return require("crypto").randomBytes(32).toString("hex");
}
