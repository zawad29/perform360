"use client";

import { Fragment, useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { isCycleSubjectRole } from "@/lib/cycle-subjects";
import { useDebouncedSearch } from "./_components/use-debounced-search";
import { StepBasics } from "./_components/step-basics";
import { StepTeams } from "./_components/step-teams";
import type { TeamOption, TemplateOption, AssignmentGroup } from "./_components/types";

const STEPS = [
  { label: "Basics", description: "Name & dates" },
  { label: "Teams", description: "Assign templates" },
] as const;

interface CoverageGapMember {
  userId: string;
  name: string;
  levelName: string | null;
}

interface CoverageGap {
  teamId: string;
  teamName: string;
  members: CoverageGapMember[];
}

export default function NewCyclePage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [coverageGaps, setCoverageGaps] = useState<CoverageGap[]>([]);

  // Step 1 state
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Step 2 state
  const [groups, setGroups] = useState<AssignmentGroup[]>([
    { teamIds: [], templateIds: [] },
  ]);

  // Data loading
  const [initialTeams, setInitialTeams] = useState<TeamOption[]>([]);
  const [initialTemplates, setInitialTemplates] = useState<TemplateOption[]>([]);
  const [fetchError, setFetchError] = useState("");

  useEffect(() => {
    async function loadOptions() {
      try {
        const [teamsRes, templatesRes] = await Promise.all([
          fetch("/api/teams"),
          fetch("/api/templates"),
        ]);
        const teamsData = await teamsRes.json();
        const templatesData = await templatesRes.json();
        if (teamsData.success) setInitialTeams(teamsData.data);
        if (templatesData.success) setInitialTemplates(templatesData.data);
      } catch {
        setFetchError("Failed to load teams or templates");
      }
    }
    loadOptions();
  }, []);

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

  const isStep1Valid = !!(name.trim() && startDate && endDate);

  const hasClientCoverageGap = useMemo(() => {
    if (teams.length === 0 || templates.length === 0) return false;
    for (const g of groups) {
      if (g.teamIds.length === 0 || g.templateIds.length === 0) continue;
      const groupTemplates = templates.filter((t) => g.templateIds.includes(t.id));
      const hasWildcard = groupTemplates.some((t) => t.levelIds.length === 0);
      if (hasWildcard) continue;
      const coveredLevelIds = new Set(groupTemplates.flatMap((t) => t.levelIds));
      for (const teamId of g.teamIds) {
        const team = teams.find((t) => t.id === teamId);
        if (!team) continue;
        const hasGap = team.members.some(
          (m) =>
            isCycleSubjectRole(m.role) &&
            (m.levelId === null || !coveredLevelIds.has(m.levelId))
        );
        if (hasGap) return true;
      }
    }
    return false;
  }, [groups, teams, templates]);

  const isStep2Valid = useMemo(
    () =>
      groups.length > 0 &&
      groups.every((g) => g.teamIds.length > 0 && g.templateIds.length > 0) &&
      !hasClientCoverageGap,
    [groups, hasClientCoverageGap]
  );

  const canProceed = [isStep1Valid, isStep2Valid][step];

  async function handleSubmit() {
    if (!isStep1Valid || !isStep2Valid) return;
    setIsLoading(true);
    setSubmitError(null);
    setCoverageGaps([]);
    try {
      const teamTemplates = groups.flatMap((group) =>
        group.teamIds.map((teamId) => ({
          teamId,
          templateIds: group.templateIds,
        }))
      );

      const res = await fetch("/api/cycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, startDate, endDate, teamTemplates }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        router.push(`/cycles/${data.data.id}`);
      } else if (data.code === "COVERAGE_GAP") {
        setCoverageGaps(data.gaps ?? []);
        setSubmitError(
          "Some members are not covered by any assigned template."
        );
      } else {
        setSubmitError(data.error ?? "Failed to create cycle");
      }
    } catch {
      setSubmitError("Network error — please try again");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Create Evaluation Cycle"
        description="Set up a new 360° evaluation cycle"
      />

      <Card className="max-w-3xl">
        {/* Stepper */}
        <nav className="flex items-center mb-8">
          {STEPS.map((s, i) => {
            const isCompleted = i < step;
            const isActive = i === step;
            return (
              <Fragment key={s.label}>
                {i > 0 && (
                  <div
                    className={cn(
                      "flex-1 h-px mx-3",
                      i <= step ? "bg-gray-900" : "bg-gray-200"
                    )}
                  />
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (i < step) setStep(i);
                  }}
                  disabled={i > step}
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
                    {isCompleted ? <Check size={14} strokeWidth={3} /> : i + 1}
                  </span>
                  <div className="hidden sm:block text-left">
                    <p
                      className={cn(
                        "text-[13px] font-medium leading-tight",
                        isActive || isCompleted
                          ? "text-gray-900"
                          : "text-gray-400"
                      )}
                    >
                      {s.label}
                    </p>
                    <p className="text-[11px] text-gray-400 leading-tight">
                      {s.description}
                    </p>
                  </div>
                </button>
              </Fragment>
            );
          })}
        </nav>

        {/* Step content */}
        <div className="min-h-[280px]" data-wizard-step={step}>
          {step === 0 && (
            <StepBasics
              name={name}
              onNameChange={setName}
              startDate={startDate}
              onStartDateChange={setStartDate}
              endDate={endDate}
              onEndDateChange={setEndDate}
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
            />
          )}
        </div>

        {/* Coverage gap error */}
        {coverageGaps.length > 0 && (
          <div className="mt-4 border border-gray-900 bg-white p-4">
            <p className="text-[13px] font-semibold text-gray-900 mb-2">
              Coverage gap — these members have no matching template
            </p>
            <p className="text-[12px] text-gray-500 mb-3">
              Add a template that covers their level, or use a template with no
              level filter.
            </p>
            <div className="space-y-3">
              {coverageGaps.map((gap) => (
                <div key={gap.teamId}>
                  <p className="text-[12px] font-medium text-gray-700">
                    {gap.teamName}
                  </p>
                  <ul className="mt-1 space-y-0.5">
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

        {submitError && coverageGaps.length === 0 && (
          <div className="mt-4 border border-gray-900 bg-white p-3 text-[13px] text-gray-900">
            {submitError}
          </div>
        )}

        {/* Navigation */}
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
                onClick={() => router.back()}
              >
                Cancel
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
            {step === STEPS.length - 1 && (
              <Button
                type="button"
                disabled={isLoading || !canProceed}
                onClick={handleSubmit}
              >
                {isLoading ? "Creating..." : "Create Cycle"}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
