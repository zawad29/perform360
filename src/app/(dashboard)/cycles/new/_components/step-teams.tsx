"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { MultiCombobox } from "@/components/ui/multi-combobox";
import type { MultiComboboxOption } from "@/components/ui/multi-combobox";
import { Plus, X, AlertTriangle, CheckCircle2 } from "lucide-react";
import { computeCoverageGaps } from "@/lib/template-routing";
import type {
  AssignmentGroup,
  CoverageGapTeam,
  TeamOption,
  TemplateOption,
} from "./types";

interface StepTeamsProps {
  groups: AssignmentGroup[];
  onGroupsChange: (groups: AssignmentGroup[]) => void;
  teams: TeamOption[];
  templates: TemplateOption[];
  isSearchingTeams: boolean;
  isSearchingTemplates: boolean;
  onTeamSearch: (q: string) => void;
  onTemplateSearch: (q: string) => void;
  fetchError: string;
  readOnly?: boolean;
}

function computeExternalDirectionWarnings(
  group: AssignmentGroup,
  teams: TeamOption[],
  templates: TemplateOption[]
): string[] {
  if (group.teamIds.length === 0 || group.templateIds.length === 0) return [];

  const groupTemplates = templates.filter((t) => group.templateIds.includes(t.id));
  const coversExternal = groupTemplates.some((t) =>
    (t.sections ?? []).some((s) => {
      const dirs = (s.directions ?? []) as string[];
      return dirs.length === 0 || dirs.includes("EXTERNAL");
    })
  );
  if (coversExternal) return [];

  const teamsWithExternals: string[] = [];
  for (const teamId of group.teamIds) {
    const team = teams.find((t) => t.id === teamId);
    if (!team) continue;
    if (team.members.some((m) => m.role === "EXTERNAL")) {
      teamsWithExternals.push(team.name);
    }
  }
  return teamsWithExternals;
}

function computeGroupGaps(
  group: AssignmentGroup,
  teams: TeamOption[],
  templates: TemplateOption[]
): CoverageGapTeam[] {
  if (group.teamIds.length === 0 || group.templateIds.length === 0) return [];

  // Delegate to the shared engine so coverage mirrors the server exactly: a
  // subject is covered only when a template matches BOTH role and designation.
  const groupTemplates = templates.filter((t) => group.templateIds.includes(t.id));
  const inputs = group.teamIds
    .map((teamId) => teams.find((t) => t.id === teamId))
    .filter((team): team is TeamOption => Boolean(team))
    .map((team) => ({
      teamId: team.id,
      teamName: team.name,
      members: team.members.map((m) => ({
        userId: m.userId,
        name: m.user.name,
        role: m.role,
        designationId: m.designationId,
        designationName: m.designation?.name ?? null,
      })),
      templates: groupTemplates.map((t) => ({
        id: t.id,
        designationIds: t.designationIds,
        appliesToRole: t.appliesToRole,
      })),
    }));

  return computeCoverageGaps(inputs);
}

