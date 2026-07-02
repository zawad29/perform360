"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDebouncedSearch } from "./use-debounced-search";
import { StepBasics } from "./step-basics";
import { StepTeams } from "./step-teams";
import type { AssignmentGroup, TeamOption, TeamMemberOption, TemplateOption } from "./types";
import type { DirectionWeights } from "@/lib/directions";

const STEPS = [
  { label: "Basics", description: "Name & dates" },
  { label: "Teams", description: "Assign templates" },
] as const;

interface EditCycleTeamTemplate {
  teamId: string;
  teamName: string;
  members: {
    userId: string;
    name: string;
    role: TeamMemberOption["role"];
    designationId: string | null;
    designationName: string | null;
  }[];
  templates: {
    id: string;
    name: string;
    description?: string | null;
    designationIds?: string[];
    appliesToRole?: TemplateOption["appliesToRole"];
    weightsMember?: DirectionWeights | null;
    weightsManager?: DirectionWeights | null;
    sections?: TemplateOption["sections"];
  }[];
}

interface EditCycleData {
  id: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "CLOSED" | "ARCHIVED";
  startDate: string;
  endDate: string;
  teamTemplates: EditCycleTeamTemplate[];
}

interface CycleEditorProps {
  mode: "create" | "edit";
  cycleId?: string;
}

/** Merge two option lists by `id`, keeping the first occurrence (paginated list wins). */
function mergeById<T extends { id: string }>(primary: T[], extra: T[]): T[] {
  const seen = new Set(primary.map((x) => x.id));
  return [...primary, ...extra.filter((x) => !seen.has(x.id))];
}

/** Reconstruct a TeamOption from a cycle's embedded team data (carries its name + members). */
function teamOptionFromCycle(tt: EditCycleTeamTemplate): TeamOption {
  return {
    id: tt.teamId,
    name: tt.teamName,
    members: tt.members.map((m) => ({
      id: m.userId,
      userId: m.userId,
      designationId: m.designationId,
      designation: m.designationId ? { id: m.designationId, name: m.designationName ?? "" } : null,
      user: { id: m.userId, name: m.name },
      role: m.role,
    })),
  };
}

/** Reconstruct a TemplateOption from a cycle's embedded template data. */
function templateOptionFromCycle(t: EditCycleTeamTemplate["templates"][number]): TemplateOption {
  return {
    id: t.id,
    name: t.name,
    description: t.description ?? null,
    isGlobal: false,
    designationIds: t.designationIds ?? [],
    appliesToRole: t.appliesToRole ?? "ANY",
    sections: t.sections ?? [],
    weightsMember: t.weightsMember ?? null,
    weightsManager: t.weightsManager ?? null,
  };
}

function buildGroups(teamTemplates: EditCycleTeamTemplate[]): AssignmentGroup[] {
  if (teamTemplates.length === 0) {
    return [{ teamIds: [], templateIds: [] }];
  }

  const grouped = new Map<string, AssignmentGroup>();

  for (const item of teamTemplates) {
    const templateIds = item.templates.map((template) => template.id).sort();
    const key = templateIds.join("|");
    const existing = grouped.get(key);

    if (existing) {
      existing.teamIds.push(item.teamId);
      continue;
    }

    grouped.set(key, {
      teamIds: [item.teamId],
      templateIds,
    });
  }

  return Array.from(grouped.values());
}

