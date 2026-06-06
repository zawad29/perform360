"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { ScoreTrendChart } from "@/components/reports/score-trend-chart";
import { CompetencyRadarChart } from "@/components/reports/radar-chart";
import { DirectionScoreChart } from "@/components/reports/direction-score-chart";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  Target,
  Activity,
  Percent,
  ChevronRight,
  Lock,
  AlertCircle,
} from "lucide-react";
import type { PersonPerformanceProfile } from "@/types/report";

const roleBadgeMap: Record<string, { variant: "info" | "success" | "warning" | "default"; label: string }> = {
  ADMIN: { variant: "info", label: "Admin" },
  HR: { variant: "success", label: "HR" },
  MEMBER: { variant: "default", label: "Member" },
  EXTERNAL: { variant: "warning", label: "External" },
};

const cycleStatusBadge: Record<string, { variant: "success" | "info" | "outline" | "default"; label: string }> = {
  ACTIVE: { variant: "success", label: "Active" },
  CLOSED: { variant: "info", label: "Closed" },
  ARCHIVED: { variant: "outline", label: "Archived" },
};

function KpiCard({
  label,
  value,
  icon: Icon,
  subtext,
  loading,
}: {
  label: string;
  value: string;
  icon: typeof TrendingUp;
  subtext?: React.ReactNode;
  loading: boolean;
}) {
  return (
    <Card padding="md">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-[13px] font-medium text-gray-400 uppercase tracking-wider">
            {label}
          </p>
          {loading ? (
            <Skeleton className="h-8 w-20 mt-1" />
          ) : (
            <>
              <p className="text-[28px] font-bold text-gray-900 tracking-tight tabular-nums">
                {value}
              </p>
              {subtext && <div className="mt-0.5">{subtext}</div>}
            </>
          )}
        </div>
        <div className="p-2.5 text-info">
          <Icon size={20} strokeWidth={1.5} />
        </div>
      </div>
    </Card>
  );
}