export function StepTeams({
  groups,
  onGroupsChange,
  teams,
  templates,
  isSearchingTeams,
  isSearchingTemplates,
  onTeamSearch,
  onTemplateSearch,
  fetchError,
  readOnly = false,
}: StepTeamsProps) {
  // All team IDs already used across all groups
  const usedTeamIds = useMemo(() => {
    const ids = new Set<string>();
    for (const g of groups) {
      for (const id of g.teamIds) ids.add(id);
    }
    return ids;
  }, [groups]);

  const templateOptions: MultiComboboxOption[] = useMemo(
    () =>
      templates.map((t) => ({
        value: t.id,
        label: t.name,
        sublabel: t.isGlobal
          ? t.designationIds.length === 0
            ? "Global · all designations"
            : `Global · ${t.designationIds.length} ${t.designationIds.length === 1 ? "designation" : "designations"}`
          : t.designationIds.length === 0
            ? "All designations"
            : `${t.designationIds.length} ${t.designationIds.length === 1 ? "designation" : "designations"}`,
      })),
    [templates]
  );

  function getTeamOptions(groupIndex: number): MultiComboboxOption[] {
    const currentGroupTeams = new Set(groups[groupIndex].teamIds);
    return teams.map((t) => ({
      value: t.id,
      label: t.name,
      disabled: usedTeamIds.has(t.id) && !currentGroupTeams.has(t.id),
      disabledReason: "Already in another group",
    }));
  }

  function updateGroup(index: number, patch: Partial<AssignmentGroup>) {
    onGroupsChange(
      groups.map((g, i) => (i === index ? { ...g, ...patch } : g))
    );
  }

  function addGroup() {
    onGroupsChange([...groups, { teamIds: [], templateIds: [] }]);
  }

  function removeGroup(index: number) {
    onGroupsChange(groups.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-1 text-[15px] font-semibold text-gray-900">
          Team &amp; Template Assignments
        </h3>
        <p className="text-[13px] text-gray-500">
          Assign teams to the templates they should use. The matching template is chosen automatically for each subject.
        </p>
      </div>

      {fetchError && (
        <p className="text-[13px] text-gray-900">{fetchError}</p>
      )}

      <div className="space-y-4">
        {groups.map((group, index) => {
          const gaps = computeGroupGaps(group, teams, templates);
          const externalWarningTeams = computeExternalDirectionWarnings(group, teams, templates);
          const groupReady =
            group.teamIds.length > 0 && group.templateIds.length > 0;
          return (
            <div
              key={index}
              className="space-y-4 border border-gray-200 bg-white p-4 sm:p-5"
            >
              <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-4">
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-gray-900">
                    Group {index + 1}
                  </p>
                  <p className="mt-1 text-[12px] text-gray-500">
                    {group.teamIds.length} {group.teamIds.length === 1 ? "team" : "teams"} selected
                    {" · "}
                    {group.templateIds.length} {group.templateIds.length === 1 ? "template" : "templates"} selected
                  </p>
                </div>
                {groups.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeGroup(index)}
                    className="h-7 w-7 shrink-0 p-0"
                    disabled={readOnly}
                    aria-label={`Remove group ${index + 1}`}
                  >
                    <X size={14} strokeWidth={1.5} />
                  </Button>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <MultiCombobox
                    label="Teams"
                    placeholder="Select teams..."
                    emptyMessage="No teams found"
                    value={group.teamIds}
                    onChange={(ids) => updateGroup(index, { teamIds: ids })}
                    onSearchChange={onTeamSearch}
                    loading={isSearchingTeams}
                    options={getTeamOptions(index)}
                    disabled={readOnly}
                  />
                </div>
                <div>
                  <MultiCombobox
                    label="Templates"
                    placeholder="Select one or more templates..."
                    emptyMessage="No templates found"
                    value={group.templateIds}
                    onChange={(ids) => updateGroup(index, { templateIds: ids })}
                    onSearchChange={onTemplateSearch}
                    loading={isSearchingTemplates}
                    options={templateOptions}
                    disabled={readOnly}
                  />
                </div>
              </div>

              {!groupReady && (
                <div className="border border-gray-200 bg-gray-50 px-3 py-2">
                  <p className="text-[12px] text-gray-600">
                    Select at least one team and one template to continue.
                  </p>
                </div>
              )}

              {groupReady && gaps.length === 0 && (
                <div className="flex items-start gap-2 border border-gray-200 bg-gray-50 px-3 py-2">
                  <CheckCircle2
                    size={14}
                    strokeWidth={1.5}
                    className="text-gray-900 mt-0.5 shrink-0"
                  />
                  <p className="text-[12px] text-gray-700">
                    All cycle subjects are covered by a matching template.
                  </p>
                </div>
              )}

              {groupReady && gaps.length === 0 && externalWarningTeams.length > 0 && (
                <div className="border border-gray-200 bg-gray-50 p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle
                      size={14}
                      strokeWidth={1.5}
                      className="text-gray-900 mt-0.5 shrink-0"
                    />
                    <div>
                      <p className="text-[12px] font-semibold text-gray-900">
                        External reviewers will be skipped
                      </p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {externalWarningTeams.join(", ")}{" "}
                        {externalWarningTeams.length === 1 ? "has" : "have"} external reviewers, but none of the selected templates include the External direction.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {gaps.length > 0 && (
                <div className="border border-gray-900 bg-white p-3">
                  <div className="flex items-start gap-2 mb-2">
                    <AlertTriangle
                      size={14}
                      strokeWidth={1.5}
                      className="text-gray-900 mt-0.5 shrink-0"
                    />
                    <div>
                      <p className="text-[12px] font-semibold text-gray-900">
                        Coverage gap
                      </p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        These members have no matching template and won&apos;t be reviewed in this cycle. You can still continue and add a covering template later while the cycle is a draft.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2 pl-5">
                    {gaps.map((gap) => (
                      <div key={gap.teamId}>
                        <p className="text-[12px] font-medium text-gray-700">
                          {gap.teamName}
                        </p>
                        <ul className="mt-0.5 space-y-0.5">
                          {gap.members.map((m) => (
                            <li
                              key={m.userId}
                              className="text-[12px] text-gray-600"
                            >
                              • {m.name}{" "}
                              <span className="text-gray-400">
                                ({m.designationName ?? "no designation"})
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!readOnly && (
        <Button type="button" variant="secondary" size="sm" onClick={addGroup}>
          <Plus size={14} strokeWidth={1.5} className="mr-1.5" />
          Add Group
        </Button>
      )}
    </div>
  );
}
