"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { MultiCombobox } from "@/components/ui/multi-combobox";
import type { MultiComboboxOption } from "@/components/ui/multi-combobox";
import { Plus, X, AlertTriangle, CheckCircle2 } from "lucide-react";
import { RoutingMatrix, type MatrixTemplate } from "@/components/cycles/routing-matrix";
import { isCycleSubjectRole } from "@/lib/cycle-subjects";
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

  const groupTemplates = templates.filter((t) => group.templateIds.includes(t.id));
  const hasWildcard = groupTemplates.some((t) => t.levelIds.length === 0);
  if (hasWildcard) return [];

  const coveredLevelIds = new Set(groupTemplates.flatMap((t) => t.levelIds));

  const gaps: CoverageGapTeam[] = [];
  for (const teamId of group.teamIds) {
    const team = teams.find((t) => t.id === teamId);
    if (!team) continue;

    const uncovered = team.members
      .filter((m) => isCycleSubjectRole(m.role))
      .filter((m) => m.levelId === null || !coveredLevelIds.has(m.levelId))
      .map((m) => ({
        userId: m.userId,
        name: m.user.name,
        levelName: m.level?.name ?? null,
      }));

    if (uncovered.length > 0) {
      gaps.push({ teamId: team.id, teamName: team.name, members: uncovered });
    }
  }
  return gaps;
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
          ? t.levelIds.length === 0
            ? "Global · all levels"
            : `Global · ${t.levelIds.length} ${t.levelIds.length === 1 ? "level" : "levels"}`
          : t.levelIds.length === 0
            ? "All levels"
            : `${t.levelIds.length} ${t.levelIds.length === 1 ? "level" : "levels"}`,
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
    <div className="space-y-6">
      <div>
        <h3 className="text-[15px] font-semibold text-gray-900 mb-1">
          Team &amp; Template Assignments
        </h3>
        <p className="text-[13px] text-gray-500">
          Group teams that share evaluation templates. Each group can have
          multiple templates — the system picks the right one per subject by
          their level.
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
          const groupTemplates: MatrixTemplate[] = templates
            .filter((t) => group.templateIds.includes(t.id))
            .map((t) => ({
              id: t.id,
              name: t.name,
              description: t.description ?? null,
              levelIds: t.levelIds,
              sections: t.sections,
              weightsMember: t.weightsMember,
              weightsManager: t.weightsManager,
            }));
          const groupTeams = teams.filter((t) => group.teamIds.includes(t.id));
          return (
            <div
              key={index}
              className="border border-gray-900 bg-gray-50/40 p-4 space-y-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-gray-600">
                  Group {index + 1}
                </span>
                {groups.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeGroup(index)}
                    className="h-7 w-7 p-0"
                  >
                    <X size={14} strokeWidth={1.5} />
                  </Button>
                )}
              </div>

              <MultiCombobox
                label="Teams"
                placeholder="Select teams..."
                emptyMessage="No teams found"
                value={group.teamIds}
                onChange={(ids) => updateGroup(index, { teamIds: ids })}
                onSearchChange={onTeamSearch}
                loading={isSearchingTeams}
                options={getTeamOptions(index)}
              />

              <MultiCombobox
                label="Templates"
                placeholder="Select one or more templates..."
                emptyMessage="No templates found"
                value={group.templateIds}
                onChange={(ids) => updateGroup(index, { templateIds: ids })}
                onSearchChange={onTemplateSearch}
                loading={isSearchingTemplates}
                options={templateOptions}
              />

              {groupReady && gaps.length === 0 && (
                <div className="flex items-start gap-2 border border-gray-200 bg-white px-3 py-2">
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
                <div className="border border-gray-900 bg-white p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle
                      size={14}
                      strokeWidth={1.5}
                      className="text-gray-900 mt-0.5 shrink-0"
                    />
                    <div>
                      <p className="text-[12px] font-semibold text-gray-900">
                        External reviewers won&apos;t receive assignments or emails
                      </p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {externalWarningTeams.join(", ")}{" "}
                        {externalWarningTeams.length === 1 ? "has" : "have"} external reviewers, but none of the selected templates include the External direction. In the template editor, add &ldquo;External&rdquo; to at least one section&apos;s direction filter, or leave directions empty to match all reviewers. You can still proceed — external reviewers will be skipped.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Routing matrix per team — visible once both teams + templates are picked AND coverage passes */}
              {groupReady && gaps.length === 0 && groupTeams.length > 0 && (
                <div className="space-y-3">
                  {groupTeams.map((team) => (
                    <RoutingMatrix
                      key={team.id}
                      teamName={team.name}
                      members={team.members.map((m) => ({
                        userId: m.userId,
                        name: m.user.name,
                        levelId: m.levelId,
                        levelName: m.level?.name ?? null,
                        role: m.role,
                      }))}
                      templates={groupTemplates}
                    />
                  ))}
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
                        Coverage gap — these members have no matching template
                      </p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        Add a template that covers their level, or include one
                        with no level filter (acts as a wildcard).
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
                                ({m.levelName ?? "no level"})
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

      <Button type="button" variant="secondary" size="sm" onClick={addGroup}>
        <Plus size={14} strokeWidth={1.5} className="mr-1.5" />
        Add Group
      </Button>
    </div>
  );
}
