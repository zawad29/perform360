"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/page-header";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { ScoreDistributionChart } from "@/components/reports/score-distribution-chart";
import { CompletionDonutChart } from "@/components/reports/completion-donut-chart";
import { StatusBreakdownChart } from "@/components/reports/status-breakdown-chart";
import { TeamScoreChart } from "@/components/reports/team-score-chart";
import { DirectionScoreChart } from "@/components/reports/direction-score-chart";
import { SubmissionTrendChart } from "@/components/reports/submission-trend-chart";
import { ScoreLineageChip } from "@/components/reports/score-lineage";
import { UnlockGate, useEncryptionUnlock } from "@/components/encryption/unlock-gate";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Play,
  Send,
  CheckCircle2,
  Clock,
  AlertCircle,
  ChevronRight,
  Search,
  Users,
  BarChart3,
  ClipboardList,
  TrendingUp,
  TrendingDown,
  Trophy,
  AlertTriangle,
  Trash2,
  XCircle,
  RotateCcw,
  MoreHorizontal,
  Scale,
  FileSpreadsheet,
  Link2,
  Check,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import type { CycleReport } from "@/types/report";
import { CalibrationPanel, type CalibrationData } from "@/components/cycles/calibration-panel";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Pagination } from "@/components/ui/pagination";
import { DIRECTION_LABELS, DIRECTIONS, type Direction } from "@/lib/directions";
import type { DirectionWeights } from "@/types/report";
import { RoutingMatrix, type MatrixTemplate } from "@/components/cycles/routing-matrix";
import type { TemplateOptionSection } from "@/app/(dashboard)/cycles/new/_components/types";

// ─── Types ───

interface CycleTeamTemplateEntry {
  id: string;
  name: string;
  description: string | null;
  levelIds: string[];
  weightPreset: string | null;
  weightsMember: DirectionWeights | null;
  weightsManager: DirectionWeights | null;
  sections: TemplateOptionSection[];
}

interface CycleTeamMember {
  userId: string;
  name: string;
  role: "MANAGER" | "MEMBER" | "EXTERNAL" | "IMPERSONATOR";
  levelId: string | null;
  levelName: string | null;
}

interface TeamTemplate {
  teamId: string;
  teamName: string;
  members: CycleTeamMember[];
  templates: CycleTeamTemplateEntry[];
}

interface CycleApiData {
  id: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "CLOSED" | "ARCHIVED";
  teamTemplates: TeamTemplate[];
  startDate: string;
  endDate: string;
  stats: {
    totalAssignments: number;
    submittedAssignments: number;
    inProgressAssignments: number;
    pendingAssignments: number;
    completionRate: number;
  };
}

interface AssignmentWithNames {
  id: string;
  token: string;
  subjectId: string;
  reviewerId: string;
  subjectName: string;
  reviewerName: string;
  direction: Direction;
  status: "SUBMITTED" | "IN_PROGRESS" | "PENDING";
  teamId: string;
  teamName: string;
  isImpersonator: boolean;
}

// ─── Constants ───

type StatusFilterValue = "all" | "PENDING" | "IN_PROGRESS" | "SUBMITTED";
type DirectionFilterValue = "all" | Direction;

const TEAMS_PER_PAGE = 50;
const ASSIGNMENTS_PER_PAGE = 20;
const REPORTS_PER_PAGE = 20;

const statusIcon: Record<string, React.ReactNode> = {
  SUBMITTED: (
    <CheckCircle2 size={14} strokeWidth={1.5} className="text-gray-900" />
  ),
  IN_PROGRESS: (
    <Clock size={14} strokeWidth={1.5} className="text-gray-900" />
  ),
  PENDING: (
    <AlertCircle size={14} strokeWidth={1.5} className="text-gray-400" />
  ),
};

const statusLabel: Record<string, string> = {
  SUBMITTED: "Submitted",
  IN_PROGRESS: "In Progress",
  PENDING: "Pending",
};

const statusBadgeVariant: Record<
  string,
  "success" | "warning" | "default" | "outline"
> = {
  DRAFT: "outline",
  ACTIVE: "success",
  CLOSED: "warning",
  ARCHIVED: "default",
};

interface PerformerPerson {
  subjectId: string;
  subjectName: string;
  overallScore: number;
  weightedOverallScore?: number | null;
  calibratedScore?: number | null;
}

