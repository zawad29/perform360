"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/page-header";
import {
  RefreshCcw,
  Users,
  ClipboardCheck,
  TrendingUp,
  ArrowRight,
  Clock,
  AlertCircle,
  CheckCircle2,
  UserPlus,
  FolderPlus,
  PlayCircle,
  Send,
  ChevronRight,
  ChevronLeft,
  Calendar,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DashboardStats {
  activeCycles: number;
  totalTeams: number;
  pendingReviews: number;
  completionRate: number;
}

interface Cycle {
  id: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
  templateId: string;
  _count: { assignments: number };
  submittedCount: number;
  pendingCount: number;
}

interface ActivityItem {
  id: string;
  type: "submission" | "cycle_status" | "team_created" | "user_invited" | "cycle_created";
  title: string;
  description: string;
  timestamp: string;
  metadata?: Record<string, string>;
}

const ACTIVITY_ICONS: Record<ActivityItem["type"], typeof CheckCircle2> = {
  submission: CheckCircle2,
  cycle_status: RefreshCcw,
  cycle_created: PlayCircle,
  team_created: FolderPlus,
  user_invited: UserPlus,
};

const ACTIVITY_COLORS: Record<ActivityItem["type"], string> = {
  submission: "text-success bg-success-tint",
  cycle_status: "text-warning bg-warning-tint",
  cycle_created: "text-info bg-info-tint",
  team_created: "text-gray-900 bg-gray-50",
  user_invited: "text-info bg-info-tint",
};

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function AnimatedNumber({ value }: { value: string | number }) {
  const numericValue = typeof value === "string" ? parseFloat(value) : value;
  const isNumeric = !isNaN(numericValue);
  const suffix = typeof value === "string" ? value.replace(/[\d.]/g, "") : "";
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!isNumeric) return;
    const target = numericValue;
    const duration = 600;
    const start = performance.now();
    const from = 0;

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (target - from) * eased));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [numericValue, isNumeric]);

  return (
    <p className="text-[28px] font-bold text-gray-900 tracking-tight tabular-nums">
      {isNumeric ? `${display}${suffix}` : value}
    </p>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  loading,
  tint,
  iconColor,
}: {
  label: string;
  value: string | number;
  icon: typeof RefreshCcw;
  loading: boolean;
  tint?: string;
  iconColor?: string;
}) {
  return (
    <Card padding="md" className={tint}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-[13px] font-medium text-gray-400 uppercase tracking-wider">
            {label}
          </p>
          {loading ? (
            <Skeleton className="h-8 w-20 mt-1" />
          ) : (
            <AnimatedNumber value={value} />
          )}
        </div>
        <div className={cn("p-2.5", iconColor ?? "text-gray-900")}>
          <Icon size={20} strokeWidth={1.5} />
        </div>
      </div>
    </Card>
  );
}

function ActivityItemRow({ item }: { item: ActivityItem }) {
  const Icon = ACTIVITY_ICONS[item.type];
  const colorClass = ACTIVITY_COLORS[item.type];

  return (
    <div className="flex items-start gap-3 py-3 group">
      <div className={`p-1.5 ${colorClass} shrink-0 mt-0.5`}>
        <Icon size={14} strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-gray-900 truncate">
          {item.title}
        </p>
        <p className="text-[12px] text-gray-500 truncate">{item.description}</p>
      </div>
      <span className="text-[11px] text-gray-400 shrink-0 pt-0.5">
        {formatRelativeTime(item.timestamp)}
      </span>
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <div className="space-y-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 py-3">
          <Skeleton className="h-7 w-7 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-3 w-12 shrink-0" />
        </div>
      ))}
    </div>
  );
}

function CycleSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-48 mb-2" />
        <Skeleton className="h-4 w-36" />
      </CardHeader>
      <div className="space-y-4">
        <Skeleton className="h-2 w-full" />
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[60px] sm:h-[72px]" />
          ))}
        </div>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [allCycles, setAllCycles] = useState<Cycle[]>([]);
  const [cycleIndex, setCycleIndex] = useState(0);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchData() {
    setLoading(true);
    setActivityLoading(true);
    setError(null);
    try {
      const [statsRes, cyclesRes, activityRes] = await Promise.all([
        fetch("/api/dashboard/stats"),
        fetch("/api/cycles?status=ACTIVE"),
        fetch("/api/dashboard/activity"),
      ]);
      const statsJson = await statsRes.json();
      const cyclesJson = await cyclesRes.json();
      const activityJson = await activityRes.json();
      if (!statsJson.success) throw new Error(statsJson.error || "Failed to load stats");
      if (!cyclesJson.success) throw new Error(cyclesJson.error || "Failed to load cycles");
      setStats(statsJson.data);
      setAllCycles(cyclesJson.data as Cycle[]);
      setCycleIndex(0);
      if (activityJson.success) setActivities(activityJson.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
      setActivityLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/api/dashboard/stats", { signal: controller.signal }).then((r) => r.json()),
      fetch("/api/cycles?status=ACTIVE", { signal: controller.signal }).then((r) => r.json()),
      fetch("/api/dashboard/activity", { signal: controller.signal }).then((r) => r.json()),
    ])
      .then(([statsJson, cyclesJson, activityJson]) => {
        if (!statsJson.success) throw new Error(statsJson.error || "Failed to load stats");
        if (!cyclesJson.success) throw new Error(cyclesJson.error || "Failed to load cycles");
        setStats(statsJson.data);
        setAllCycles(cyclesJson.data as Cycle[]);
        setCycleIndex(0);
        if (activityJson.success) setActivities(activityJson.data);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      })
      .finally(() => { setLoading(false); setActivityLoading(false); });
    return () => controller.abort();
  }, []);

  const activeCycle = allCycles.length > 0 ? allCycles[cycleIndex] : null;
  const [now] = useState(() => Date.now());
  const daysLeft = activeCycle
    ? Math.max(0, Math.ceil((new Date(activeCycle.endDate).getTime() - now) / 86400000))
    : 0;

  if (error) {
    return (
      <div>
        <PageHeader title="Dashboard" description="Overview of your organization's evaluation activity" />
        <Card className="max-w-lg mx-auto mt-12 text-center">
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="p-3 bg-error-tint">
              <AlertCircle size={24} strokeWidth={1.5} className="text-error" />
            </div>
            <div>
              <p className="text-[15px] font-medium text-gray-900">Something went wrong</p>
              <p className="text-[13px] text-gray-500 mt-1">{error}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={fetchData}>
              Try again
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const completedCount = activeCycle?.submittedCount ?? 0;
  const pendingCount = activeCycle?.pendingCount ?? 0;

  const completionRate = stats?.completionRate ?? 0;
  const pendingReviews = stats?.pendingReviews ?? 0;

  const statItems = [
    {
      label: "Active Cycles",
      value: stats?.activeCycles ?? 0,
      icon: RefreshCcw,
      iconColor: "text-accent",
      tint: undefined,
    },
    {
      label: "Total Teams",
      value: stats?.totalTeams ?? 0,
      icon: Users,
      iconColor: "text-info",
      tint: undefined,
    },
    {
      label: "Pending Reviews",
      value: pendingReviews,
      icon: ClipboardCheck,
      iconColor: "text-warning",
      tint: pendingReviews > 0 ? "bg-warning-tint" : undefined,
    },
    {
      label: "Completion",
      value: `${completionRate}%`,
      icon: TrendingUp,
      iconColor: "text-success",
      tint: completionRate >= 75
        ? "bg-success-tint"
        : completionRate >= 40
          ? "bg-warning-tint"
          : completionRate > 0
            ? "bg-error-tint"
            : undefined,
    },
  ];

  return (
    <div>
      <PageHeader title="Dashboard" description="Overview of your organization's evaluation activity">
        <Link href="/cycles/new">
          <Button size="sm">
            <Plus size={16} strokeWidth={2} className="mr-1.5" />
            New Cycle
          </Button>
        </Link>
      </PageHeader>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statItems.map((stat) => (
          <StatCard key={stat.label} {...stat} loading={loading} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Active Cycle — 2 columns */}
        <div className="lg:col-span-2 space-y-6">
          {loading ? (
            <CycleSkeleton />
          ) : activeCycle ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{activeCycle.name}</CardTitle>
                    <CardDescription className="flex items-center gap-2 mt-1">
                      <Calendar size={13} strokeWidth={1.5} className="text-gray-400" />
                      Ends{" "}
                      {new Date(activeCycle.endDate).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {daysLeft <= 7 && daysLeft > 0 && (
                      <Badge variant="warning">{daysLeft}d left</Badge>
                    )}
                    <Badge variant="success">Active</Badge>
                  </div>
                </div>
              </CardHeader>

              <div className="space-y-5">
                {/* Progress bar */}
                <div>
                  <div className="flex justify-between text-[13px] mb-2.5">
                    <span className="text-gray-500 font-medium">Overall Progress</span>
                    <span className="font-semibold text-gray-700">
                      {stats?.completionRate ?? 0}%
                    </span>
                  </div>
                  <Progress value={stats?.completionRate ?? 0} semantic />
                </div>

                {/* Breakdown mini cards */}
                <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
                  <div className="text-center p-2 sm:p-4 border border-gray-900">
                    <p className="text-[20px] sm:text-[24px] font-bold text-gray-900 tracking-tight">
                      {activeCycle._count.assignments}
                    </p>
                    <p className="text-[11px] sm:text-[12px] font-medium text-gray-500 mt-0.5">Total</p>
                  </div>
                  <div className="text-center p-2 sm:p-4 border border-success/30 bg-success-tint">
                    <p className="text-[20px] sm:text-[24px] font-bold text-success tracking-tight">
                      {completedCount}
                    </p>
                    <p className="text-[11px] sm:text-[12px] font-medium text-success mt-0.5">Completed</p>
                  </div>
                  <div className="text-center p-2 sm:p-4 border border-warning/30 bg-warning-tint">
                    <p className="text-[20px] sm:text-[24px] font-bold text-warning tracking-tight">
                      {pendingCount}
                    </p>
                    <p className="text-[11px] sm:text-[12px] font-medium text-warning mt-0.5">Pending</p>
                  </div>
                </div>

                {/* Actions row + cycle navigation */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 pt-1">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/cycles/${activeCycle.id}`}
                      className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-900 underline"
                    >
                      View cycle details <ChevronRight size={14} strokeWidth={2} />
                    </Link>
                    <span className="text-gray-200">|</span>
                    <Link
                      href="/cycles"
                      className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-500 hover:text-gray-700"
                    >
                      All cycles <ArrowRight size={13} strokeWidth={2} />
                    </Link>
                  </div>

                  {allCycles.length > 1 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-gray-400 mr-1">
                        {cycleIndex + 1}/{allCycles.length}
                      </span>
                      <button
                        onClick={() => setCycleIndex((i) => Math.max(0, i - 1))}
                        disabled={cycleIndex === 0}
                        className="p-1 hover:bg-gray-50 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        <ChevronLeft size={16} strokeWidth={1.5} />
                      </button>
                      <button
                        onClick={() => setCycleIndex((i) => Math.min(allCycles.length - 1, i + 1))}
                        disabled={cycleIndex === allCycles.length - 1}
                        className="p-1 hover:bg-gray-50 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        <ChevronRight size={16} strokeWidth={1.5} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ) : (
            <Card>
              <div className="flex flex-col items-center gap-4 py-12 text-center">
                <div className="p-4 bg-info-tint">
                  <Clock size={28} strokeWidth={1.5} className="text-info" />
                </div>
                <div>
                  <p className="text-[15px] font-medium text-gray-700">
                    No active evaluation cycles
                  </p>
                  <p className="text-[13px] text-gray-400 mt-1">
                    Create a cycle to start collecting feedback
                  </p>
                </div>
                <Link href="/cycles/new">
                  <Button size="sm">
                    <Plus size={16} strokeWidth={2} className="mr-1.5" />
                    Create Cycle
                  </Button>
                </Link>
              </div>
            </Card>
          )}

          {/* Quick Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Link href="/teams/new" className="group">
              <Card padding="sm" className="flex items-center gap-3">
                <div className="p-2 text-gray-900">
                  <Users size={16} strokeWidth={1.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-gray-900">New Team</p>
                  <p className="text-[11px] text-gray-400">Add a team</p>
                </div>
                <ChevronRight
                  size={14}
                  strokeWidth={1.5}
                  className="text-gray-300"
                />
              </Card>
            </Link>
            <Link href="/templates/new" className="group">
              <Card padding="sm" className="flex items-center gap-3">
                <div className="p-2 text-gray-900">
                  <ClipboardCheck size={16} strokeWidth={1.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-gray-900">New Template</p>
                  <p className="text-[11px] text-gray-400">Build a form</p>
                </div>
                <ChevronRight
                  size={14}
                  strokeWidth={1.5}
                  className="text-gray-300"
                />
              </Card>
            </Link>
            <Link href="/people" className="group">
              <Card padding="sm" className="flex items-center gap-3">
                <div className="p-2 text-gray-900">
                  <Send size={16} strokeWidth={1.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-gray-900">Invite People</p>
                  <p className="text-[11px] text-gray-400">Manage users</p>
                </div>
                <ChevronRight
                  size={14}
                  strokeWidth={1.5}
                  className="text-gray-300"
                />
              </Card>
            </Link>
          </div>
        </div>

        {/* Recent Activity — compact, scrollable */}
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Activity</CardTitle>
            {activities.length > 0 && (
              <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                Live
              </span>
            )}
          </CardHeader>

          {activityLoading ? (
            <ActivitySkeleton />
          ) : activities.length > 0 ? (
            <div className="max-h-[360px] overflow-y-auto divide-y divide-gray-100 -mr-2 pr-2">
              {activities.map((item) => (
                <ActivityItemRow key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <div className="p-3 bg-info-tint">
                <Clock size={20} strokeWidth={1.5} className="text-info" />
              </div>
              <div>
                <p className="text-[13px] font-medium text-gray-500">No activity yet</p>
                <p className="text-[12px] text-gray-400 mt-0.5">
                  Activity will appear as your team starts using the platform
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