function TrendIndicator({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-[12px] text-gray-400">No prior data</span>;
  if (delta === 0) return (
    <span className="flex items-center gap-0.5 text-[12px] text-gray-400">
      <Minus size={12} strokeWidth={2} /> No change
    </span>
  );
  const isPositive = delta > 0;
  return (
    <span className={`flex items-center gap-0.5 text-[12px] font-medium ${isPositive ? "text-success" : "text-error"}`}>
      {isPositive ? <TrendingUp size={12} strokeWidth={2} /> : <TrendingDown size={12} strokeWidth={2} />}
      {isPositive ? "+" : ""}{delta.toFixed(2)}
    </span>
  );
}

export default function PersonPerformancePage() {
  const params = useParams<{ userId: string }>();
  const [profile, setProfile] = useState<PersonPerformanceProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  async function fetchProfile() {
    setLoading(true);
    setError(null);
    setErrorCode(null);
    try {
      const res = await fetch(`/api/reports/user/${params.userId}`);
      const json = await res.json();
      if (!json.success) {
        setError(json.error || "Failed to load performance data");
        setErrorCode(json.code || null);
        return;
      }
      setProfile(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load performance data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetch(`/api/reports/user/${params.userId}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.success) {
          setError(json.error || "Failed to load performance data");
          setErrorCode(json.code || null);
          return;
        }
        setProfile(json.data);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load performance data");
      })
      .finally(() => setLoading(false));
  }, [params.userId]);

  if (error) {
    const isLocked = errorCode === "ENCRYPTION_LOCKED";
    return (
      <div>
        <Breadcrumb items={[{ label: "People", href: "/people" }, { label: "Performance" }]} />
        <PageHeader title="Performance" description="" />
        <Card className="max-w-lg mx-auto mt-12 text-center">
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="p-3 bg-error-tint">
              {isLocked
                ? <Lock size={24} strokeWidth={1.5} className="text-warning" />
                : <AlertCircle size={24} strokeWidth={1.5} className="text-error" />
              }
            </div>
            <p className="text-[14px] text-gray-600 max-w-xs">{error}</p>
            {!isLocked && (
              <Button variant="secondary" size="sm" onClick={fetchProfile}>Retry</Button>
            )}
          </div>
        </Card>
      </div>
    );
  }

  if (loading || !profile) {
    return (
      <div>
        <Breadcrumb items={[{ label: "People", href: "/people" }, { label: "Performance" }]} />
        <PageHeader title="" description="">
          <Skeleton className="h-9 w-40" />
        </PageHeader>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} padding="md">
              <Skeleton className="h-4 w-20 mb-3" />
              <Skeleton className="h-8 w-16" />
            </Card>
          ))}
        </div>
        <Card className="mb-6">
          <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
          <Skeleton className="h-[300px] mx-6 mb-6" />
        </Card>
      </div>
    );
  }

  const badge = roleBadgeMap[profile.role] ?? { variant: "default" as const, label: profile.role };

  const trendData = profile.cycles.map((c) => ({
    cycleName: c.cycleName,
    avgScore: c.overallScore > 0 ? c.overallScore : null,
    isDraft: false,
  }));

  return (
    <div>
      <Breadcrumb items={[
        { label: "People", href: "/people" },
        { label: profile.userName, href: `/people/${profile.userId}` },
        { label: "Performance" },
      ]} />
      <PageHeader title={profile.userName} description={`Performance profile across ${profile.cycleCount} evaluation cycle${profile.cycleCount !== 1 ? "s" : ""}`}>
        <Badge variant={badge.variant}>{badge.label}</Badge>
        {profile.teamMemberships.map((tm) => (
          <Badge key={tm.teamId} variant="outline">{tm.teamName}</Badge>
        ))}
      </PageHeader>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard
          label="Latest Score"
          value={profile.latestScore?.toFixed(2) ?? "–"}
          icon={Target}
          subtext={<TrendIndicator delta={profile.scoreTrend} />}
          loading={false}
        />
        <KpiCard
          label="Average Score"
          value={profile.averageScore?.toFixed(2) ?? "–"}
          icon={BarChart3}
          subtext={
            profile.highestScore !== null && profile.lowestScore !== null ? (
              <span className="text-[12px] text-gray-400">
                {profile.lowestScore.toFixed(1)} – {profile.highestScore.toFixed(1)} range
              </span>
            ) : undefined
          }
          loading={false}
        />
        <KpiCard
          label="Score Trend"
          value={profile.scoreTrend !== null ? `${profile.scoreTrend > 0 ? "+" : ""}${profile.scoreTrend.toFixed(2)}` : "–"}
          icon={Activity}
          subtext={
            profile.scoreTrend !== null ? (
              <span className={`text-[12px] font-medium ${profile.scoreTrend >= 0 ? "text-success" : "text-error"}`}>
                {profile.scoreTrend >= 0 ? "Improving" : "Declining"}
              </span>
            ) : undefined
          }
          loading={false}
        />
        <KpiCard
          label="Avg Response Rate"
          value={`${profile.avgResponseRate}%`}
          icon={Percent}
          loading={false}
        />
      </div>

      {/* Score Trend Chart */}
      {profile.cycles.length > 1 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Score Trend</CardTitle>
          </CardHeader>
          <div className="px-2 pb-4">
            <ScoreTrendChart data={trendData} />
          </div>
        </Card>
      )}

      {/* Category Radar + Relationship Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Category Averages</CardTitle>
          </CardHeader>
          <CompetencyRadarChart categories={profile.avgCategoryScores} />
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Direction Scores</CardTitle>
          </CardHeader>
          <div className="px-2 pb-4">
            <DirectionScoreChart
              downward={profile.avgDirectionScores.downward}
              upward={profile.avgDirectionScores.upward}
              lateral={profile.avgDirectionScores.lateral}
              self={profile.avgDirectionScores.self}
              external={profile.avgDirectionScores.external}
            />
          </div>
        </Card>
      </div>

      {/* Cycle History Table */}
      <Card>
        <CardHeader>
          <CardTitle>Cycle History</CardTitle>
        </CardHeader>
        {profile.cycles.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-[14px] text-gray-400">No evaluation data available yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-900">
                  <th className="px-4 py-2.5 text-[12px] font-medium text-gray-500 uppercase tracking-wider">Cycle</th>
                  <th className="px-4 py-2.5 text-[12px] font-medium text-gray-500 uppercase tracking-wider">Period</th>
                  <th className="px-4 py-2.5 text-[12px] font-medium text-gray-500 uppercase tracking-wider">Level</th>
                  <th className="px-4 py-2.5 text-[12px] font-medium text-gray-500 uppercase tracking-wider">Score</th>
                  <th className="px-4 py-2.5 text-[12px] font-medium text-gray-500 uppercase tracking-wider">Response Rate</th>
                  <th className="px-4 py-2.5 text-[12px] font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {profile.cycles.map((cycle) => {
                  const sb = cycleStatusBadge[cycle.cycleStatus] ?? { variant: "default" as const, label: cycle.cycleStatus };
                  const startDate = new Date(cycle.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" });
                  const endDate = new Date(cycle.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                  return (
                    <tr key={cycle.cycleId} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <p className="text-[14px] font-medium text-gray-900">{cycle.cycleName}</p>
                      </td>
                      <td className="px-4 py-3 text-[13px] text-gray-500">
                        {startDate} – {endDate}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-gray-700">
                        {cycle.levels.length === 0 ? (
                          <span className="text-gray-400">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {cycle.levels.map((lvl) => (
                              <Badge key={lvl} variant="outline" className="text-[11px]">
                                {lvl}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[16px] font-bold text-gray-900 tabular-nums">
                          {cycle.overallScore > 0 ? cycle.overallScore.toFixed(2) : "–"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Progress value={cycle.responseRate.rate} semantic className="w-16" />
                          <span className="text-[12px] text-gray-500 tabular-nums">
                            {cycle.responseRate.completed}/{cycle.responseRate.total}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={sb.variant}>{sb.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/cycles/${cycle.cycleId}/reports/${profile.userId}`}
                          className="inline-flex items-center gap-1 text-[13px] font-medium text-gray-500 hover:text-gray-900"
                        >
                          View Report <ChevronRight size={14} strokeWidth={2} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