export function CycleEditor({ mode, cycleId }: CycleEditorProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [isLoading, setIsLoading] = useState(mode === "edit");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [cycleStatus, setCycleStatus] = useState<EditCycleData["status"] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [groups, setGroups] = useState<AssignmentGroup[]>([
    { teamIds: [], templateIds: [] },
  ]);

  const [initialTeams, setInitialTeams] = useState<TeamOption[]>([]);
  const [initialTemplates, setInitialTemplates] = useState<TemplateOption[]>([]);
  const [fetchError, setFetchError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        setLoadError(null);
        setFetchError("");

        // Fetch the full team/template lists (not just the default first page) so every team a
        // cycle references resolves to its name in the editor. Without this, cycles that include
        // teams beyond page 1 render raw team IDs instead of names.
        const requests: Promise<Response>[] = [
          fetch("/api/teams?limit=100"),
          fetch("/api/templates?limit=100"),
        ];

        if (mode === "edit" && cycleId) {
          requests.unshift(fetch(`/api/cycles/${cycleId}`));
        }

        const responses = await Promise.all(requests);
        const payloads = await Promise.all(responses.map((response) => response.json()));

        if (cancelled) return;

        let teamsData: { success?: boolean; data?: TeamOption[] } | undefined;
        let templatesData: { success?: boolean; data?: TemplateOption[] } | undefined;
        let cycleTeamTemplates: EditCycleTeamTemplate[] = [];

        if (mode === "edit") {
          const cycleData = payloads[0] as { success?: boolean; data?: EditCycleData; error?: string };
          teamsData = payloads[1] as { success?: boolean; data?: TeamOption[] };
          templatesData = payloads[2] as { success?: boolean; data?: TemplateOption[] };

          if (!cycleData.success || !cycleData.data) {
            setLoadError(cycleData.error ?? "Failed to load cycle");
          } else {
            setName(cycleData.data.name);
            setStartDate(cycleData.data.startDate.slice(0, 10));
            setEndDate(cycleData.data.endDate.slice(0, 10));
            setGroups(buildGroups(cycleData.data.teamTemplates));
            setCycleStatus(cycleData.data.status);
            cycleTeamTemplates = cycleData.data.teamTemplates;
          }
        } else {
          teamsData = payloads[0] as { success?: boolean; data?: TeamOption[] };
          templatesData = payloads[1] as { success?: boolean; data?: TemplateOption[] };
        }

        // Merge the cycle's OWN teams/templates (which carry their names) into the option lists,
        // so every team/template a cycle references always resolves to a name — even if it falls
        // outside the paginated /api/teams + /api/templates results.
        if (teamsData?.success && teamsData.data) {
          setInitialTeams(mergeById(teamsData.data, cycleTeamTemplates.map(teamOptionFromCycle)));
        }
        if (templatesData?.success && templatesData.data) {
          const cycleTemplates = cycleTeamTemplates.flatMap((tt) => tt.templates.map(templateOptionFromCycle));
          setInitialTemplates(mergeById(templatesData.data, cycleTemplates));
        }

        if (!teamsData?.success || !templatesData?.success) {
          setFetchError("Failed to load teams or templates");
        }
      } catch {
        if (!cancelled) {
          setLoadError(mode === "edit" ? "Failed to load cycle" : null);
          setFetchError("Failed to load teams or templates");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [cycleId, mode]);

  const {
    data: teams,
    isSearching: isSearchingTeams,
    handleSearch: handleTeamSearch,
  } = useDebouncedSearch<TeamOption>("/api/teams", initialTeams);

  const {
    data: templates,
    isSearching: isSearchingTemplates,
    handleSearch: handleTemplateSearch,
  } = useDebouncedSearch<TemplateOption>("/api/templates", initialTemplates);

  const isReadOnly = mode === "edit" && cycleStatus !== "DRAFT";

  const isStep1Valid = !!(name.trim() && startDate && endDate);

  // Coverage gaps no longer block submission — they're shown as a non-blocking
  // warning in Step 2 and persisted on the cycle detail page. Only require that
  // every group has at least one team and one template.
  const isStep2Valid = useMemo(
    () =>
      groups.length > 0 &&
      groups.every((group) => group.teamIds.length > 0 && group.templateIds.length > 0),
    [groups]
  );

  const canProceed = [isStep1Valid, isStep2Valid][step];

  async function handleSubmit() {
    if (isReadOnly || !isStep1Valid || !isStep2Valid) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const teamTemplates = groups.flatMap((group) =>
        group.teamIds.map((teamId) => ({
          teamId,
          templateIds: group.templateIds,
        }))
      );

      const endpoint = mode === "edit" && cycleId ? `/api/cycles/${cycleId}` : "/api/cycles";
      const method = mode === "edit" ? "PATCH" : "POST";
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, startDate, endDate, teamTemplates }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        // Coverage gaps (if any) are persisted on the detail page — navigate through.
        const targetId = mode === "edit" ? cycleId : data.data.id;
        router.push(`/cycles/${targetId}`);
      } else {
        setSubmitError(
          data.error ?? (mode === "edit" ? "Failed to update cycle" : "Failed to create cycle")
        );
      }
    } catch {
      setSubmitError("Network error — please try again");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="max-w-3xl">
      <nav className="flex items-center mb-8">
        {STEPS.map((item, index) => {
          const isCompleted = index < step;
          const isActive = index === step;
          return (
            <Fragment key={item.label}>
              {index > 0 && (
                <div
                  className={cn(
                    "flex-1 h-px mx-3",
                    index <= step ? "bg-gray-900" : "bg-gray-200"
                  )}
                />
              )}
              <button
                type="button"
                onClick={() => {
                  if (index < step) setStep(index);
                }}
                disabled={index > step}
                className="flex items-center gap-2.5 shrink-0"
              >
                <span
                  className={cn(
                    "flex items-center justify-center w-8 h-8 text-[13px] font-semibold shrink-0",
                    isCompleted && "bg-gray-900 text-white",
                    isActive && "bg-gray-900 text-white ring-4 ring-gray-200",
                    !isCompleted && !isActive && "bg-gray-100 text-gray-400"
                  )}
                >
                  {isCompleted ? <Check size={14} strokeWidth={3} /> : index + 1}
                </span>
                <div className="hidden sm:block text-left">
                  <p
                    className={cn(
                      "text-[13px] font-medium leading-tight",
                      isActive || isCompleted ? "text-gray-900" : "text-gray-400"
                    )}
                  >
                    {item.label}
                  </p>
                  <p className="text-[11px] text-gray-400 leading-tight">
                    {item.description}
                  </p>
                </div>
              </button>
            </Fragment>
          );
        })}
      </nav>

      {mode === "edit" && cycleStatus && (
        <div className="mb-6 flex items-start justify-between gap-3 border border-gray-200 bg-gray-50 px-4 py-3">
          <div>
            <p className="text-[13px] font-medium text-gray-900">
              {isReadOnly
                ? "This cycle is currently read-only."
                : "This cycle is currently editable."}
            </p>
            <p className="text-[12px] text-gray-500">
              {isReadOnly
                ? "Draft cycles can be updated here. Active, closed, and archived cycles are shown for reference only."
                : "Draft cycles can update details, teams, and templates here."}
            </p>
          </div>
          <Badge variant={cycleStatus === "DRAFT" ? "default" : cycleStatus === "ACTIVE" ? "success" : cycleStatus === "CLOSED" ? "warning" : "info"}>
            {cycleStatus.charAt(0) + cycleStatus.slice(1).toLowerCase()}
          </Badge>
        </div>
      )}

      {isLoading ? (
        <div className="min-h-[280px] flex items-center justify-center text-[13px] text-gray-500">
          Loading cycle setup...
        </div>
      ) : loadError ? (
        <div className="min-h-[280px] flex items-center justify-center text-[13px] text-gray-900">
          {loadError}
        </div>
      ) : (
        <>
          <div className="min-h-[280px]">
            {step === 0 && (
              <StepBasics
                name={name}
                onNameChange={setName}
                startDate={startDate}
                onStartDateChange={setStartDate}
                endDate={endDate}
                onEndDateChange={setEndDate}
                readOnly={isReadOnly}
              />
            )}

            {step === 1 && (
              <StepTeams
                groups={groups}
                onGroupsChange={setGroups}
                teams={teams}
                templates={templates}
                isSearchingTeams={isSearchingTeams}
                isSearchingTemplates={isSearchingTemplates}
                onTeamSearch={handleTeamSearch}
                onTemplateSearch={handleTemplateSearch}
                fetchError={fetchError}
                readOnly={isReadOnly}
              />
            )}
          </div>

          {submitError && (
            <div className="mt-4 border border-gray-900 bg-white p-3 text-[13px] text-gray-900">
              {submitError}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-6 mt-6 border-t border-gray-100">
            <div>
              {step > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setStep(step - 1)}
                >
                  Back
                </Button>
              )}
              {step === 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => router.push(mode === "edit" && cycleId ? `/cycles/${cycleId}` : "/cycles")}
                >
                  {mode === "edit" ? "View Details" : "Cancel"}
                </Button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {step < STEPS.length - 1 && (
                <Button
                  type="button"
                  disabled={!canProceed}
                  onClick={() => setStep(step + 1)}
                >
                  Continue
                </Button>
              )}
              {step === STEPS.length - 1 && !isReadOnly && (
                <Button
                  type="button"
                  disabled={isSubmitting || !canProceed}
                  onClick={handleSubmit}
                >
                  {isSubmitting
                    ? mode === "edit"
                      ? "Saving..."
                      : "Creating..."
                    : mode === "edit"
                      ? "Save Changes"
                      : "Create Cycle"}
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
