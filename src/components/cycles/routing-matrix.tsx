"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { isCycleSubjectRole } from "@/lib/cycle-subjects";
import { resolveTemplateForSubject, type TemplateMeta } from "@/lib/template-routing";
import type { DirectionWeights } from "@/lib/directions";
import { RoutingPreviewModal } from "./routing-preview-modal";

interface MatrixMember {
  userId: string;
  name: string;
  levelId: string | null;
  levelName: string | null;
  role: "MANAGER" | "MEMBER" | "EXTERNAL" | "IMPERSONATOR";
}

// The matrix needs the template's display name + weights too, on top of the
// pure TemplateMeta routing data.
export interface MatrixTemplate extends TemplateMeta {
  name: string;
  description?: string | null;
  weightsMember: DirectionWeights | null;
  weightsManager: DirectionWeights | null;
}

interface RoutingMatrixProps {
  teamName: string;
  members: MatrixMember[];
  templates: MatrixTemplate[];
}

const COLUMN_ORDER: Array<Extract<MatrixMember["role"], "MANAGER" | "MEMBER">> = [
  "MANAGER",
  "MEMBER",
];
const COLUMN_LABEL: Record<MatrixMember["role"], string> = {
  MANAGER: "Manager",
  MEMBER: "Member",
  EXTERNAL: "External",
  IMPERSONATOR: "Impersonator",
};

interface CellKey {
  levelId: string | null;
  role: MatrixMember["role"];
}

