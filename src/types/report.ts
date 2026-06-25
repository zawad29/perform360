import type { Direction, DirectionWeights, DirectionScores } from "@/lib/directions";

export type { DirectionWeights, DirectionScores };

export interface TeamBreakdown {
  teamId: string;
  teamName: string;
  overallScore: number;
  weightedOverallScore: number | null;
  appliedWeights: DirectionWeights | null;
  categoryScores: CategoryScore[];
  weightedCategoryScores: CategoryScore[] | null;
  scoresByDirection: DirectionScores;
  questionDetails: QuestionDetail[];
  textFeedback: TextFeedbackGroup[];
  calibrationOffset: number | null;
  calibratedScore: number | null;
  calibrationJustification: string | null;
}

export interface SubjectContext {
  role: string;
  designation: string | null;
  teams: { id: string; name: string; designation: string | null }[];
}

export interface ResponseRate {
  total: number;
  completed: number;
  rate: number;
}

export interface ReviewerBreakdownItem {
  direction: Direction;
  total: number;
  completed: number;
}

export interface SelfVsOthersItem {
  category: string;
  selfScore: number | null;
  othersScore: number | null;
  gap: number | null;
  insight: "blind_spot" | "hidden_strength" | "aligned" | null;
  // True when the section was shown to SELF reviewers. False when the section
  // was direction-routed to skip self (so a null selfScore is "not asked",
  // not "no response").
  selfWasAsked: boolean;
}

// How many rating questions were shown for each direction (after section direction
// filtering). Lets the UI disclose asymmetric coverage (e.g. lateral averaged
// over 12 questions while self saw only 4).
export type DirectionQuestionCounts = Record<Direction, number>;

export interface IndividualReport {
  subjectId: string;
  subjectName: string;
  cycleId: string;
  cycleName: string;
  overallScore: number;
  weightedOverallScore: number | null;
  categoryScores: CategoryScore[];
  scoresByDirection: DirectionScores;
  directionQuestionCounts: DirectionQuestionCounts;
  questionDetails: QuestionDetail[];
  textFeedback: TextFeedbackGroup[];
  teamBreakdowns: TeamBreakdown[];
  calibratedScore: number | null;
  calibrationJustification: string | null;
  calibrationAdjustedBy: string | null;
  subjectContext: SubjectContext;
  responseRate: ResponseRate;
  reviewerBreakdown: ReviewerBreakdownItem[];
  selfVsOthers: SelfVsOthersItem[];
}

export interface CategoryScore {
  category: string;
  score: number;
  maxScore: number;
}

export interface QuestionDetail {
  questionId: string;
  questionText: string;
  type: string;
  averageScore: number | null;
  distribution: Record<string, number>;
  responseCount: number;
}

export interface TextFeedbackGroup {
  questionId: string;
  questionText: string;
  direction: Direction;
  responses: string[];
}

export interface IndividualSummary {
  subjectId: string;
  subjectName: string;
  overallScore: number;
  weightedOverallScore: number | null;
  reviewCount: number;
  completedCount: number;
  calibratedScore: number | null;
  // The template that scored the majority of this subject's responses in the
  // cycle. Used to group / label like-with-like in cycle reports.
  primaryTemplateId: string | null;
  primaryTemplateName: string | null;
}

export interface TeamTemplateBreakdown {
  templateId: string;
  templateName: string;
  avgScore: number;
  subjectCount: number;
}

export interface TeamScore {
  teamId: string;
  teamName: string;
  avgScore: number;
  weightedAvgScore: number | null;
  calibratedAvgScore: number | null;
  // Per-template breakdown when the team uses more than one template.
  // Empty array when the team uses a single template.
  byTemplate: TeamTemplateBreakdown[];
}

export interface CycleTemplateUsage {
  templateId: string;
  templateName: string;
  subjectCount: number;
}

export interface SubmissionTrendPoint {
  date: string;
  count: number;
  cumulative: number;
}

export interface CycleReport {
  cycleId: string;
  cycleName: string;
  completionRate: number;
  teamCompletionRates: TeamCompletionRate[];
  scoreDistribution: number[];
  participationStats: ParticipationStats;
  individualSummaries: IndividualSummary[];
  avgScoreByTeam: TeamScore[];
  avgScoreByDirection: DirectionScores;
  submissionTrend: SubmissionTrendPoint[];
  isCalibrated: boolean;
  // Templates that scored at least one subject in this cycle, with the count
  // of subjects each one was the primary template for. Drives the legend banner.
  templatesUsed: CycleTemplateUsage[];
}

export interface TeamCompletionRate {
  teamId: string;
  teamName: string;
  total: number;
  completed: number;
  rate: number;
}

export interface ParticipationStats {
  totalAssignments: number;
  completedAssignments: number;
  pendingAssignments: number;
  inProgressAssignments: number;
}

// ── Person Performance Profile (cross-cycle) ──

export interface PersonCycleSummary {
  cycleId: string;
  cycleName: string;
  cycleStatus: string;
  startDate: string;
  endDate: string;
  overallScore: number;
  weightedOverallScore: number | null;
  calibratedScore: number | null;
  categoryScores: CategoryScore[];
  scoresByDirection: DirectionScores;
  responseRate: ResponseRate;
  reviewerBreakdown: ReviewerBreakdownItem[];
  // Distinct designation names this person held across teams during this cycle.
  // Empty when they had no designation assigned. Surfaces re-leveling over time.
  designations: string[];
}

export interface PersonPerformanceProfile {
  userId: string;
  userName: string;
  email: string;
  avatar: string | null;
  role: string;
  teamMemberships: { teamId: string; teamName: string; role: string }[];

  cycleCount: number;
  latestScore: number | null;
  averageScore: number | null;
  highestScore: number | null;
  lowestScore: number | null;
  scoreTrend: number | null;
  avgResponseRate: number;

  cycles: PersonCycleSummary[];
  avgCategoryScores: CategoryScore[];
  avgDirectionScores: DirectionScores;
}