function IndividualReportRow({
  person,
  cycleId,
  showTemplate,
}: {
  person: {
    subjectId: string;
    subjectName: string;
    overallScore: number;
    weightedOverallScore: number | null;
    calibratedScore: number | null;
    reviewCount: number;
    completedCount: number;
    primaryTemplateName: string | null;
  };
  cycleId: string;
  showTemplate: boolean;
}) {
  return (
    <Link href={`/cycles/${cycleId}/reports/${person.subjectId}`}>
      <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer group gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={person.subjectName} size="md" />
          <div className="min-w-0">
            <p className="text-[14px] font-medium text-gray-900 truncate">
              {person.subjectName}
            </p>
            <p className="text-[12px] text-gray-500 flex items-center gap-1.5 flex-wrap">
              <span>
                {person.completedCount}/{person.reviewCount} reviews completed
              </span>
              {showTemplate && person.primaryTemplateName && (
                <>
                  <span className="text-gray-300">·</span>
                  <span className="text-gray-500">{person.primaryTemplateName}</span>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {person.completedCount > 0 && (
            <ScoreLineageChip
              raw={person.overallScore}
              weighted={person.weightedOverallScore}
              calibrated={person.calibratedScore}
            />
          )}
          <ChevronRight
            size={16}
            strokeWidth={1.5}
            className="text-gray-300 group-hover:text-gray-500"
          />
        </div>
      </div>
    </Link>
  );
}

function PerformerList({
  title,
  icon,
  people,
  cycleId,
  showRankTrophy,
}: {
  title: string;
  icon: React.ReactNode;
  people: PerformerPerson[];
  cycleId: string;
  showRankTrophy?: boolean;
}) {
  return (
    <Card padding="sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          {icon}
          <CardTitle>{title}</CardTitle>
        </div>
      </CardHeader>
      <div className="divide-y divide-gray-50">
        {people.map((person, idx) => (
          <Link key={person.subjectId} href={`/cycles/${cycleId}/reports/${person.subjectId}`}>
            <div className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 group gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-[12px] font-semibold text-gray-400 w-5 text-center shrink-0">
                  {showRankTrophy && idx === 0 ? (
                    <Trophy size={14} strokeWidth={1.5} className="text-gray-900 inline" />
                  ) : (
                    idx + 1
                  )}
                </span>
                <Avatar name={person.subjectName} size="sm" />
                <span className="text-[14px] font-medium text-gray-900 truncate">
                  {person.subjectName}
                </span>
              </div>
              <ScoreLineageChip
                raw={person.overallScore}
                weighted={person.weightedOverallScore ?? null}
                calibrated={person.calibratedScore ?? null}
              />
            </div>
          </Link>
        ))}
      </div>
    </Card>
  );
}

// ─── Page ───

export default function CycleDetailPage() {
  const router = useRouter();
  const { cycleId } = useParams<{ cycleId: string }>();
  const [cycle, setCycle] = useState<CycleApiData | null>(null);
  const [cycleReport, setCycleReport] = useState<CycleReport | null>(null);
  const [activeTab, setActiveTab] = useState<
    "overview" | "assignments" | "reports" | "calibration"
  >("overview");
  const [calibrationData, setCalibrationData] = useState<CalibrationData | null>(null);
  const [calibrationLoading, setCalibrationLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("all");
  const [directionFilter, setDirectionFilter] =
    useState<DirectionFilterValue>("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [reportTeamFilter, setReportTeamFilter] = useState("all");
  const [reportSearch, setReportSearch] = useState("");
  const [groupByTemplate, setGroupByTemplate] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [teamTemplatePage, setTeamTemplatePage] = useState(1);
  const [routingTeamId, setRoutingTeamId] = useState<string | null>(null);
  const [assignmentPageByKey, setAssignmentPageByKey] = useState<Record<string, number>>({});
  const [reportPageByKey, setReportPageByKey] = useState<Record<string, number>>({});
  const [assignmentsData, setAssignmentsData] = useState<AssignmentWithNames[] | null>(null);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [assignmentsFailed, setAssignmentsFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [showActivateDialog, setShowActivateDialog] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activatePassphrase, setActivatePassphrase] = useState("");
  const [activateError, setActivateError] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [closing, setClosing] = useState(false);
  const [showReopenDialog, setShowReopenDialog] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [reopenEndDate, setReopenEndDate] = useState("");
  const [exportingExcel, setExportingExcel] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { locked, reset, handleApiResponse, handleUnlocked } = useEncryptionUnlock();
  const { addToast } = useToast();

  async function fetchCycle() {
    setLoading(true);
    try {
      const res = await fetch(`/api/cycles/${cycleId}`);
      const json = await res.json();
      if (json.success) setCycle(json.data);
    } catch {
      // handled by null state
    } finally {
      setLoading(false);
    }
  }

  const assignmentsFetchingRef = useRef(false);
  async function fetchAssignments() {
    if (assignmentsData || assignmentsFetchingRef.current) return;
    assignmentsFetchingRef.current = true;
    setAssignmentsLoading(true);
    setAssignmentsFailed(false);
    try {
      const res = await fetch(`/api/cycles/${cycleId}/assignments`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success) {
        setAssignmentsData(json.data);
      } else {
        setAssignmentsFailed(true);
      }
    } catch {
      setAssignmentsFailed(true);
    } finally {
      assignmentsFetchingRef.current = false;
      setAssignmentsLoading(false);
    }
  }

  const reportFetchingRef = useRef(false);
  async function fetchReport() {
    if (reportFetchingRef.current) return;
    reportFetchingRef.current = true;
    setReportLoading(true);
    try {
      const res = await fetch(`/api/reports/cycle/${cycleId}`);
      const json = await res.json();
      if (handleApiResponse(json)) return;
      if (json.success) setCycleReport(json.data);
    } catch {
      // handled by null state
    } finally {
      setReportLoading(false);
      reportFetchingRef.current = false;
    }
  }

  useEffect(() => {
    fetch(`/api/cycles/${cycleId}`)
      .then((r) => r.json())
      .then((json) => { if (json.success) setCycle(json.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [cycleId]);

  const calibrationFetchingRef = useRef(false);
  async function fetchCalibration() {
    if (calibrationData || calibrationFetchingRef.current) return;
    calibrationFetchingRef.current = true;
    setCalibrationLoading(true);
    try {
      const res = await fetch(`/api/cycles/${cycleId}/calibration`);
      const json = await res.json();
      if (handleApiResponse(json)) return;
      if (json.success) setCalibrationData(json.data);
    } catch {
      // handled by null state
    } finally {
      calibrationFetchingRef.current = false;
      setCalibrationLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === "assignments") {
      fetch(`/api/cycles/${cycleId}/assignments`)
        .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then((json) => { if (json.success) setAssignmentsData(json.data); else setAssignmentsFailed(true); })
        .catch(() => setAssignmentsFailed(true))
        .finally(() => setAssignmentsLoading(false));
    }
    if (activeTab === "reports") {
      fetch(`/api/reports/cycle/${cycleId}`)
        .then((r) => r.json())
        .then((json) => { if (!handleApiResponse(json) && json.success) setCycleReport(json.data); })
        .catch(() => {})
        .finally(() => setReportLoading(false));
    }
    if (activeTab === "calibration") {
      fetch(`/api/cycles/${cycleId}/calibration`)
        .then((r) => r.json())
        .then((json) => { if (!handleApiResponse(json) && json.success) setCalibrationData(json.data); })
        .catch(() => {})
        .finally(() => setCalibrationLoading(false));
    }
  }, [activeTab, cycleId, handleApiResponse]);

  // ─── Filtered assignments ───

  const assignments = useMemo(
    () => assignmentsData ?? [],
    [assignmentsData]
  );

  const filteredAssignments = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return assignments.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (directionFilter !== "all" && a.direction !== directionFilter)
        return false;
      if (teamFilter !== "all" && a.teamId !== teamFilter) return false;
      if (
        query &&
        !a.subjectName.toLowerCase().includes(query) &&
        !a.reviewerName.toLowerCase().includes(query)
      )
        return false;
      return true;
    });
  }, [assignments, statusFilter, directionFilter, teamFilter, searchQuery]);

  const assignmentFilterKey = useMemo(
    () => `${statusFilter}:${directionFilter}:${teamFilter}:${searchQuery}`,
    [statusFilter, directionFilter, teamFilter, searchQuery]
  );
  const assignmentPage = assignmentPageByKey[assignmentFilterKey] ?? 1;
  function setAssignmentPage(page: number) {
    setAssignmentPageByKey((prev) => ({ ...prev, [assignmentFilterKey]: page }));
  }

  const assignmentTotalPages = Math.ceil(filteredAssignments.length / ASSIGNMENTS_PER_PAGE);
  const paginatedAssignments = useMemo(() => {
    const start = (assignmentPage - 1) * ASSIGNMENTS_PER_PAGE;
    return filteredAssignments.slice(start, start + ASSIGNMENTS_PER_PAGE);
  }, [filteredAssignments, assignmentPage]);

  // Group paginated assignments by team
  const groupedByTeam = useMemo(() => {
    const groups = new Map<string, { teamName: string; items: AssignmentWithNames[] }>();
    for (const a of paginatedAssignments) {
      const group = groups.get(a.teamId) ?? { teamName: a.teamName, items: [] };
      group.items.push(a);
      groups.set(a.teamId, group);
    }
    return Array.from(groups.entries()).map(([teamId, g]) => ({
      teamId,
      teamName: g.teamName,
      items: g.items,
    }));
  }, [paginatedAssignments]);

  const activeFilterCount = [
    statusFilter !== "all",
    directionFilter !== "all",
    teamFilter !== "all",
    searchQuery.trim() !== "",
  ].filter(Boolean).length;

  // ─── Report computed data ───

  const hasCalibratedScores = cycleReport?.individualSummaries?.some(
    (s) => s.calibratedScore !== null && s.calibratedScore !== undefined
  ) ?? false;

  const hasWeightedScores = cycleReport?.individualSummaries?.some(
    (s) => s.weightedOverallScore !== null && s.weightedOverallScore !== undefined
  ) ?? false;

  const getBestScore = useCallback(
    (s: { overallScore: number; weightedOverallScore?: number | null; calibratedScore?: number | null }) =>
      s.calibratedScore != null
        ? s.calibratedScore
        : hasWeightedScores && s.weightedOverallScore != null
          ? s.weightedOverallScore
          : s.overallScore,
    [hasWeightedScores]
  );

  const avgScore =
    cycleReport?.individualSummaries &&
    cycleReport.individualSummaries.length > 0
      ? cycleReport.individualSummaries.reduce(
          (sum, s) => sum + getBestScore(s),
          0
        ) / cycleReport.individualSummaries.length
      : 0;

  // Resolve which subjects belong to which team(s) for report filtering
  const subjectTeamMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const a of assignments) {
      const teams = map.get(a.subjectId) ?? new Set<string>();
      teams.add(a.teamId);
      map.set(a.subjectId, teams);
    }
    return map;
  }, [assignments]);

  const filteredReportSummaries = useMemo(() => {
    if (!cycleReport) return [];
    let list = cycleReport.individualSummaries;
    if (reportTeamFilter !== "all") {
      list = list.filter((s) => subjectTeamMap.get(s.subjectId)?.has(reportTeamFilter));
    }
    if (reportSearch.trim()) {
      const q = reportSearch.trim().toLowerCase();
      list = list.filter((s) => s.subjectName.toLowerCase().includes(q));
    }
    return list;
  }, [cycleReport, reportTeamFilter, reportSearch, subjectTeamMap]);

  const reportFilterKey = useMemo(
    () => `${reportTeamFilter}:${reportSearch}`,
    [reportTeamFilter, reportSearch]
  );
  const reportPage = reportPageByKey[reportFilterKey] ?? 1;
  function setReportPage(page: number) {
    setReportPageByKey((prev) => ({ ...prev, [reportFilterKey]: page }));
  }

  const reportTotalPages = Math.ceil(filteredReportSummaries.length / REPORTS_PER_PAGE);
  const paginatedReportSummaries = useMemo(() => {
    const start = (reportPage - 1) * REPORTS_PER_PAGE;
    return filteredReportSummaries.slice(start, start + REPORTS_PER_PAGE);
  }, [filteredReportSummaries, reportPage]);

  const getDisplayScore = useCallback(
    (s: { overallScore: number; weightedOverallScore?: number | null; calibratedScore?: number | null }) =>
      s.calibratedScore != null
        ? s.calibratedScore
        : hasWeightedScores && s.weightedOverallScore != null
          ? s.weightedOverallScore
          : s.overallScore,
    [hasWeightedScores]
  );

  const topPerformers = useMemo(() => {
    return [...filteredReportSummaries]
      .filter((s) => s.completedCount > 0 && getDisplayScore(s) > 0)
      .sort((a, b) => getDisplayScore(b) - getDisplayScore(a))
      .slice(0, 5);
  }, [filteredReportSummaries, getDisplayScore]);

  const bottomPerformers = useMemo(() => {
    return [...filteredReportSummaries]
      .filter((s) => s.completedCount > 0 && getDisplayScore(s) > 0)
      .sort((a, b) => getDisplayScore(a) - getDisplayScore(b))
      .slice(0, 5);
  }, [filteredReportSummaries, getDisplayScore]);

  // ─── Handlers ───


  async function handleExportExcel() {
    setExportingExcel(true);
    try {
      const res = await fetch(`/api/reports/cycle/${cycleId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: "excel" }),
      });
      const json = await res.json();
      if (handleApiResponse(json)) return;
      if (!json.success) {
        throw new Error(json.error || "Failed to start export");
      }
      addToast("Excel export started — check your email shortly", "success");
    } catch (err) {
      addToast(
        err instanceof Error ? err.message : "Failed to start export",
        "error"
      );
    } finally {
      setExportingExcel(false);
    }
  }

  async function handleRemind() {
    setReminding(true);
    try {
      const res = await fetch(`/api/cycles/${cycleId}/remind`, {
        method: "POST",
      });
      const json = await res.json();
      if (json.success) {
        addToast(
          `Reminders sent to ${json.data.totalPending} reviewer${json.data.totalPending !== 1 ? "s" : ""}`,
          "success"
        );
      } else {
        addToast(json.error ?? "Failed to send reminders", "error");
      }
    } catch {
      addToast("Failed to send reminders", "error");
    } finally {
      setReminding(false);
    }
  }

  async function handleRemindIndividual(
    assignmentId: string,
    reviewerName: string
  ) {
    setRemindingId(assignmentId);
    try {
      const res = await fetch(`/api/cycles/${cycleId}/remind`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId }),
      });
      const json = await res.json();
      if (json.success && json.data.totalPending > 0) {
        addToast(`Reminder sent to ${reviewerName}`, "success");
      } else if (json.success && json.data.totalPending === 0) {
        addToast(json.data.message ?? "No reminder sent", "warning");
      } else {
        addToast(json.error ?? "Failed to send reminder", "error");
      }
    } catch {
      addToast("Failed to send reminder", "error");
    } finally {
      setRemindingId(null);
    }
  }

  async function handleActivate() {
    setActivating(true);
    setActivateError("");
    try {
      // 1. Unlock encryption with the provided passphrase
      const unlockRes = await fetch("/api/encryption/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase: activatePassphrase }),
      });
      const unlockJson = await unlockRes.json();
      if (!unlockJson.success) {
        setActivateError(unlockJson.error ?? "Incorrect passphrase");
        return;
      }

      // 2. Activate the cycle
      const res = await fetch(`/api/cycles/${cycleId}/activate`, {
        method: "POST",
      });
      const json = await res.json();
      if (json.success) {
        setShowActivateDialog(false);
        addToast(
          `Cycle activated — invitation emails are being sent to reviewers`,
          "success"
        );
        setAssignmentsData(null);
        setAssignmentsFailed(false);
        fetchCycle();
      } else {
        addToast(json.error ?? "Failed to activate cycle", "error");
      }
    } catch {
      addToast("Failed to activate cycle", "error");
    } finally {
      setActivating(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/cycles/${cycleId}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        addToast("Cycle deleted", "success");
        router.push("/cycles");
      } else {
        addToast(json.error ?? "Failed to delete cycle", "error");
      }
    } catch {
      addToast("Failed to delete cycle", "error");
    } finally {
      setDeleting(false);
    }
  }

  async function handleClose() {
    setClosing(true);
    try {
      const todayIso = new Date().toISOString().split("T")[0];
      const res = await fetch(`/api/cycles/${cycleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CLOSED", endDate: todayIso }),
      });
      const json = await res.json();
      if (json.success) {
        setShowCloseDialog(false);
        addToast("Cycle closed", "success");
        fetchCycle();
      } else {
        addToast(json.error ?? "Failed to close cycle", "error");
      }
    } catch {
      addToast("Failed to close cycle", "error");
    } finally {
      setClosing(false);
    }
  }

  async function handleReopen() {
    setReopening(true);
    try {
      const body: Record<string, string> = { status: "ACTIVE" };
      if (reopenEndDate) body.endDate = reopenEndDate;
      const res = await fetch(`/api/cycles/${cycleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        setShowReopenDialog(false);
        setReopenEndDate("");
        addToast("Cycle reopened", "success");
        fetchCycle();
      } else {
        addToast(json.error ?? "Failed to reopen cycle", "error");
      }
    } catch {
      addToast("Failed to reopen cycle", "error");
    } finally {
      setReopening(false);
    }
  }

  function copyLink(assignmentId: string, token: string) {
    const url = `${window.location.origin}/evaluate/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(assignmentId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  function clearFilters() {
    setStatusFilter("all");
    setDirectionFilter("all");
    setTeamFilter("all");
    setSearchQuery("");
  }

  // ─── Render ───

  if (loading) return <CycleSkeleton />;
  if (!cycle) {
    return (
      <Card className="text-center py-12">
        <p className="text-body text-gray-500">Cycle not found</p>
      </Card>
    );
  }

  return (
    <div>
      <Breadcrumb items={[{ label: "Cycles", href: "/cycles" }, { label: cycle.name }]} />
      <PageHeader
        title={cycle.name}
        description={`${cycle.teamTemplates.length} team${cycle.teamTemplates.length !== 1 ? "s" : ""} \u00B7 ${new Date(cycle.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })} \u2013 ${new Date(cycle.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
      >
        <Badge variant={statusBadgeVariant[cycle.status]}>
          {cycle.status.charAt(0) + cycle.status.slice(1).toLowerCase()}
        </Badge>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 w-9 p-0" aria-label="More actions">
              <MoreHorizontal size={18} strokeWidth={1.5} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {cycle.status === "DRAFT" && (
              <DropdownMenuItem onClick={() => setShowActivateDialog(true)}>
                <Play size={15} strokeWidth={1.5} className="mr-2" />
                Activate
              </DropdownMenuItem>
            )}
            {cycle.status === "ACTIVE" && (
              <DropdownMenuItem onClick={handleRemind} disabled={reminding}>
                <Send size={15} strokeWidth={1.5} className="mr-2" />
                {reminding ? "Sending…" : "Send Reminders"}
              </DropdownMenuItem>
            )}
            {activeTab === "reports" && (
              <DropdownMenuItem onClick={handleExportExcel} disabled={exportingExcel}>
                <FileSpreadsheet size={15} strokeWidth={1.5} className="mr-2" />
                {exportingExcel ? "Starting export…" : "Export Excel"}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {cycle.status === "ACTIVE" && (
              <DropdownMenuItem
                onClick={() => setShowCloseDialog(true)}
                className="text-red-500 focus:text-red-600"
              >
                <XCircle size={15} strokeWidth={1.5} className="mr-2" />
                End Cycle
              </DropdownMenuItem>
            )}
            {cycle.status === "CLOSED" && (
              <DropdownMenuItem onClick={() => setShowReopenDialog(true)}>
                <RotateCcw size={15} strokeWidth={1.5} className="mr-2" />
                Reopen Cycle
              </DropdownMenuItem>
            )}
            {cycle.status === "DRAFT" && (
              <DropdownMenuItem
                onClick={() => setShowDeleteDialog(true)}
                className="text-red-500 focus:text-red-600"
              >
                <Trash2 size={15} strokeWidth={1.5} className="mr-2" />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </PageHeader>

      {/* ─── Top-Level Tabs ─── */}
      <Tabs
        value={activeTab}
        onValueChange={(v) =>
          setActiveTab(v as "overview" | "assignments" | "reports" | "calibration")
        }
      >
        <TabsList>
          <TabsTrigger value="overview">
            <BarChart3 size={15} strokeWidth={1.5} className="mr-1.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="assignments">
            <ClipboardList size={15} strokeWidth={1.5} className="mr-1.5" />
            Assignments
            {cycle.stats.totalAssignments > 0 && (
              <span className="ml-1.5 text-[11px] font-normal text-gray-600 px-1.5 py-0.5 min-w-[20px] text-center">
                {cycle.stats.totalAssignments}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="reports">
            <Users size={15} strokeWidth={1.5} className="mr-1.5" />
            Reports
          </TabsTrigger>
          {(cycle.status === "CLOSED" || cycle.status === "ARCHIVED") && (
            <TabsTrigger value="calibration">
              <Scale size={15} strokeWidth={1.5} className="mr-1.5" />
              Calibration
            </TabsTrigger>
          )}
        </TabsList>

        {/* ─── Overview Tab ─── */}
        <TabsContent value="overview">
          {/* Completion Donut + Status Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <Card padding="md">
              <CardHeader>
                <CardTitle>Completion Progress</CardTitle>
              </CardHeader>
              <div className="flex justify-center py-2">
                <CompletionDonutChart
                  completed={cycle.stats.submittedAssignments}
                  total={cycle.stats.totalAssignments}
                />
              </div>
            </Card>
            <Card padding="md">
              <CardHeader>
                <CardTitle>Status Breakdown</CardTitle>
              </CardHeader>
              <StatusBreakdownChart
                submitted={cycle.stats.submittedAssignments}
                inProgress={cycle.stats.inProgressAssignments}
                pending={cycle.stats.pendingAssignments}
              />
            </Card>
          </div>

          {/* Team-Template Pairs */}
          {cycle.teamTemplates.length > 0 && (() => {
            const teamTotalPages = Math.ceil(cycle.teamTemplates.length / TEAMS_PER_PAGE);
            const teamStart = (teamTemplatePage - 1) * TEAMS_PER_PAGE;
            const paginatedTeams = cycle.teamTemplates.slice(teamStart, teamStart + TEAMS_PER_PAGE);
            return (
              <Card padding="sm">
                <CardHeader>
                  <CardTitle>Teams & Templates</CardTitle>
                </CardHeader>
                <div className="divide-y divide-gray-50">
                  {paginatedTeams.map((tt) => (
                    <div key={tt.teamId} className="px-4 py-2.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-[14px] font-medium text-gray-900 truncate">
                          {tt.teamName}
                        </span>
                        <div className="flex items-center gap-1 flex-wrap">
                          {tt.templates.length === 0 ? (
                            <Badge variant="outline" className="shrink-0">No templates</Badge>
                          ) : (
                            tt.templates.map((tpl) => (
                              <Badge key={tpl.id} variant="outline" className="shrink-0">
                                {tpl.name}
                                {tpl.levelIds.length > 0 && (
                                  <span className="ml-1 text-[10px] text-gray-400">
                                    ({tpl.levelIds.length} {tpl.levelIds.length === 1 ? "level" : "levels"})
                                  </span>
                                )}
                              </Badge>
                            ))
                          )}
                        </div>
                      </div>
                      {tt.templates.some((t) => t.weightsMember || t.weightsManager) && (
                        <div className="mt-2 space-y-1">
                          {tt.templates
                            .filter((t) => t.weightsMember || t.weightsManager)
                            .map((tpl) => {
                              const w = tpl.weightsMember ?? tpl.weightsManager!;
                              return (
                                <div key={tpl.id} className="flex items-center gap-3 text-[11px] text-gray-400 flex-wrap">
                                  <span className="text-gray-500">{tpl.name} weights:</span>
                                  <span>↓ {w.downward}%</span>
                                  <span>↑ {w.upward}%</span>
                                  <span>↔ {w.lateral}%</span>
                                  <span>↻ {w.self}%</span>
                                  <span>→ {w.external}%</span>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <Pagination
                  page={teamTemplatePage}
                  totalPages={teamTotalPages}
                  total={cycle.teamTemplates.length}
                  showing={paginatedTeams.length}
                  noun="teams"
                  onPageChange={setTeamTemplatePage}
                />
              </Card>
            );
          })()}

          {/* Routing preview — only meaningful while the cycle is DRAFT.
              For ACTIVE/CLOSED cycles the assignments are real and live on the
              Assignments tab; showing a "what would happen" view here would be
              misleading. Single-team selector keeps the page from flooding. */}
          {cycle.status === "DRAFT" && cycle.teamTemplates.length > 0 && (() => {
            const activeTeamId = routingTeamId ?? cycle.teamTemplates[0].teamId;
            const activeTeam =
              cycle.teamTemplates.find((tt) => tt.teamId === activeTeamId) ?? cycle.teamTemplates[0];
            const matrixTemplates: MatrixTemplate[] = activeTeam.templates.map((tpl) => ({
              id: tpl.id,
              name: tpl.name,
              description: tpl.description ?? null,
              levelIds: tpl.levelIds,
              sections: tpl.sections,
              weightsMember: tpl.weightsMember,
              weightsManager: tpl.weightsManager,
            }));
            return (
              <div className="space-y-3 mt-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <h3 className="text-[14px] font-medium uppercase tracking-caps text-gray-700">
                    Routing preview
                  </h3>
                  <Select
                    value={activeTeam.teamId}
                    onValueChange={(v) => setRoutingTeamId(v)}
                  >
                    <SelectTrigger className="w-auto h-8 min-w-[180px] text-[13px]">
                      <SelectValue placeholder="Select team" />
                    </SelectTrigger>
                    <SelectContent>
                      {cycle.teamTemplates.map((tt) => (
                        <SelectItem key={tt.teamId} value={tt.teamId}>
                          {tt.teamName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <RoutingMatrix
                  key={activeTeam.teamId}
                  teamName={activeTeam.teamName}
                  members={activeTeam.members.map((m) => ({
                    userId: m.userId,
                    name: m.name,
                    levelId: m.levelId,
                    levelName: m.levelName,
                    role: m.role,
                  }))}
                  templates={matrixTemplates}
                />
              </div>
            );
          })()}
        </TabsContent>

        {/* ─── Assignments Tab ─── */}
        <TabsContent value="assignments">
          {assignmentsLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : assignmentsFailed ? (
            <Card padding="md">
              <p className="text-center text-gray-500 py-8 text-sm">
                Failed to load assignments.{" "}
                <button
                  className="text-gray-900 underline"
                  onClick={() => {
                    setAssignmentsData(null);
                    assignmentsFetchingRef.current = false;
                    fetchAssignments();
                  }}
                >
                  Retry
                </button>
              </p>
            </Card>
          ) : !assignmentsData ? null : (<>
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4 flex-wrap">
            {/* Status segmented control */}
            <div className="inline-flex items-center gap-0.5 bg-gray-100 p-1 overflow-x-auto shrink-0">
              {(
                [
                  { value: "all", label: "All" },
                  { value: "PENDING", label: "Pending" },
                  { value: "IN_PROGRESS", label: "In Progress" },
                  { value: "SUBMITTED", label: "Submitted" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setStatusFilter(opt.value)}
                  className={`px-3 py-1.5 text-[13px] font-medium ${
                    statusFilter === opt.value
                      ? "bg-white text-gray-900"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Team dropdown */}
            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger className="w-auto h-9 min-w-[130px] text-[13px]">
                <SelectValue placeholder="Team" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Teams</SelectItem>
                {cycle.teamTemplates.map((tt) => (
                  <SelectItem key={tt.teamId} value={tt.teamId}>
                    {tt.teamName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Direction dropdown */}
            <Select
              value={directionFilter}
              onValueChange={(v) =>
                setDirectionFilter(v as DirectionFilterValue)
              }
            >
              <SelectTrigger className="w-auto h-9 min-w-[150px] text-[13px]">
                <SelectValue placeholder="Direction" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Directions</SelectItem>
                {DIRECTIONS.map((d) => (
                  <SelectItem key={d.key} value={d.key}>
                    {d.glyph} {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Search input */}
            <div className="relative flex-1 w-full sm:min-w-[180px]">
              <Search
                size={15}
                strokeWidth={1.5}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="Search by name\u2026"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-9 pr-3 border border-gray-900 bg-white text-[13px] placeholder:text-gray-400 focus:outline-none focus:outline-2 focus:outline-accent focus:outline-offset-2"
              />
            </div>

            {/* Clear filters */}
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="text-[12px] text-gray-900 underline font-medium whitespace-nowrap"
              >
                Clear filters ({activeFilterCount})
              </button>
            )}
          </div>

          {/* Results count */}
          <div className="flex items-center justify-between mb-3">
            <p className="text-[12px] text-gray-400">
              {filteredAssignments.length} of {assignments.length} assignment
              {assignments.length !== 1 ? "s" : ""}
              {groupedByTeam.length > 1 &&
                ` across ${groupedByTeam.length} teams`}
            </p>
          </div>

          {/* Grouped Assignments Table */}
          {filteredAssignments.length === 0 ? (
            <Card className="py-12">
              <div className="flex flex-col items-center gap-2">
                <Search
                  size={24}
                  strokeWidth={1.5}
                  className="text-gray-300"
                />
                <p className="text-[14px] text-gray-400">
                  {activeFilterCount > 0
                    ? "No assignments match your filters"
                    : "No assignments found"}
                </p>
                {activeFilterCount > 0 && (
                  <button
                    onClick={clearFilters}
                    className="text-[13px] text-gray-900 underline font-medium"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            </Card>
          ) : (
            <div className="space-y-4">
              {groupedByTeam.map((group) => (
                <Card key={group.teamId} padding="sm">
                  {/* Team header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <Users
                        size={15}
                        strokeWidth={1.5}
                        className="text-gray-400"
                      />
                      <span className="text-[14px] font-semibold text-gray-900">
                        {group.teamName}
                      </span>
                    </div>
                    <span className="text-[12px] text-gray-400">
                      {group.items.filter((a) => a.status === "SUBMITTED").length}
                      /{group.items.length} completed
                    </span>
                  </div>
                  <div className="overflow-x-auto -mx-1 sm:mx-0">
                    <table className="w-full min-w-[420px] sm:min-w-0">
                      <thead>
                        <tr className="border-b border-gray-50">
                          <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-caps px-4 py-2">
                            Subject
                          </th>
                          <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-caps px-4 py-2">
                            Reviewer
                          </th>
                          <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-caps px-4 py-2">
                            Direction
                          </th>
                          <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-caps px-4 py-2">
                            Status
                          </th>
                          <th className="px-4 py-2 w-10" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {group.items.map((a) => (
                          <tr
                            key={a.id}
                            className="hover:bg-gray-50"
                          >
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <Avatar name={a.subjectName} size="sm" />
                                <span className="text-[13px] font-medium text-gray-900">
                                  {a.subjectName}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <Avatar name={a.reviewerName} size="sm" />
                                <span className="text-[13px] text-gray-700">
                                  {a.reviewerName}
                                </span>
                                {a.isImpersonator && (
                                  <Badge variant="error" className="text-[10px] px-1.5 py-0">
                                    Impersonator
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2.5">
                              <Badge variant="outline">
                                {DIRECTION_LABELS[a.direction] ?? a.direction}
                              </Badge>
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  {statusIcon[a.status]}
                                  <span className="text-[12px] text-gray-600">
                                    {statusLabel[a.status]}
                                  </span>
                                </div>
                                {cycle.status === "ACTIVE" &&
                                  a.status !== "SUBMITTED" && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      disabled={remindingId === a.id}
                                      onClick={() =>
                                        handleRemindIndividual(
                                          a.id,
                                          a.reviewerName
                                        )
                                      }
                                    >
                                      <Send
                                        size={14}
                                        strokeWidth={1.5}
                                        className="mr-1"
                                      />
                                      {remindingId === a.id
                                        ? "Sending\u2026"
                                        : "Remind"}
                                    </Button>
                                  )}
                              </div>
                            </td>
                            <td className="px-2 py-2.5">
                              <button
                                onClick={() => copyLink(a.id, a.token)}
                                title="Copy evaluation link"
                                className="p-1.5 hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                              >
                                {copiedId === a.id
                                  ? <Check size={14} strokeWidth={2} className="text-green-600" />
                                  : <Link2 size={14} strokeWidth={1.5} />
                                }
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              ))}
              <Pagination
                page={assignmentPage}
                totalPages={assignmentTotalPages}
                total={filteredAssignments.length}
                showing={paginatedAssignments.length}
                noun="assignments"
                onPageChange={setAssignmentPage}
              />
            </div>
          )}
          </>)}
        </TabsContent>

        {/* ─── Reports Tab ─── */}
        <TabsContent value="reports">
          {locked || reset ? (
            <UnlockGate
              locked={locked}
              reset={reset}
              onUnlocked={() => {
                handleUnlocked();
                setCycleReport(null);
                reportFetchingRef.current = false;
                fetchReport();
              }}
            >
              <div />
            </UnlockGate>
          ) : reportLoading ? (
            <ReportSkeleton />
          ) : cycleReport ? (
            <>
              {/* Template legend — shows what templates scored this cycle and how many subjects each one was primary for */}
              {cycleReport.templatesUsed.length > 1 && (
                <div className="border border-gray-200 bg-gray-50/60 px-4 py-3 mb-4">
                  <div className="flex items-start gap-2 flex-wrap">
                    <span className="text-[12px] font-medium uppercase tracking-caps text-gray-500 mt-0.5 shrink-0">
                      Templates in this cycle
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {cycleReport.templatesUsed.map((t) => (
                        <Badge key={t.templateId} variant="outline" className="text-[11px]">
                          {t.templateName}
                          <span className="ml-1.5 text-gray-400">{t.subjectCount}</span>
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1.5">
                    Subjects were scored against different forms — comparing scores side-by-side across templates is approximate.
                    Use <span className="text-gray-700 font-medium">Group by template</span> below to compare like-with-like.
                  </p>
                </div>
              )}

              {/* Summary Stats + Team Filter */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <h3 className="text-headline text-gray-900">Summary</h3>
                {cycle.teamTemplates.length > 1 && (
                  <Select
                    value={reportTeamFilter}
                    onValueChange={setReportTeamFilter}
                  >
                    <SelectTrigger className="w-auto h-9 min-w-[160px] text-[13px]">
                      <SelectValue placeholder="Filter by team" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Teams</SelectItem>
                      {cycle.teamTemplates.map((tt) => (
                        <SelectItem key={tt.teamId} value={tt.teamId}>
                          {tt.teamName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <Card padding="md" className="text-center">
                  <p className="text-callout text-gray-500">Completion Rate</p>
                  <p className="text-title-small text-gray-900 mt-1">
                    {cycleReport.completionRate}%
                  </p>
                  <Progress
                    value={cycleReport.completionRate}
                    className="mt-2"
                    semantic
                  />
                </Card>
                <Card padding="md" className="text-center">
                  <p className="text-callout text-gray-500">Avg Score</p>
                  <p className="text-title-small text-gray-900 mt-1">
                    {avgScore.toFixed(2)}
                  </p>
                  <p className="text-[12px] text-gray-400 mt-1">
                    {hasCalibratedScores ? "calibrated" : "out of 5.0"}
                  </p>
                </Card>
                <Card padding="md" className="text-center">
                  <p className="text-callout text-gray-500">Participants</p>
                  <p className="text-title-small text-gray-900 mt-1">
                    {filteredReportSummaries.length}
                  </p>
                  <p className="text-[12px] text-gray-400 mt-1">
                    {reportTeamFilter !== "all" ? "in team" : "individuals"}
                  </p>
                </Card>
              </div>

              {/* Submission Trend */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Submission Timeline</CardTitle>
                </CardHeader>
                <SubmissionTrendChart data={cycleReport.submissionTrend} />
              </Card>

              {/* Score Distribution + Relationship Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Score Distribution</CardTitle>
                  </CardHeader>
                  <ScoreDistributionChart
                    distribution={cycleReport.scoreDistribution}
                  />
                </Card>
                {cycleReport.avgScoreByDirection && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Scores by Direction</CardTitle>
                    </CardHeader>
                    <DirectionScoreChart
                      downward={cycleReport.avgScoreByDirection.downward}
                      upward={cycleReport.avgScoreByDirection.upward}
                      lateral={cycleReport.avgScoreByDirection.lateral}
                      self={cycleReport.avgScoreByDirection.self}
                      external={cycleReport.avgScoreByDirection.external}
                    />
                  </Card>
                )}
              </div>

              {/* Avg Score by Team */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Average Score by Team</CardTitle>
                </CardHeader>
                <TeamScoreChart
                  teams={cycleReport.avgScoreByTeam.map((t) => ({
                    teamName: t.teamName,
                    avgScore: t.calibratedAvgScore ?? t.weightedAvgScore ?? t.avgScore,
                    rawAvgScore: t.weightedAvgScore ?? t.avgScore,
                    hasCalibration: t.calibratedAvgScore != null,
                  }))}
                />
                {/* Per-template breakouts for teams with multi-template routing */}
                {cycleReport.avgScoreByTeam.some((t) => t.byTemplate.length > 0) && (
                  <div className="border-t border-gray-100 mt-4 pt-3 px-4 pb-4 space-y-3">
                    <p className="text-[11px] font-medium uppercase tracking-caps text-gray-500">
                      By template (multi-template teams)
                    </p>
                    {cycleReport.avgScoreByTeam
                      .filter((t) => t.byTemplate.length > 0)
                      .map((t) => (
                        <div key={t.teamId}>
                          <p className="text-[12px] font-medium text-gray-700 mb-1">
                            {t.teamName}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {t.byTemplate.map((bt) => (
                              <span
                                key={bt.templateId}
                                className="inline-flex items-center gap-1 border border-gray-200 bg-white px-2 py-1 text-[11px]"
                              >
                                <span className="text-gray-700">{bt.templateName}</span>
                                <span className="text-gray-400">·</span>
                                <span className="text-gray-400">{bt.subjectCount}</span>
                                <span className="text-gray-400">·</span>
                                <span className="font-semibold text-gray-900 tabular-nums">
                                  {bt.avgScore.toFixed(1)}
                                </span>
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </Card>

              {/* Team Completion */}
              {cycleReport.teamCompletionRates.length > 0 && (
                <Card padding="sm" className="mb-6">
                  <CardHeader>
                    <CardTitle>Team Completion</CardTitle>
                  </CardHeader>
                  <div className="space-y-3 px-4 pb-4">
                    {cycleReport.teamCompletionRates.map((team) => (
                      <div key={team.teamId}>
                        <div className="flex justify-between text-[14px] mb-1">
                          <span className="text-gray-700">
                            {team.teamName}
                          </span>
                          <span className="text-gray-500">
                            {team.completed}/{team.total} ({team.rate}%)
                          </span>
                        </div>
                        <Progress value={team.rate} semantic />
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Group-by-template toggle (only shown when more than one template was used) */}
              {cycleReport.templatesUsed.length > 1 && (
                <label className="inline-flex items-center gap-2 cursor-pointer mb-4">
                  <input
                    type="checkbox"
                    checked={groupByTemplate}
                    onChange={(e) => setGroupByTemplate(e.target.checked)}
                    className="border-gray-300"
                  />
                  <span className="text-[13px] text-gray-700">
                    Group performers and reports by template
                  </span>
                </label>
              )}

              {/* Top & Bottom Performers */}
              {topPerformers.length > 0 && !groupByTemplate && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <PerformerList
                    title="Top Performers"
                    icon={<TrendingUp size={16} strokeWidth={1.5} className="text-gray-900" />}
                    people={topPerformers}
                    cycleId={cycleId}
                    showRankTrophy
                  />
                  <PerformerList
                    title="Needs Improvement"
                    icon={<TrendingDown size={16} strokeWidth={1.5} className="text-gray-900" />}
                    people={bottomPerformers}
                    cycleId={cycleId}
                  />
                </div>
              )}

              {/* When grouped by template: per-template Top/Bottom mini-lists */}
              {topPerformers.length > 0 && groupByTemplate && (
                <div className="space-y-6 mb-6">
                  {cycleReport.templatesUsed.map((tpl) => {
                    const inTpl = filteredReportSummaries.filter(
                      (s) => s.primaryTemplateId === tpl.templateId && s.completedCount > 0 && getDisplayScore(s) > 0
                    );
                    if (inTpl.length === 0) return null;
                    const sortedDesc = [...inTpl].sort((a, b) => getDisplayScore(b) - getDisplayScore(a));
                    const tplTop = sortedDesc.slice(0, 5);
                    const tplBottom = [...sortedDesc].reverse().slice(0, 5);
                    return (
                      <div key={tpl.templateId}>
                        <p className="text-[12px] font-medium uppercase tracking-caps text-gray-500 mb-2">
                          {tpl.templateName} <span className="text-gray-400">· {tpl.subjectCount} subjects</span>
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <PerformerList
                            title="Top"
                            icon={<TrendingUp size={16} strokeWidth={1.5} className="text-gray-900" />}
                            people={tplTop}
                            cycleId={cycleId}
                            showRankTrophy
                          />
                          <PerformerList
                            title="Bottom"
                            icon={<TrendingDown size={16} strokeWidth={1.5} className="text-gray-900" />}
                            people={tplBottom}
                            cycleId={cycleId}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Individual Reports List */}
              <Card padding="sm">
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full">
                    <CardTitle className="shrink-0">
                      {reportTeamFilter !== "all"
                        ? "Team Individual Reports"
                        : "All Individual Reports"}
                    </CardTitle>
                    <div className="relative sm:ml-auto w-full sm:w-56">
                      <Search size={14} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Search by name..."
                        value={reportSearch}
                        onChange={(e) => setReportSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-[13px] border border-gray-200 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500"
                      />
                    </div>
                  </div>
                </CardHeader>
                {filteredReportSummaries.length === 0 ? (
                  <p className="text-center py-8 text-[14px] text-gray-400">
                    {reportSearch.trim()
                      ? `No reports match "${reportSearch}"`
                      : `No individual reports available${reportTeamFilter !== "all" ? " for this team" : ""}`}
                  </p>
                ) : groupByTemplate && cycleReport.templatesUsed.length > 1 ? (
                  <div className="space-y-4 px-4 pb-4">
                    {cycleReport.templatesUsed.map((tpl) => {
                      const inTpl = filteredReportSummaries.filter(
                        (s) => s.primaryTemplateId === tpl.templateId
                      );
                      if (inTpl.length === 0) return null;
                      return (
                        <div key={tpl.templateId} className="border border-gray-100">
                          <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                            <p className="text-[12px] font-medium uppercase tracking-caps text-gray-700">
                              {tpl.templateName}
                            </p>
                            <span className="text-[11px] text-gray-400">{inTpl.length}</span>
                          </div>
                          <div className="divide-y divide-gray-50">
                            {inTpl.map((person) => (
                              <IndividualReportRow
                                key={person.subjectId}
                                person={person}
                                cycleId={cycleId}
                                showTemplate={false}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {paginatedReportSummaries.map((person) => (
                      <IndividualReportRow
                        key={person.subjectId}
                        person={person}
                        cycleId={cycleId}
                        showTemplate={cycleReport.templatesUsed.length > 1}
                      />
                    ))}
                  </div>
                )}
                {!groupByTemplate && filteredReportSummaries.length > 0 && (
                  <Pagination
                    page={reportPage}
                    totalPages={reportTotalPages}
                    total={filteredReportSummaries.length}
                    showing={paginatedReportSummaries.length}
                    noun="reports"
                    onPageChange={setReportPage}
                    className="px-4 pb-4"
                  />
                )}
              </Card>
            </>
          ) : (
            <Card className="text-center py-12">
              <p className="text-body text-gray-500">
                Failed to load report data
              </p>
              <Button
                variant="secondary"
                onClick={() => {
                  setCycleReport(null);
                  reportFetchingRef.current = false;
                  fetchReport();
                }}
                className="mt-4"
              >
                Retry
              </Button>
            </Card>
          )}
        </TabsContent>

        {/* ─── Calibration Tab ─── */}
        {(cycle.status === "CLOSED" || cycle.status === "ARCHIVED") && (
          <TabsContent value="calibration">
            {locked || reset ? (
              <UnlockGate
                locked={locked}
                reset={reset}
                onUnlocked={() => {
                  handleUnlocked();
                  setCalibrationData(null);
                  fetchCalibration();
                }}
              >
                <div />
              </UnlockGate>
            ) : calibrationLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-64 w-full" />
              </div>
            ) : calibrationData ? (
              <CalibrationPanel
                cycleId={cycleId}
                data={calibrationData}
                readOnly={cycle.status === "ARCHIVED"}
                onSaved={() => {
                  setCalibrationData(null);
                  fetchCalibration();
                }}
              />
            ) : (
              <Card className="text-center py-12">
                <p className="text-body text-gray-500">
                  Failed to load calibration data
                </p>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setCalibrationData(null);
                    fetchCalibration();
                  }}
                  className="mt-4"
                >
                  Retry
                </Button>
              </Card>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* ─── Activate Confirmation Dialog ─── */}
      <Dialog
        open={showActivateDialog}
        onOpenChange={(open) => {
          setShowActivateDialog(open);
          if (!open) {
            setActivatePassphrase("");
            setActivateError("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Activate this cycle?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. Please review the consequences below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 my-4">
            <div className="flex items-start gap-3 border border-gray-900 px-4 py-3">
              <AlertTriangle
                size={18}
                strokeWidth={1.5}
                className="text-gray-900 mt-0.5 shrink-0"
              />
              <ul className="text-[13px] text-gray-900 space-y-1.5">
                <li>
                  <strong>Invitation emails</strong> will be sent immediately to
                  all assigned reviewers.
                </li>
                <li>
                  The cycle will move from <strong>Draft to Active</strong> — you
                  will no longer be able to edit teams, templates, or delete the
                  cycle.
                </li>
                <li>
                  Unique evaluation links will become <strong>live</strong> and
                  accessible to reviewers.
                </li>
                <li>
                  Assignments are <strong>locked</strong> and cannot be modified
                  after activation.
                </li>
              </ul>
            </div>
            <p className="text-[13px] text-gray-500">
              {cycle.stats.totalAssignments} assignment
              {cycle.stats.totalAssignments !== 1 ? "s" : ""} across{" "}
              {cycle.teamTemplates.length} team
              {cycle.teamTemplates.length !== 1 ? "s" : ""} will be activated.
            </p>
            <Input
              id="activate-passphrase"
              label="Encryption Passphrase"
              type="password"
              placeholder="Enter your passphrase to confirm"
              value={activatePassphrase}
              onChange={(e) => {
                setActivatePassphrase(e.target.value);
                setActivateError("");
              }}
              autoFocus={false}
            />
            {activateError && (
              <p className="text-[13px] text-red-600">{activateError}</p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setShowActivateDialog(false)}
              disabled={activating}
            >
              Cancel
            </Button>
            <Button onClick={handleActivate} disabled={activating || !activatePassphrase}>
              {activating ? (
                "Activating\u2026"
              ) : (
                <>
                  <Play size={16} strokeWidth={1.5} className="mr-1.5" />
                  Activate Cycle
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirmation Dialog ─── */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this cycle?</DialogTitle>
            <DialogDescription>
              This will permanently delete the cycle and all its assignments.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-3 border border-gray-900 px-4 py-3 my-4">
            <AlertTriangle
              size={18}
              strokeWidth={1.5}
              className="text-gray-900 mt-0.5 shrink-0"
            />
            <p className="text-[13px] text-gray-900">
              <strong>{cycle.stats.totalAssignments} assignment
              {cycle.stats.totalAssignments !== 1 ? "s" : ""}</strong> across{" "}
              {cycle.teamTemplates.length} team
              {cycle.teamTemplates.length !== 1 ? "s" : ""} will be permanently
              removed. This action cannot be undone.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setShowDeleteDialog(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                "Deleting\u2026"
              ) : (
                <>
                  <Trash2 size={16} strokeWidth={1.5} className="mr-1.5" />
                  Delete Cycle
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Close Cycle Confirmation Dialog ─── */}
      <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End this cycle?</DialogTitle>
            <DialogDescription>
              This will close the cycle and stop accepting new submissions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 my-4">
            <div className="flex items-start gap-3 border border-gray-900 px-4 py-3">
              <AlertTriangle
                size={18}
                strokeWidth={1.5}
                className="text-gray-900 mt-0.5 shrink-0"
              />
              <ul className="text-[13px] text-gray-900 space-y-1.5">
                <li>
                  All <strong>evaluation links will be deactivated</strong> —
                  reviewers will no longer be able to submit responses.
                </li>
                <li>
                  <strong>
                    {cycle.stats.pendingAssignments + cycle.stats.inProgressAssignments} pending/in-progress
                  </strong>{" "}
                  assignment
                  {cycle.stats.pendingAssignments + cycle.stats.inProgressAssignments !== 1 ? "s" : ""}{" "}
                  will remain incomplete and cannot be submitted after closing.
                </li>
                <li>
                  Only <strong>{cycle.stats.submittedAssignments}</strong> of{" "}
                  <strong>{cycle.stats.totalAssignments}</strong> assignment
                  {cycle.stats.totalAssignments !== 1 ? "s" : ""} have been
                  submitted ({cycle.stats.completionRate}% complete).
                </li>
                <li>
                  You can <strong>reopen</strong> the cycle later if needed.
                </li>
              </ul>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setShowCloseDialog(false)}
              disabled={closing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleClose}
              disabled={closing}
            >
              {closing ? (
                "Closing\u2026"
              ) : (
                <>
                  <XCircle size={16} strokeWidth={1.5} className="mr-1.5" />
                  End Cycle
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Reopen Cycle Confirmation Dialog ─── */}
      <Dialog
        open={showReopenDialog}
        onOpenChange={(open) => {
          setShowReopenDialog(open);
          if (!open) setReopenEndDate("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reopen this cycle?</DialogTitle>
            <DialogDescription>
              This will reactivate the cycle and allow reviewers to submit
              responses again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 my-4">
            <div className="flex items-start gap-3 border border-gray-900 px-4 py-3">
              <AlertTriangle
                size={18}
                strokeWidth={1.5}
                className="text-gray-900 mt-0.5 shrink-0"
              />
              <ul className="text-[13px] text-gray-900 space-y-1.5">
                <li>
                  All evaluation links will become <strong>active again</strong>{" "}
                  — reviewers with pending assignments can submit responses.
                </li>
                <li>
                  <strong>
                    {cycle.stats.pendingAssignments + cycle.stats.inProgressAssignments} incomplete
                  </strong>{" "}
                  assignment
                  {cycle.stats.pendingAssignments + cycle.stats.inProgressAssignments !== 1 ? "s" : ""}{" "}
                  will be reopened for submission.
                </li>
                <li>
                  Already submitted responses ({cycle.stats.submittedAssignments})
                  will <strong>not be affected</strong>.
                </li>
              </ul>
            </div>
            <Input
              id="reopen-end-date"
              label="New End Date"
              type="date"
              value={reopenEndDate}
              onChange={(e) => setReopenEndDate(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setShowReopenDialog(false)}
              disabled={reopening}
            >
              Cancel
            </Button>
            <Button onClick={handleReopen} disabled={reopening || !reopenEndDate}>
              {reopening ? (
                "Reopening\u2026"
              ) : (
                <>
                  <RotateCcw size={16} strokeWidth={1.5} className="mr-1.5" />
                  Reopen Cycle
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}

// ─── Skeletons ───

function CycleSkeleton() {
  return (
    <div>
      <Skeleton className="h-8 w-64 mb-2" />
      <Skeleton className="h-4 w-48 mb-8" />
      <div className="inline-flex gap-1 mb-6">
        <Skeleton className="h-10 w-28" />
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-24" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
      <Skeleton className="h-16 mb-6" />
      <Skeleton className="h-32" />
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-40" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-72" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
      <Skeleton className="h-48" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
