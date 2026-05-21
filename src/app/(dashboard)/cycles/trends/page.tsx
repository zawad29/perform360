"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { ErrorCard } from "@/components/ui/error-card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  UnlockGate,
  useEncryptionUnlock,
} from "@/components/encryption/unlock-gate";
import { KpiSparkline } from "@/components/reports/kpi-sparkline";
import { ScoreTrendChart } from "@/components/reports/score-trend-chart";
import { CompletionTrendChart } from "@/components/reports/completion-trend-chart";
import { TeamPerformanceOverlayChart } from "@/components/reports/team-performance-overlay-chart";
import { DirectionTrendChart } from "@/components/reports/direction-trend-chart";
import { AssignmentVolumeChart } from "@/components/reports/assignment-volume-chart";
import { DIRECTIONS } from "@/lib/directions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import type { TrendsReport, KpiMetric } from "@/types/trends";

// ─── KPI Card ───

function KpiCard({
  title,
  value,
  suffix,
  metric,
  sparklineData,
  sparklineColor,
}: {
  title: string;
  value: string;
  suffix?: string;
  metric: KpiMetric;
  sparklineData?: (number | null)[];
  sparklineColor?: string;
}) {
  const deltaDisplay =
    metric.delta !== null
      ? `${metric.delta > 0 ? "+" : ""}${metric.delta.toFixed(1)}${suffix ?? ""}`
      : null;

  const DeltaIcon =
    metric.delta !== null
      ? metric.delta > 0
        ? TrendingUp
        : metric.delta < 0
          ? TrendingDown
          : Minus
      : null;

  const deltaColor =
    metric.delta !== null
      ? metric.delta > 0
        ? "text-gray-900 bg-gray-100"
        : metric.delta < 0
          ? "text-gray-900 bg-gray-100"
          : "text-gray-500 bg-gray-100"
      : "";

  return (
    <Card padding="sm">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-gray-500 uppercase tracking-wider mb-1">
            {title}
          </p>
          <p className="text-[24px] font-bold text-gray-900 leading-tight">
            {value}
            {suffix && (
              <span className="text-[14px] font-normal text-gray-400 ml-0.5">
                {suffix}
              </span>
            )}
          </p>
          {deltaDisplay && DeltaIcon && (
            <span
              className={`inline-flex items-center gap-1 mt-1.5 px-1.5 py-0.5 text-[11px] font-medium ${deltaColor}`}
            >
              <DeltaIcon size={11} strokeWidth={2} />
              {deltaDisplay}
              <span className="text-[10px] font-normal opacity-70 ml-0.5">
                vs avg
              </span>
            </span>
          )}
          {deltaDisplay === null && (
            <span className="inline-flex items-center mt-1.5 text-[11px] text-gray-400">
              No prior data
            </span>
          )}
        </div>
        {sparklineData && (
          <div className="shrink-0 ml-2">
            <KpiSparkline data={sparklineData} color={sparklineColor} />
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── Direction Split Card ───

const DIRECTION_COLORS: Record<string, string> = {
  downward: "#0071e3",
  upward: "#5ac8fa",
  lateral: "#af52de",
  self: "#86868b",
  external: "#f5a623",
};

function RelationshipSplitCard({
  data,
}: {
  data: Record<string, number | null>;
}) {
  const entries = DIRECTIONS
    .map((d) => {
      const key = d.key.toLowerCase();
      return {
        key,
        label: d.label,
        color: DIRECTION_COLORS[key],
        score: data[key] ?? null,
      };
    })
    .filter((e) => e.score !== null);

  const maxScore = 5;

  return (
    <Card padding="sm">
      <p className="text-[12px] font-medium text-gray-500 uppercase tracking-wider mb-2">
        Relationship Split
      </p>
      {entries.length === 0 ? (
        <p className="text-[13px] text-gray-400">No data</p>
      ) : (
        <div className="space-y-1.5">
          {entries.map((e) => (
            <div key={e.key} className="flex items-center gap-2">
              <span className="text-[11px] text-gray-500 w-[72px] truncate">
                {e.label}
              </span>
              <div className="flex-1 h-[6px] bg-gray-100 overflow-hidden">
                <div
                  className="h-full"
                  style={{
                    width: `${((e.score ?? 0) / maxScore) * 100}%`,
                    backgroundColor: e.color,
                  }}
                />
              </div>
              <span className="text-[11px] font-medium text-gray-600 w-[28px] text-right">
                {e.score?.toFixed(1)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── Top Performer Delta Card ───

function TopPerformerCard({
  current,
  previous,
  delta,
  name,
}: {
  current: number | null;
  previous: number | null;
  delta: number | null;
  name: string | null;
}) {
  const DeltaIcon =
    delta !== null
      ? delta > 0
        ? TrendingUp
        : delta < 0
          ? TrendingDown
          : Minus
      : null;

  const deltaColor =
    delta !== null
      ? delta > 0
        ? "text-gray-900"
        : delta < 0
          ? "text-gray-900"
          : "text-gray-500"
      : "";

  return (
    <Card padding="sm">
      <p className="text-[12px] font-medium text-gray-500 uppercase tracking-wider mb-1">
        Top Performer
      </p>
      {current !== null ? (
        <>
          <p className="text-[24px] font-bold text-gray-900 leading-tight">
            {current.toFixed(2)}
          </p>
          {name && (
            <p className="text-[12px] text-gray-500 truncate mt-0.5">
              {name}
            </p>
          )}
          {delta !== null && DeltaIcon && (
            <span
              className={`inline-flex items-center gap-1 mt-1.5 text-[11px] font-medium ${deltaColor}`}
            >
              <DeltaIcon size={11} strokeWidth={2} />
              {delta > 0 ? "+" : ""}
              {delta.toFixed(2)} vs prev cycle
            </span>
          )}
          {delta === null && previous === null && (
            <span className="inline-flex items-center mt-1.5 text-[11px] text-gray-400">
              No prior data
            </span>
          )}
        </>
      ) : (
        <p className="text-[14px] text-gray-400 mt-2">No data yet</p>
      )}
    </Card>
  );
}

// ─── Skeleton ───

function TrendsSkeleton() {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 w-full " />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        {[4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-28 w-full " />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[7, 8].map((i) => (
          <Skeleton key={i} className="h-[340px] w-full " />
        ))}
        {[9, 10, 11].map((i) => (
          <Skeleton
            key={i}
            className="h-[380px] w-full  lg:col-span-2"
          />
        ))}
      </div>
    </>
  );
}

// ─── Data Transformers ───

function buildTeamOverlayData(report: TrendsReport) {
  return report.cycles.map((cycle) => {
    const row: Record<string, string | number | null> = {
      cycleName: cycle.cycleName,
    };
    for (const team of report.allTeams) {
      const teamScore = cycle.teamScores.find(
        (ts) => ts.teamId === team.teamId
      );
      row[team.teamName] = teamScore?.avgScore ?? null;
    }
    return row;
  });
}

function buildDirectionTrendData(report: TrendsReport) {
  return report.cycles
    .filter((c) => !c.isDraft)
    .map((cycle) => ({
      cycleName: cycle.cycleName,
      downward: cycle.directionScores.downward,
      upward: cycle.directionScores.upward,
      lateral: cycle.directionScores.lateral,
      self: cycle.directionScores.self,
      external: cycle.directionScores.external,
    }));
}

function buildAssignmentVolumeData(report: TrendsReport) {
  return report.cycles.map((cycle) => ({
    cycleName: cycle.cycleName,
    completed: cycle.completedAssignments,
    remaining: cycle.totalAssignments - cycle.completedAssignments,
    isDraft: cycle.isDraft,
  }));
}

// ─── Main Page ───

export default function CycleTrendsPage() {
  const [data, setData] = useState<TrendsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { locked, reset, handleApiResponse, handleUnlocked } =
    useEncryptionUnlock();
  const { addToast } = useToast();

  async function fetchTrends() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cycles/trends");
      const json = await res.json();
      if (handleApiResponse(json)) return;
      if (!json.success) throw new Error(json.error || "Failed to load trends");
      setData(json.data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load trends";
      setError(msg);
      addToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetch("/api/cycles/trends")
      .then((r) => r.json())
      .then((json) => {
        if (handleApiResponse(json)) return;
        if (!json.success) throw new Error(json.error || "Failed to load trends");
        setData(json.data);
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "Failed to load trends";
        setError(msg);
        addToast(msg, "error");
      })
      .finally(() => setLoading(false));
  }, [handleApiResponse, addToast]);

  const handleUnlockedAndRefetch = () => {
    handleUnlocked();
    setData(null);
    fetchTrends();
  };

  const kpi = data?.kpiSummary;
  const hasCycles = data && data.cycles.length > 0;
  const hasScoredCycles = data?.cycles.some((c) => !c.isDraft);

  return (
    <div>
      <Breadcrumb
        items={[
          { label: "Cycles", href: "/cycles" },
          { label: "Trends" },
        ]}
      />
      <PageHeader
        title="Cycle Trends"
        description="Cross-cycle performance analytics"
      >
        <Link href="/cycles">
          <Button variant="secondary" size="sm">
            <ArrowLeft size={14} strokeWidth={2} className="mr-1.5" />
            Back to Cycles
          </Button>
        </Link>
      </PageHeader>

      <UnlockGate
        locked={locked}
        reset={reset}
        onUnlocked={handleUnlockedAndRefetch}
      >
        {loading ? (
          <TrendsSkeleton />
        ) : error ? (
          <ErrorCard
            message={error}
            hint="Check your connection and try again"
            onRetry={fetchTrends}
          />
        ) : !hasCycles ? (
          <EmptyState
            icon={BarChart3}
            title="No cycle data yet"
            description="Create and activate evaluation cycles to see trends"
          />
        ) : !hasScoredCycles ? (
          <EmptyState
            icon={BarChart3}
            title="No completed cycles"
            description="Activate a cycle and collect evaluations to see performance trends"
          />
        ) : (
          <>
            {/* KPI Cards — Row 1 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-4">
              <KpiCard
                title="Avg Score"
                value={kpi!.avgScore.current?.toFixed(2) ?? "–"}
                metric={kpi!.avgScore}
                sparklineData={data!.cycles.map((c) => c.avgScore)}
                sparklineColor="#0071e3"
              />
              <KpiCard
                title="Completion Rate"
                value={kpi!.completionRate.current?.toFixed(1) ?? "–"}
                suffix="%"
                metric={kpi!.completionRate}
                sparklineData={data!.cycles.map((c) => c.completionRate)}
                sparklineColor="#34c759"
              />
              <KpiCard
                title="Assignments"
                value={
                  kpi!.assignments.current?.toLocaleString() ?? "–"
                }
                metric={kpi!.assignments}
                sparklineData={data!.cycles.map(
                  (c) => c.totalAssignments
                )}
                sparklineColor="#5ac8fa"
              />
            </div>

            {/* KPI Cards — Row 2 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-8">
              <KpiCard
                title="Teams Evaluated"
                value={kpi!.teamsEvaluated.current?.toString() ?? "–"}
                metric={kpi!.teamsEvaluated}
                sparklineData={data!.cycles.map((c) => c.teamsEvaluated)}
                sparklineColor="#af52de"
              />
              <RelationshipSplitCard data={kpi!.directionSplit} />
              <TopPerformerCard
                current={kpi!.topPerformerDelta.current}
                previous={kpi!.topPerformerDelta.previous}
                delta={kpi!.topPerformerDelta.delta}
                name={kpi!.topPerformerDelta.currentName}
              />
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Score Trend */}
              <Card>
                <CardHeader>
                  <CardTitle>Score Trend</CardTitle>
                </CardHeader>
                <ScoreTrendChart
                  data={data!.cycles.map((c) => ({
                    cycleName: c.cycleName,
                    avgScore: c.avgScore,
                    isDraft: c.isDraft,
                  }))}
                />
              </Card>

              {/* Completion Rate */}
              <Card>
                <CardHeader>
                  <CardTitle>Completion Rate</CardTitle>
                </CardHeader>
                <CompletionTrendChart
                  data={data!.cycles.map((c) => ({
                    cycleName: c.cycleName,
                    completionRate: c.completionRate,
                    isDraft: c.isDraft,
                  }))}
                />
              </Card>

              {/* Team Performance Overlay */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Team Performance</CardTitle>
                </CardHeader>
                <TeamPerformanceOverlayChart
                  data={buildTeamOverlayData(data!)}
                  teams={data!.allTeams}
                />
              </Card>

              {/* Direction Trends */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Direction Trends</CardTitle>
                </CardHeader>
                {(() => {
                  // Detect cycles where the set of templates changed vs the previous
                  // cycle. A change means the direction averages aren't strictly
                  // comparable — different forms ask different questions.
                  const cycles = data!.cycles.filter((c) => !c.isDraft);
                  let templateChanged = false;
                  for (let i = 1; i < cycles.length; i++) {
                    const prev = new Set(cycles[i - 1].templateIds);
                    const curr = new Set(cycles[i].templateIds);
                    if (
                      prev.size !== curr.size ||
                      [...curr].some((id) => !prev.has(id))
                    ) {
                      templateChanged = true;
                      break;
                    }
                  }
                  return (
                    <>
                      <DirectionTrendChart data={buildDirectionTrendData(data!)} />
                      {templateChanged && (
                        <p className="text-[11px] text-gray-500 px-4 pb-3 leading-snug">
                          Some cycles in this range used different templates. Direction
                          comparisons across template changes are approximate — different
                          forms ask different questions.
                        </p>
                      )}
                    </>
                  );
                })()}
              </Card>

              {/* Assignment Volume */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Assignment Volume</CardTitle>
                </CardHeader>
                <AssignmentVolumeChart
                  data={buildAssignmentVolumeData(data!)}
                />
              </Card>
            </div>
          </>
        )}
      </UnlockGate>
    </div>
  );
}