export function RoutingMatrix({ teamName, members, templates }: RoutingMatrixProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [previewSubject, setPreviewSubject] = useState<{
    member: MatrixMember;
    template: MatrixTemplate;
  } | null>(null);

  // Only managers and members are cycle subjects. Externals and impersonators
  // are reviewers only, so they should not participate in subject routing.
  const evaluable = useMemo(
    () => members.filter((m) => isCycleSubjectRole(m.role)),
    [members]
  );

  // Row set: the union of distinct levels that appear on the team. Add a
  // synthetic "no level" row when at least one member has levelId === null.
  const rows = useMemo(() => {
    const seen = new Map<string | null, string | null>();
    let hasNullLevel = false;
    for (const m of evaluable) {
      if (m.levelId === null) {
        hasNullLevel = true;
      } else if (!seen.has(m.levelId)) {
        seen.set(m.levelId, m.levelName);
      }
    }
    const result = Array.from(seen.entries()).map(([levelId, levelName]) => ({
      levelId,
      levelName: levelName ?? "Unnamed level",
    }));
    // Sort by level name for stable display.
    result.sort((a, b) => (a.levelName ?? "").localeCompare(b.levelName ?? ""));
    if (hasNullLevel) {
      result.push({ levelId: null, levelName: "(no level)" });
    }
    return result;
  }, [evaluable]);

  // Only show columns that have at least one member somewhere on the team.
  const cols = useMemo(
    () => COLUMN_ORDER.filter((role) => evaluable.some((m) => m.role === role)),
    [evaluable]
  );

  function membersIn(levelId: string | null, role: MatrixMember["role"]): MatrixMember[] {
    return evaluable.filter((m) => m.levelId === levelId && m.role === role);
  }

  function cellKey(c: CellKey): string {
    return `${c.levelId ?? "null"}::${c.role}`;
  }

  function toggleExpand(c: CellKey) {
    setExpanded((prev) => {
      const next = new Set(prev);
      const k = cellKey(c);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  if (templates.length === 0) {
    return (
      <div className="border border-gray-200 bg-gray-50 px-4 py-3 text-[12px] text-gray-500">
        Pick at least one template to see how routing resolves for {teamName}.
      </div>
    );
  }

  if (rows.length === 0 || cols.length === 0) {
    return (
      <div className="border border-gray-200 bg-gray-50 px-4 py-3 text-[12px] text-gray-500">
        {teamName} has no evaluable members yet.
      </div>
    );
  }

  return (
    <div className="border border-gray-200 bg-white">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
        <p className="text-[12px] font-medium uppercase tracking-caps text-gray-700">
          Routing for {teamName}
        </p>
        <p className="text-[11px] text-gray-400">
          Template picked by subject&apos;s level · weights by team role
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-gray-50/60 border-b border-gray-100">
              <th className="text-left px-3 py-2 font-medium text-gray-500 uppercase tracking-caps">
                Level
              </th>
              {cols.map((role) => (
                <th
                  key={role}
                  className="text-left px-3 py-2 font-medium text-gray-500 uppercase tracking-caps"
                >
                  {COLUMN_LABEL[role]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.levelId ?? "null"} className="border-b border-gray-50 last:border-0 align-top">
                <td className="px-3 py-2 text-gray-900 font-medium whitespace-nowrap">
                  {row.levelName}
                </td>
                {cols.map((role) => {
                  const cellMembers = membersIn(row.levelId, role);
                  if (cellMembers.length === 0) {
                    return (
                      <td key={role} className="px-3 py-2 text-gray-300">
                        —
                      </td>
                    );
                  }
                  const resolved = resolveTemplateForSubject(templates, row.levelId);
                  if (!resolved) {
                    return (
                      <td key={role} className="px-3 py-2">
                        <span className="inline-flex items-center gap-1 border border-gray-900 bg-white px-2 py-1 text-[11px] text-gray-900">
                          <AlertTriangle size={11} strokeWidth={1.5} />
                          Coverage gap
                        </span>
                      </td>
                    );
                  }
                  const matched = templates.find((t) => t.id === resolved.template.id)!;
                  const tieNames = resolved.tiedWith
                    .map((t) => templates.find((x) => x.id === t.id)?.name)
                    .filter(Boolean) as string[];
                  const k = cellKey({ levelId: row.levelId, role });
                  const isExpanded = expanded.has(k);
                  return (
                    <td key={role} className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => toggleExpand({ levelId: row.levelId, role })}
                        className="inline-flex items-center gap-1.5 hover:bg-gray-50 -ml-1 px-1 py-0.5"
                      >
                        {isExpanded ? (
                          <ChevronDown size={12} strokeWidth={1.5} className="text-gray-400" />
                        ) : (
                          <ChevronRight size={12} strokeWidth={1.5} className="text-gray-400" />
                        )}
                        <Badge variant="outline" className="text-[11px]">
                          {matched.name}
                        </Badge>
                        <span className="text-gray-400">
                          {cellMembers.length}
                        </span>
                      </button>
                      {tieNames.length > 0 && (
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          * tied with {tieNames.join(", ")}
                        </p>
                      )}
                      {isExpanded && (
                        <div className="mt-2 space-y-1">
                          {cellMembers.map((m) => (
                            <button
                              key={m.userId}
                              type="button"
                              onClick={() => setPreviewSubject({ member: m, template: matched })}
                              className="flex items-center gap-2 w-full text-left hover:bg-gray-50 px-1 py-0.5"
                            >
                              <Avatar name={m.name} size="sm" />
                              <span className="text-[12px] text-gray-700 truncate">{m.name}</span>
                              <span className="ml-auto text-[10px] text-gray-400">Preview →</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {previewSubject && (
        <RoutingPreviewModal
          open
          onClose={() => setPreviewSubject(null)}
          template={previewSubject.template}
          subjectName={previewSubject.member.name}
          subjectLabel={`${COLUMN_LABEL[previewSubject.member.role] ?? previewSubject.member.role} · ${previewSubject.member.levelName ?? "no level"}`}
          subjectRole={previewSubject.member.role === "MANAGER" ? "MANAGER" : "MEMBER"}
          weightsMember={previewSubject.template.weightsMember}
          weightsManager={previewSubject.template.weightsManager}
        />
      )}
    </div>
  );
}
