"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CompetencyRadarChart } from "@/components/reports/radar-chart";
import { ScoreBreakdown } from "@/components/reports/score-breakdown";
import { ScoreGauge } from "@/components/reports/score-gauge";
import { ScoreLabel } from "@/components/reports/score-label";
import { DirectionScoreChart } from "@/components/reports/direction-score-chart";
import { KeyInsights } from "@/components/reports/key-insights";
import { QuestionInsights } from "@/components/reports/question-insights";
import { ProfileBanner } from "@/components/reports/profile-banner";
import { SelfVsOthersChart } from "@/components/reports/self-vs-others-chart";
import { UnlockGate, useEncryptionUnlock } from "@/components/encryption/unlock-gate";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Download, ArrowLeft, Users, BarChart3, Radar, ListChecks, MessageSquareText, ChevronRight, ChevronLeft, TrendingUp, TrendingDown, Minus, Sparkles, Loader2, AlertTriangle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DIRECTION_LABELS, type Direction } from "@/lib/directions";
import type { IndividualReport, TeamBreakdown } from "@/types/report";

export default function IndividualReportPage() {
  const { cycleId, userId } = useParams<{ cycleId: string; userId: string }>();
  const [report, setReport] = useState<IndividualReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTeam, setSelectedTeam] = useState("all");
  const { locked, reset, handleApiResponse, handleUnlocked } = useEncryptionUnlock();

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/cycle/${cycleId}/user/${userId}`);
      const json = await res.json();
      if (handleApiResponse(json)) return;
      if (!json.success) {
        setError(json.error ?? "Failed to load report");
        return;
      }
      setReport(json.data);
    } catch {
      setError("Failed to load report");
    } finally {
      setLoading(false);
    }
  }, [cycleId, userId, handleApiResponse]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  function handleExport() {
    window.open(`/api/reports/cycle/${cycleId}/export?userId=${userId}`, "_blank");
  }

  if (locked || reset) {
    return (
      <div>
        <BackLink cycleId={cycleId} userId={userId} />
        <UnlockGate locked={locked} reset={reset} onUnlocked={() => { handleUnlocked(); fetchReport(); }}>
          <div />
        </UnlockGate>
      </div>
    );
  }

  if (loading) return <ReportSkeleton />;

  if (error || !report) {
    return (
      <div>
        <BackLink cycleId={cycleId} userId={userId} />
        <Card className="text-center py-12">
          <p className="text-body text-gray-500">{error ?? "Report not found"}</p>
          <Button variant="secondary" onClick={fetchReport} className="mt-4">
            Retry
          </Button>
        </Card>
      </div>
    );
  }

  // Derive display data based on selected team
  const selectedBreakdown = selectedTeam === "all"
    ? null
    : report.teamBreakdowns.find((t) => t.teamId === selectedTeam) ?? null;

  const displayData: ReportDisplayData = selectedBreakdown ?? report;

  const showTeamSelector = report.teamBreakdowns.length > 1;

  return (
    <ReportContent
      report={report}
      displayData={displayData}
      cycleId={cycleId}
      onExport={handleExport}
      selectedTeam={selectedTeam}
      onSelectTeam={setSelectedTeam}
      showTeamSelector={showTeamSelector}
    />
  );
}

// ─── Shared display data shape ───

type ReportDisplayData = Pick<
  IndividualReport | TeamBreakdown,
  "overallScore" | "categoryScores" | "scoresByDirection" | "questionDetails" | "textFeedback"
> & {
  weightedOverallScore?: number | null;
  weightedCategoryScores?: import("@/types/report").CategoryScore[] | null;
  appliedWeights?: import("@/types/report").DirectionWeights | null;
  calibratedScore?: number | null;
  calibrationJustification?: string | null;
};

// ─── Tab definitions ───

type ReportTab = "overview" | "competencies" | "questions" | "feedback";

const TABS: { id: ReportTab; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Overview", icon: <BarChart3 size={15} strokeWidth={1.5} /> },
  { id: "competencies", label: "Competencies", icon: <Radar size={15} strokeWidth={1.5} /> },
  { id: "questions", label: "Questions", icon: <ListChecks size={15} strokeWidth={1.5} /> },
  { id: "feedback", label: "Feedback", icon: <MessageSquareText size={15} strokeWidth={1.5} /> },
];

// ─── Main Report Content ───

function ReportContent({
  report,
  displayData,
  cycleId,
  onExport,
  selectedTeam,
  onSelectTeam,
  showTeamSelector,
}: {
  report: IndividualReport;
  displayData: ReportDisplayData;
  cycleId: string;
  onExport: () => void;
  selectedTeam: string;
  onSelectTeam: (team: string) => void;
  showTeamSelector: boolean;
}) {
  const isSummaryView = showTeamSelector && selectedTeam === "all";

  return (
    <div>
      {/* ─── Top Bar ─── */}
      <div className="flex items-center justify-between mb-4">
        <BackLink cycleId={cycleId} userId={report.subjectId} />
        <div className="flex items-center gap-2">
          {report.calibratedScore != null && (
            <Badge variant="info">Calibrated</Badge>
          )}
          <Button variant="secondary" onClick={onExport}>
            <Download size={16} strokeWidth={1.5} className="mr-1.5" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* ─── Always visible: Profile Banner ─── */}
      <ProfileBanner
        subjectName={report.subjectName}
        cycleName={report.cycleName}
        context={report.subjectContext}
        responseRate={report.responseRate}
        reviewerBreakdown={report.reviewerBreakdown}
      />

      {/* ─── Team Selector ─── */}
      {showTeamSelector && (
        <div className="flex items-center gap-2 mb-6">
          <Users size={16} strokeWidth={1.5} className="text-gray-400" />
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => onSelectTeam("all")}
              className={`px-3 py-1.5 text-[13px] font-medium ${
                selectedTeam === "all"
                  ? "bg-gray-900 text-white"
                  : "border border-gray-900 text-gray-900 hover:bg-gray-50"
              }`}
            >
              Summary
            </button>
            {report.teamBreakdowns.map((tb) => (
              <button
                key={tb.teamId}
                onClick={() => onSelectTeam(tb.teamId)}
                className={`px-3 py-1.5 text-[13px] font-medium ${
                  selectedTeam === tb.teamId
                    ? "bg-gray-900 text-white"
                    : "border border-gray-900 text-gray-900 hover:bg-gray-50"
                }`}
              >
                {tb.teamName}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─── Summary View (cross-team comparison) ─── */}
      {isSummaryView ? (
        <SummaryView
          report={report}
          onSelectTeam={onSelectTeam}
        />
      ) : (
        <TeamDetailView
          report={report}
          displayData={displayData}
          selectedTeam={selectedTeam}
        />
      )}
    </div>
  );
}

// ─── Summary: Cross-team comparison dashboard ───

function scoreColor(score: number, max: number = 5): string {
  const pct = score / max;
  if (pct >= 0.8) return "#E63946";
  return "#111111";
}

function SummaryView({
  report,
  onSelectTeam,
}: {
  report: IndividualReport;
  onSelectTeam: (team: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<ReportTab>("overview");
  const effectiveScore = report.calibratedScore ?? report.weightedOverallScore ?? report.overallScore;
  const dirScores = report.scoresByDirection;
  const teams = report.teamBreakdowns;

  const teamScores = useMemo(
    () => {
      const mapped = teams.map((t) => ({
        ...t,
        effective: t.calibratedScore ?? t.weightedOverallScore ?? t.overallScore,
      }));
      return [...mapped].sort((a, b) => b.effective - a.effective);
    },
    [teams]
  );

  const scoredQuestions = useMemo(
    () => report.questionDetails.filter((q) => q.averageScore !== null),
    [report.questionDetails]
  );

  const totalResponses = useMemo(
    () =>
      scoredQuestions.length > 0
        ? Math.max(...scoredQuestions.map((q) => q.responseCount))
        : 0,
    [scoredQuestions]
  );

  const feedbackCount = report.textFeedback.reduce((acc, g) => acc + g.responses.length, 0);

  return (
    <>
      {/* ─── Tab Navigation ─── */}
      <div role="tablist" className="flex items-center gap-1 border-b border-gray-100 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-label={tab.label}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-[13px] font-medium uppercase tracking-caps ${
              activeTab === tab.id
                ? "text-gray-900 border-b-2 border-accent"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
            {tab.id === "feedback" && feedbackCount > 0 && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 border border-gray-900">
                {feedbackCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ─── Tab Content ─── */}

      {activeTab === "overview" && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <Card padding="md">
              <CardHeader>
                <CardTitle>Overall Score</CardTitle>
              </CardHeader>
              <ScoreGauge score={effectiveScore} />
              <div className="flex flex-col items-center gap-1.5 mt-1">
                <ScoreLabel score={effectiveScore} />
                <div className="flex items-center gap-4">
                  <span className="text-[12px] text-gray-400">
                    {totalResponses} reviewer{totalResponses !== 1 ? "s" : ""}
                  </span>
                  <span className="text-[12px] text-gray-400">
                    Across {teams.length} teams
                  </span>
                </div>
              </div>
              {report.calibratedScore != null && (
                <p className="text-center text-[11px] text-accent font-medium mt-1">
                  Calibrated
                  {report.weightedOverallScore != null
                    ? ` (weighted: ${report.weightedOverallScore.toFixed(2)}, raw: ${report.overallScore.toFixed(2)})`
                    : ` (raw: ${report.overallScore.toFixed(2)})`}
                </p>
              )}
              {report.calibratedScore == null && report.weightedOverallScore != null && (
                <p className="text-center text-[11px] text-gray-400 mt-1">
                  Weighted (unweighted: {report.overallScore.toFixed(2)})
                </p>
              )}
            </Card>
            <Card padding="md">
              <CardHeader>
                <CardTitle>Scores by Direction</CardTitle>
              </CardHeader>
              <DirectionScoreChart
                downward={dirScores.downward}
                upward={dirScores.upward}
                lateral={dirScores.lateral}
                self={dirScores.self}
                external={dirScores.external}
              />
            </Card>
          </div>

          {/* Team comparison cards */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Score by Team</CardTitle>
            </CardHeader>
            <div className="space-y-3">
              {teamScores.map((team, i) => {
                const pct = (team.effective / 5) * 100;
                const color = scoreColor(team.effective);
                const diff = team.effective - effectiveScore;

                return (
                  <button
                    key={team.teamId}
                    onClick={() => onSelectTeam(team.teamId)}
                    className="w-full text-left group border border-gray-100 hover:bg-gray-50 p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-[12px] font-semibold text-gray-400 tabular-nums w-5 text-center shrink-0">
                          {i + 1}
                        </span>
                        <span className="text-[14px] font-medium text-gray-800 truncate">
                          {team.teamName}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {diff !== 0 && (
                          <span className="flex items-center gap-0.5 text-[11px] font-medium text-gray-900">
                            {diff > 0 ? <TrendingUp size={11} strokeWidth={2} /> : <TrendingDown size={11} strokeWidth={2} />}
                            {diff > 0 ? "+" : ""}{diff.toFixed(1)}
                          </span>
                        )}
                        {diff === 0 && (
                          <span className="flex items-center gap-0.5 text-[11px] font-medium text-gray-400">
                            <Minus size={11} strokeWidth={2} />
                            avg
                          </span>
                        )}
                        <span className="text-[16px] font-bold tabular-nums" style={{ color }}>
                          {team.effective.toFixed(1)}
                        </span>
                        <ChevronRight size={14} strokeWidth={1.5} className="text-gray-300 group-hover:text-gray-500" />
                      </div>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                  </button>
                );
              })}
            </div>
          </Card>

          <KeyInsights
            scoresByDirection={report.scoresByDirection}
            directionQuestionCounts={report.directionQuestionCounts}
            questionDetails={report.questionDetails}
            categoryScores={report.categoryScores}
          />
        </>
      )}

      {activeTab === "competencies" && (
        <>
          <SelfVsOthersChart data={report.selfVsOthers} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <Card>
              <CardHeader>
                <CardTitle>Competency Radar</CardTitle>
              </CardHeader>
              <CompetencyRadarChart
                categories={report.categoryScores}
              />
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Competency Scores</CardTitle>
              </CardHeader>
              <ScoreBreakdown
                categories={report.categoryScores}
              />
            </Card>
          </div>
        </>
      )}

      {activeTab === "questions" && (
        <QuestionInsights questions={report.questionDetails} />
      )}

      {activeTab === "feedback" && (
        <SummaryFeedbackView textFeedback={report.textFeedback} />
      )}
    </>
  );
}

// ─── Summary Feedback: questions paginated (5/page), responses paginated (3/page) ───

const QUESTIONS_PER_PAGE = 5;
const RESPONSES_PER_PAGE = 3;

const DIRECTION_ORDER: Direction[] = ["DOWNWARD", "UPWARD", "LATERAL", "SELF", "EXTERNAL"];

interface QuestionGroup {
  questionId: string;
  questionText: string;
  responses: { text: string; direction: Direction }[];
}

function SummaryFeedbackView({
  textFeedback,
}: {
  textFeedback: IndividualReport["textFeedback"];
}) {
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [questionPage, setQuestionPage] = useState(0);
  // Per-question response page: questionId → page index
  const [responsePages, setResponsePages] = useState<Record<string, number>>({});

  // AI Summary state
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiSections, setAiSections] = useState<{ heading: string; content: string }[]>([]);
  const [aiSectionTab, setAiSectionTab] = useState(0);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const handleSummarize = useCallback(async () => {
    setShowConfirm(false);
    setAiLoading(true);
    setAiError(null);
    setShowSummary(true);

    try {
      const payload = textFeedback.flatMap((group) =>
        group.responses.map((text) => ({
          questionText: group.questionText,
          direction: group.direction,
          text,
        }))
      );

      const res = await fetch("/api/reports/summarize-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: payload }),
      });

      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Summarization failed");
      setAiSummary(json.summary);
      setAiSections(json.sections ?? []);
      setAiSectionTab(0);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Summarization failed");
    } finally {
      setAiLoading(false);
    }
  }, [textFeedback]);

  const handleFilterChange = useCallback((filter: string) => {
    setActiveFilter(filter);
    setQuestionPage(0);
    setResponsePages({});
  }, []);

  // Count responses per direction
  const directionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const group of textFeedback) {
      counts[group.direction] = (counts[group.direction] ?? 0) + group.responses.length;
    }
    return counts;
  }, [textFeedback]);

  const availableDirections = useMemo(
    () => DIRECTION_ORDER.filter((r) => (directionCounts[r] ?? 0) > 0),
    [directionCounts]
  );

  const totalCount = textFeedback.reduce((acc, g) => acc + g.responses.length, 0);

  // Group by question, merge responses across directions
  const questionGroups = useMemo(() => {
    const map = new Map<string, QuestionGroup>();
    for (const group of textFeedback) {
      if (activeFilter !== "all" && group.direction !== activeFilter) continue;
      let entry = map.get(group.questionId);
      if (!entry) {
        entry = { questionId: group.questionId, questionText: group.questionText, responses: [] };
        map.set(group.questionId, entry);
      }
      for (const text of group.responses) {
        entry.responses.push({ text, direction: group.direction });
      }
    }
    return Array.from(map.values());
  }, [textFeedback, activeFilter]);

  const totalQuestionPages = Math.max(1, Math.ceil(questionGroups.length / QUESTIONS_PER_PAGE));
  const visibleQuestions = questionGroups.slice(
    questionPage * QUESTIONS_PER_PAGE,
    (questionPage + 1) * QUESTIONS_PER_PAGE
  );

  const getResponsePage = (questionId: string) => responsePages[questionId] ?? 0;
  const setResponsePage = (questionId: string, page: number) => {
    setResponsePages((prev) => ({ ...prev, [questionId]: page }));
  };

  if (textFeedback.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Open Feedback</CardTitle>
        </CardHeader>
        <p className="text-center py-8 text-callout text-gray-400">
          No open-text feedback submitted.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter pills + AI summarize button */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => handleFilterChange("all")}
            className={`px-3 py-1.5 text-[12px] font-medium ${
              activeFilter === "all"
                ? "bg-gray-900 text-white"
                : "border border-gray-900 text-gray-900 hover:bg-gray-50"
            }`}
          >
            All ({totalCount})
          </button>
          {availableDirections.map((rel) => (
            <button
              key={rel}
              onClick={() => handleFilterChange(rel)}
              className={`px-3 py-1.5 text-[12px] font-medium ${
                activeFilter === rel
                  ? "bg-gray-900 text-white"
                  : "border border-gray-900 text-gray-900 hover:bg-gray-50"
              }`}
            >
              {DIRECTION_LABELS[rel] ?? rel} ({directionCounts[rel]})
            </button>
          ))}
        </div>
        <Button
          variant="secondary"
          onClick={() => aiSummary ? setShowSummary(true) : setShowConfirm(true)}
          className="shrink-0 text-[12px] gap-1.5"
        >
          <Sparkles size={14} strokeWidth={1.5} />
          {aiSummary ? "View Summary" : "AI Summary"}
        </Button>
      </div>

      {/* Confirmation dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Summarize Feedback with AI</DialogTitle>
            <DialogDescription>
              {totalCount} feedback responses will be analyzed to generate a concise summary.
            </DialogDescription>
          </DialogHeader>
          <div className="border border-gray-900 p-3 flex gap-2.5 items-start mt-2">
            <AlertTriangle size={16} strokeWidth={1.5} className="text-gray-900 shrink-0 mt-0.5" />
            <p className="text-[13px] text-gray-900 leading-relaxed">
              Feedback will be sent to your configured Ollama model for processing. Data is only sent to your own Ollama instance — not to any external service.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 mt-4">
            <Button variant="secondary" onClick={() => setShowConfirm(false)}>
              Cancel
            </Button>
            <Button onClick={handleSummarize}>
              <Sparkles size={14} strokeWidth={1.5} className="mr-1.5" />
              Summarize
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Summary result dialog */}
      <Dialog open={showSummary} onOpenChange={setShowSummary}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>AI Feedback Summary</DialogTitle>
            <DialogDescription>
              Generated from {totalCount} feedback responses
            </DialogDescription>
          </DialogHeader>
          {aiLoading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 size={24} strokeWidth={1.5} className="text-gray-400 animate-spin" />
              <p className="text-[13px] text-gray-400">Analyzing feedback...</p>
            </div>
          )}
          {aiError && (
            <div className="border border-gray-900 p-4 mt-2">
              <p className="text-[13px] text-gray-900">{aiError}</p>
              <Button
                variant="secondary"
                onClick={handleSummarize}
                className="mt-3 text-[12px]"
              >
                Retry
              </Button>
            </div>
          )}
          {aiSummary && !aiLoading && aiSections.length > 0 && (
            <div className="mt-2 space-y-4">
              {/* Section tabs */}
              <div className="flex gap-1 border-b border-gray-100">
                {aiSections.map((section, idx) => (
                  <button
                    key={idx}
                    onClick={() => setAiSectionTab(idx)}
                    className={`px-3 py-2 text-[12px] font-medium border-b-2 ${
                      aiSectionTab === idx
                        ? "border-gray-900 text-gray-900"
                        : "border-transparent text-gray-400 hover:text-gray-600"
                    }`}
                  >
                    {section.heading}
                  </button>
                ))}
              </div>
              {/* Active section content */}
              <p className="text-[14px] leading-relaxed text-gray-700">
                {aiSections[aiSectionTab]?.content ?? ""}
              </p>
            </div>
          )}
          {/* Fallback if sections parsing failed */}
          {aiSummary && !aiLoading && aiSections.length === 0 && (
            <p className="mt-2 text-[14px] leading-relaxed text-gray-700">
              {aiSummary}
            </p>
          )}
        </DialogContent>
      </Dialog>

      {/* Question accordions with inner pagination */}
      {questionGroups.length === 0 ? (
        <Card>
          <p className="text-center py-8 text-callout text-gray-400">
            No feedback for this filter.
          </p>
        </Card>
      ) : (
        <>
          {visibleQuestions.map((qGroup) => {
            const rPage = getResponsePage(qGroup.questionId);
            const rTotalPages = Math.max(1, Math.ceil(qGroup.responses.length / RESPONSES_PER_PAGE));
            const visibleResponses = qGroup.responses.slice(
              rPage * RESPONSES_PER_PAGE,
              (rPage + 1) * RESPONSES_PER_PAGE
            );

            return (
              <Card key={qGroup.questionId}>
                <div className="flex items-center gap-2 p-4 pb-0">
                  <span className="text-[14px] font-medium text-gray-800">
                    {qGroup.questionText}
                  </span>
                  <span className="text-[11px] font-semibold text-gray-400 border border-gray-900 px-2 py-0.5 shrink-0">
                    {qGroup.responses.length}
                  </span>
                </div>
                <div className="p-4 pt-3 space-y-2">
                  {visibleResponses.map((item, j) => (
                    <div key={`${rPage}-${j}`} className="border-l-[3px] border-gray-900 pl-4 py-2 space-y-1.5">
                      <Badge variant="outline" className="text-[10px]">
                        {DIRECTION_LABELS[item.direction] ?? item.direction}
                      </Badge>
                      <p className="text-[14px] text-gray-700 leading-relaxed">
                        {item.text}
                      </p>
                    </div>
                  ))}
                </div>
                {rTotalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2.5">
                    <button
                      onClick={() => setResponsePage(qGroup.questionId, rPage - 1)}
                      disabled={rPage === 0}
                      className="flex items-center gap-1 text-[11px] font-medium text-gray-600 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft size={12} strokeWidth={1.5} />
                      Prev
                    </button>
                    <span className="text-[11px] text-gray-400 tabular-nums">
                      {rPage + 1} / {rTotalPages}
                    </span>
                    <button
                      onClick={() => setResponsePage(qGroup.questionId, rPage + 1)}
                      disabled={rPage >= rTotalPages - 1}
                      className="flex items-center gap-1 text-[11px] font-medium text-gray-600 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed"
                    >
                      Next
                      <ChevronRight size={12} strokeWidth={1.5} />
                    </button>
                  </div>
                )}
              </Card>
            );
          })}

          {/* Question-level pagination */}
          {totalQuestionPages > 1 && (
            <div className="flex items-center justify-between px-1 pt-2">
              <button
                onClick={() => { setQuestionPage((p) => p - 1); setResponsePages({}); }}
                disabled={questionPage === 0}
                className="flex items-center gap-1 text-[12px] font-medium text-gray-600 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={14} strokeWidth={1.5} />
                Previous
              </button>
              <span className="text-[12px] text-gray-400 tabular-nums">
                Questions {questionPage * QUESTIONS_PER_PAGE + 1}–{Math.min((questionPage + 1) * QUESTIONS_PER_PAGE, questionGroups.length)} of {questionGroups.length}
              </span>
              <button
                onClick={() => { setQuestionPage((p) => p + 1); setResponsePages({}); }}
                disabled={questionPage >= totalQuestionPages - 1}
                className="flex items-center gap-1 text-[12px] font-medium text-gray-600 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight size={14} strokeWidth={1.5} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Team Detail: Full tabbed report for one team (or single-team users) ───

function TeamDetailView({
  report,
  displayData,
  selectedTeam,
}: {
  report: IndividualReport;
  displayData: ReportDisplayData;
  selectedTeam: string;
}) {
  const [activeTab, setActiveTab] = useState<ReportTab>("overview");
  const dirScores = displayData.scoresByDirection;

  const scoredQuestions = useMemo(
    () => displayData.questionDetails.filter((q) => q.averageScore !== null),
    [displayData.questionDetails]
  );

  const totalResponses = useMemo(
    () =>
      scoredQuestions.length > 0
        ? Math.max(...scoredQuestions.map((q) => q.responseCount))
        : 0,
    [scoredQuestions]
  );

  const effectiveScore = displayData.calibratedScore ?? displayData.weightedOverallScore ?? displayData.overallScore;
  const feedbackCount = displayData.textFeedback.reduce((acc, g) => acc + g.responses.length, 0);

  return (
    <>
      {/* ─── Tab Navigation ─── */}
      <div role="tablist" className="flex items-center gap-1 border-b border-gray-100 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-label={tab.label}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-[13px] font-medium uppercase tracking-caps ${
              activeTab === tab.id
                ? "text-gray-900 border-b-2 border-accent"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
            {tab.id === "feedback" && feedbackCount > 0 && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 border border-gray-900">
                {feedbackCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ─── Tab Content ─── */}

      {activeTab === "overview" && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <Card padding="md">
              <CardHeader>
                <CardTitle>Overall Score</CardTitle>
              </CardHeader>
              <ScoreGauge score={effectiveScore} />
              <div className="flex flex-col items-center gap-1.5 mt-1">
                <ScoreLabel score={effectiveScore} />
                <div className="flex items-center gap-4">
                  <span className="text-[12px] text-gray-400">
                    {totalResponses} reviewer{totalResponses !== 1 ? "s" : ""}
                  </span>
                  <span className="text-[12px] text-gray-400">
                    {displayData.categoryScores.length} competencies
                  </span>
                </div>
              </div>
              {displayData.calibratedScore != null && (
                <p className="text-center text-[11px] text-accent font-medium mt-1">
                  Calibrated
                  {displayData.weightedOverallScore != null
                    ? ` (weighted: ${displayData.weightedOverallScore.toFixed(2)}, raw: ${displayData.overallScore.toFixed(2)})`
                    : ` (raw: ${displayData.overallScore.toFixed(2)})`}
                </p>
              )}
              {displayData.calibratedScore == null && displayData.weightedOverallScore != null && (
                <p className="text-center text-[11px] text-gray-400 mt-1">
                  Weighted (unweighted: {displayData.overallScore.toFixed(2)})
                </p>
              )}
              {displayData.appliedWeights && (
                <div className="flex items-center justify-center gap-2 mt-2 text-[10px] text-gray-400">
                  <span>Down {Math.round(displayData.appliedWeights.downward)}%</span>
                  <span>Up {Math.round(displayData.appliedWeights.upward)}%</span>
                  <span>Lat {Math.round(displayData.appliedWeights.lateral)}%</span>
                  <span>Self {Math.round(displayData.appliedWeights.self)}%</span>
                  <span>Ext {Math.round(displayData.appliedWeights.external)}%</span>
                </div>
              )}
              {displayData.calibrationJustification && (
                <p className="text-center text-[11px] text-gray-400 mt-1 italic">
                  {displayData.calibrationJustification}
                </p>
              )}
            </Card>
            <Card padding="md">
              <CardHeader>
                <CardTitle>Scores by Direction</CardTitle>
              </CardHeader>
              <DirectionScoreChart
                downward={dirScores.downward}
                upward={dirScores.upward}
                lateral={dirScores.lateral}
                self={dirScores.self}
                external={dirScores.external}
              />
            </Card>
          </div>

          <KeyInsights
            scoresByDirection={displayData.scoresByDirection}
            directionQuestionCounts={
              (displayData as IndividualReport).directionQuestionCounts
            }
            questionDetails={displayData.questionDetails}
            categoryScores={displayData.weightedCategoryScores ?? displayData.categoryScores}
          />
        </>
      )}

      {activeTab === "competencies" && (
        <>
          {selectedTeam === "all" && (
            <SelfVsOthersChart data={report.selfVsOthers} />
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <Card>
              <CardHeader>
                <CardTitle>Competency Radar</CardTitle>
              </CardHeader>
              <CompetencyRadarChart
                categories={displayData.weightedCategoryScores ?? displayData.categoryScores}
              />
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Competency Scores</CardTitle>
              </CardHeader>
              <ScoreBreakdown
                categories={displayData.weightedCategoryScores ?? displayData.categoryScores}
              />
            </Card>
          </div>
        </>
      )}

      {activeTab === "questions" && (
        <QuestionInsights questions={displayData.questionDetails} />
      )}

      {activeTab === "feedback" && (
        <SummaryFeedbackView textFeedback={displayData.textFeedback} />
      )}
    </>
  );
}

// ─── Sub-components ───

function BackLink({ cycleId, userId }: { cycleId: string; userId?: string }) {
  return (
    <div className="flex items-center gap-4">
      <Link
        href={`/cycles/${cycleId}`}
        className="inline-flex items-center gap-1.5 text-[14px] text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft size={14} strokeWidth={1.5} />
        Back to Cycle
      </Link>
      {userId && (
        <>
          <span className="text-gray-200">|</span>
          <Link
            href={`/people/${userId}/performance`}
            className="inline-flex items-center gap-1.5 text-[14px] text-gray-500 hover:text-gray-700"
          >
            <BarChart3 size={14} strokeWidth={1.5} />
            Full Profile
          </Link>
        </>
      )}
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div>
      <Skeleton className="h-4 w-24 mb-6" />
      {/* Profile banner */}
      <Skeleton className="h-28 mb-6" />
      {/* Tab bar */}
      <Skeleton className="h-10 mb-6" />
      {/* Score overview row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
      {/* Key insights */}
      <Skeleton className="h-24" />
    </div>
  );
}
