import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { Direction } from "@prisma/client";
import {
  DIRECTION_KEYS,
  WEIGHT_FIELD_BY_DIRECTION,
  emptyDirectionScores,
  emptyDirectionGroups,
  emptyDirectionWeights,
  emptyDirectionCounts,
  mean,
  roundedMean,
} from "@/lib/directions";
import { directionWeightsSchema } from "@/lib/template-schema";
import type {
  IndividualReport,
  IndividualSummary,
  CategoryScore,
  DirectionScores,
  DirectionWeights,
  QuestionDetail,
  TextFeedbackGroup,
  CycleReport,
  TeamCompletionRate,
  TeamScore,
  ParticipationStats,
  SubmissionTrendPoint,
  SubjectContext,
  ResponseRate,
  ReviewerBreakdownItem,
  SelfVsOthersItem,
} from "@/types/report";

// ─── Types ───

export interface TemplateQuestion {
  id: string;
  text: string;
  type: "rating_scale" | "text" | "multiple_choice";
  required: boolean;
  options?: string[];
  scaleMin?: number;
  scaleMax?: number;
  scaleLabels?: string[];
}

export interface TemplateSection {
  id?: string;
  title: string;
  description?: string;
  directions?: Direction[];
  questions: TemplateQuestion[];
}

export type DecryptedAnswers = Record<string, string | number | boolean>;

interface DecryptedResponse {
  reviewerId: string;
  subjectId: string;
  direction: Direction;
  templateId: string;
  answers: DecryptedAnswers;
  submittedAt: Date | null;
}

// ─── Decryption ───

export function decryptResponse(
  encrypted: string,
  iv: string,
  tag: string,
  dataKey: Buffer
): DecryptedAnswers {
  const json = decrypt(encrypted, iv, tag, dataKey);
  return JSON.parse(json) as DecryptedAnswers;
}

export async function getDecryptedResponsesForSubject(
  cycleId: string,
  subjectId: string,
  dataKey: Buffer
): Promise<DecryptedResponse[]> {
  const responses = await prisma.evaluationResponse.findMany({
    where: { subjectId, assignment: { cycleId } },
    select: {
      reviewerId: true,
      subjectId: true,
      answersEncrypted: true,
      answersIv: true,
      answersTag: true,
      submittedAt: true,
      assignment: { select: { direction: true, templateId: true } },
    },
  });

  const results: DecryptedResponse[] = [];
  for (const r of responses) {
    try {
      results.push({
        reviewerId: r.reviewerId,
        subjectId: r.subjectId,
        direction: r.assignment.direction,
        templateId: r.assignment.templateId,
        answers: decryptResponse(r.answersEncrypted, r.answersIv, r.answersTag, dataKey),
        submittedAt: r.submittedAt,
      });
    } catch {
      // Skip responses that can't be decrypted (e.g. encrypted with a previous key)
    }
  }
  return results;
}

// ─── Aggregation helpers ───

export function extractRatingScores(
  answers: DecryptedAnswers,
  questions: TemplateQuestion[]
): { questionId: string; score: number }[] {
  const out: { questionId: string; score: number }[] = [];
  for (const q of questions) {
    if (q.type === "rating_scale") {
      const v = answers[q.id];
      if (typeof v === "number") out.push({ questionId: q.id, score: v });
    }
  }
  return out;
}

export function buildCategoryScores(
  responses: DecryptedResponse[],
  sections: TemplateSection[]
): CategoryScore[] {
  return sections
    .filter((s) => s.questions.some((q) => q.type === "rating_scale"))
    .map((section) => {
      const ratingQuestions = section.questions.filter((q) => q.type === "rating_scale");
      const maxScale = ratingQuestions[0]?.scaleMax ?? 5;
      let totalScore = 0;
      let totalCount = 0;
      for (const resp of responses) {
        for (const q of ratingQuestions) {
          const v = resp.answers[q.id];
          if (typeof v === "number") {
            totalScore += v;
            totalCount++;
          }
        }
      }
      return {
        category: section.title,
        score: totalCount > 0 ? parseFloat((totalScore / totalCount).toFixed(2)) : 0,
        maxScore: maxScale,
      };
    });
}

export function buildDirectionScores(
  responses: DecryptedResponse[],
  sections: TemplateSection[]
): DirectionScores {
  const ratingQuestions = sections.flatMap((s) => s.questions).filter((q) => q.type === "rating_scale");
  const groups = emptyDirectionGroups();

  for (const resp of responses) {
    const scores = extractRatingScores(resp.answers, ratingQuestions);
    if (scores.length > 0) {
      const avg = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
      groups[resp.direction].push(avg);
    }
  }

  return {
    downward: roundedMean(groups.DOWNWARD),
    upward: roundedMean(groups.UPWARD),
    lateral: roundedMean(groups.LATERAL),
    self: roundedMean(groups.SELF),
    external: roundedMean(groups.EXTERNAL),
  };
}

export function buildQuestionDetails(
  responses: DecryptedResponse[],
  sections: TemplateSection[]
): QuestionDetail[] {
  return sections
    .flatMap((s) => s.questions)
    .filter((q) => q.type === "rating_scale" || q.type === "multiple_choice")
    .map((q) => {
      const distribution: Record<string, number> = {};
      let total = 0;
      let count = 0;
      for (const resp of responses) {
        const v = resp.answers[q.id];
        if (v !== undefined && v !== "") {
          const key = String(v);
          distribution[key] = (distribution[key] ?? 0) + 1;
          if (typeof v === "number") {
            total += v;
            count++;
          }
        }
      }
      return {
        questionId: q.id,
        questionText: q.text,
        type: q.type,
        averageScore: count > 0 ? parseFloat((total / count).toFixed(2)) : null,
        distribution,
        responseCount: responses.filter((r) => r.answers[q.id] !== undefined).length,
      };
    });
}

export function buildTextFeedback(
  responses: DecryptedResponse[],
  sections: TemplateSection[]
): TextFeedbackGroup[] {
  const textQuestions = sections.flatMap((s) => s.questions).filter((q) => q.type === "text");
  const groups: TextFeedbackGroup[] = [];

  for (const q of textQuestions) {
    const byDirection = new Map<Direction, string[]>();
    for (const resp of responses) {
      const v = resp.answers[q.id];
      if (typeof v === "string" && v.trim().length > 0) {
        const arr = byDirection.get(resp.direction) ?? [];
        arr.push(v.trim());
        byDirection.set(resp.direction, arr);
      }
    }
    for (const [direction, items] of byDirection.entries()) {
      groups.push({ questionId: q.id, questionText: q.text, direction, responses: items });
    }
  }
  return groups;
}

export function calculateOverallScore(
  responses: DecryptedResponse[],
  sections: TemplateSection[]
): number {
  const ratingQuestions = sections.flatMap((s) => s.questions).filter((q) => q.type === "rating_scale");
  let total = 0;
  let count = 0;
  for (const resp of responses) {
    for (const q of ratingQuestions) {
      const v = resp.answers[q.id];
      if (typeof v === "number") {
        total += v;
        count++;
      }
    }
  }
  return count > 0 ? parseFloat((total / count).toFixed(2)) : 0;
}

// ─── Weighted scoring ───

export function resolveWeightsForSubject(
  memberWeights: DirectionWeights | null,
  managerWeights: DirectionWeights | null,
  subjectTeamRole: string | null
): DirectionWeights | null {
  if (!managerWeights) return memberWeights;
  if (subjectTeamRole === "MANAGER") return managerWeights;
  return memberWeights;
}

/**
 * Apply percentage weights (0–100) to per-direction average scores. Redistributes
 * weight from absent directions proportionally among present ones.
 */
export function applyWeightsToDirectionAverages(
  groups: Record<Direction, number[]>,
  weights: DirectionWeights | null
): { score: number; appliedWeights: DirectionWeights } | null {
  if (!weights) return null;

  const averages: Record<Direction, number | null> = {
    DOWNWARD: mean(groups.DOWNWARD),
    UPWARD: mean(groups.UPWARD),
    LATERAL: mean(groups.LATERAL),
    SELF: mean(groups.SELF),
    EXTERNAL: mean(groups.EXTERNAL),
  };

  const present = DIRECTION_KEYS.filter((d) => averages[d] !== null);
  const absentSum = DIRECTION_KEYS
    .filter((d) => averages[d] === null)
    .reduce((s, d) => s + weights[WEIGHT_FIELD_BY_DIRECTION[d]], 0);

  if (present.length === 0) {
    return {
      score: 0,
      appliedWeights: emptyDirectionWeights(),
    };
  }

  const presentSum = present.reduce((s, d) => s + weights[WEIGHT_FIELD_BY_DIRECTION[d]], 0);
  const applied: DirectionWeights = emptyDirectionWeights();
  let weighted = 0;

  for (const d of DIRECTION_KEYS) {
    const field = WEIGHT_FIELD_BY_DIRECTION[d];
    if (averages[d] === null) {
      applied[field] = 0;
    } else {
      const adjusted = presentSum > 0
        ? weights[field] + (weights[field] / presentSum) * absentSum
        : 100 / present.length;
      applied[field] = adjusted;
      weighted += averages[d]! * adjusted;
    }
  }

  return { score: parseFloat((weighted / 100).toFixed(2)), appliedWeights: applied };
}

export function calculateWeightedOverallScore(
  responses: DecryptedResponse[],
  sections: TemplateSection[],
  weights: DirectionWeights | null
): { score: number; appliedWeights: DirectionWeights } | null {
  if (!weights) return null;
  const ratingQuestions = sections.flatMap((s) => s.questions).filter((q) => q.type === "rating_scale");
  const groups = emptyDirectionGroups();
  for (const resp of responses) {
    const scores = extractRatingScores(resp.answers, ratingQuestions);
    if (scores.length > 0) {
      const avg = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
      groups[resp.direction].push(avg);
    }
  }
  return applyWeightsToDirectionAverages(groups, weights);
}

export function buildWeightedCategoryScores(
  responses: DecryptedResponse[],
  sections: TemplateSection[],
  weights: DirectionWeights | null
): CategoryScore[] | null {
  if (!weights) return null;
  return sections
    .filter((s) => s.questions.some((q) => q.type === "rating_scale"))
    .map((section) => {
      const ratingQuestions = section.questions.filter((q) => q.type === "rating_scale");
      const maxScale = ratingQuestions[0]?.scaleMax ?? 5;
      const groups = emptyDirectionGroups();
      for (const resp of responses) {
        let total = 0;
        let count = 0;
        for (const q of ratingQuestions) {
          const v = resp.answers[q.id];
          if (typeof v === "number") {
            total += v;
            count++;
          }
        }
        if (count > 0) groups[resp.direction].push(total / count);
      }
      const result = applyWeightsToDirectionAverages(groups, weights);
      return { category: section.title, score: result?.score ?? 0, maxScore: maxScale };
    });
}

// ─── Self vs others ───

export function buildSelfVsOthers(
  responses: DecryptedResponse[],
  sections: TemplateSection[]
): SelfVsOthersItem[] {
  const GAP_THRESHOLD = 0.75;
  return sections
    .filter((s) => s.questions.some((q) => q.type === "rating_scale"))
    .map((section) => {
      const ratingQuestions = section.questions.filter((q) => q.type === "rating_scale");
      // Section is shown to SELF reviewers when its directions filter is empty
      // (= all) or explicitly includes SELF.
      const sectionDirections = section.directions ?? [];
      const selfWasAsked =
        sectionDirections.length === 0 || sectionDirections.includes("SELF");
      const selfScores: number[] = [];
      const othersScores: number[] = [];
      for (const resp of responses) {
        let total = 0;
        let count = 0;
        for (const q of ratingQuestions) {
          const v = resp.answers[q.id];
          if (typeof v === "number") {
            total += v;
            count++;
          }
        }
        if (count > 0) {
          const avg = total / count;
          if (resp.direction === "SELF") selfScores.push(avg);
          else othersScores.push(avg);
        }
      }
      const selfScore = selfScores.length > 0
        ? parseFloat((selfScores.reduce((a, b) => a + b, 0) / selfScores.length).toFixed(2))
        : null;
      const othersScore = othersScores.length > 0
        ? parseFloat((othersScores.reduce((a, b) => a + b, 0) / othersScores.length).toFixed(2))
        : null;
      const gap = selfScore !== null && othersScore !== null
        ? parseFloat((selfScore - othersScore).toFixed(2))
        : null;
      let insight: SelfVsOthersItem["insight"] = null;
      if (gap !== null) {
        if (gap > GAP_THRESHOLD) insight = "blind_spot";
        else if (gap < -GAP_THRESHOLD) insight = "hidden_strength";
        else insight = "aligned";
      }
      return { category: section.title, selfScore, othersScore, gap, insight, selfWasAsked };
    });
}

// ─── Template weight helpers ───

interface TemplateWeights {
  member: DirectionWeights | null;
  manager: DirectionWeights | null;
}

function parseWeights(json: unknown): DirectionWeights | null {
  const result = directionWeightsSchema.safeParse(json);
  return result.success ? result.data : null;
}

async function loadTemplateWeights(templateIds: string[]): Promise<Map<string, TemplateWeights>> {
  if (templateIds.length === 0) return new Map();
  const templates = await prisma.evaluationTemplate.findMany({
    where: { id: { in: templateIds } },
    select: { id: true, weightsMember: true, weightsManager: true },
  });
  return new Map(
    templates.map((t) => [
      t.id,
      {
        member: parseWeights(t.weightsMember),
        manager: parseWeights(t.weightsManager),
      },
    ])
  );
}

// ─── Full report builders ───

export async function buildIndividualReport(
  cycleId: string,
  subjectId: string,
  _companyId: string,
  dataKey: Buffer
): Promise<IndividualReport> {
  const [cycle, subject] = await Promise.all([
    prisma.evaluationCycle.findUnique({
      where: { id: cycleId },
      select: { name: true },
    }),
    prisma.user.findUnique({
      where: { id: subjectId },
      select: {
        name: true,
        role: true,
        teamMemberships: {
          include: {
            team: { select: { id: true, name: true } },
            level: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  if (!cycle || !subject) throw new Error("Cycle or subject not found");

  const subjectContext: SubjectContext = {
    role: subject.role,
    level: subject.teamMemberships[0]?.level?.name ?? null,
    teams: subject.teamMemberships.map((tm) => ({
      id: tm.team.id,
      name: tm.team.name,
      level: tm.level?.name ?? null,
    })),
  };

  const subjectTeamRoleMap = new Map<string, string>(
    subject.teamMemberships.map((tm) => [tm.team.id, tm.role])
  );

  const allSubjectAssignments = await prisma.evaluationAssignment.findMany({
    where: { cycleId, subjectId },
    select: { templateId: true, direction: true, status: true },
  });

  const totalAssigned = allSubjectAssignments.length;
  const totalCompleted = allSubjectAssignments.filter((a) => a.status === "SUBMITTED").length;
  const responseRate: ResponseRate = {
    total: totalAssigned,
    completed: totalCompleted,
    rate: totalAssigned > 0 ? parseFloat(((totalCompleted / totalAssigned) * 100).toFixed(1)) : 0,
  };

  const dirBreakdown = new Map<Direction, { total: number; completed: number }>();
  for (const a of allSubjectAssignments) {
    const e = dirBreakdown.get(a.direction) ?? { total: 0, completed: 0 };
    e.total++;
    if (a.status === "SUBMITTED") e.completed++;
    dirBreakdown.set(a.direction, e);
  }
  const reviewerBreakdown: ReviewerBreakdownItem[] = Array.from(dirBreakdown.entries()).map(
    ([direction, counts]) => ({ direction, ...counts })
  );

  const templateIds = Array.from(new Set(allSubjectAssignments.map((a) => a.templateId)));
  const [templates, cycleTeams, templateWeightsMap] = await Promise.all([
    prisma.evaluationTemplate.findMany({
      where: { id: { in: templateIds } },
      select: { id: true, sections: true },
    }),
    prisma.cycleTeam.findMany({
      where: { cycleId },
      select: {
        teamId: true,
        calibrationOffset: true,
        calibrationJustification: true,
        team: { select: { id: true, name: true } },
        templates: { select: { templateId: true } },
      },
    }),
    loadTemplateWeights(templateIds),
  ]);

  if (templates.length === 0) throw new Error("No templates found for subject's assignments");

  const templateSectionsMap = new Map(
    templates.map((t) => [t.id, t.sections as unknown as TemplateSection[]])
  );

  // Reverse map: templateId → teamIds (a template can be on multiple teams)
  const templateToTeams = new Map<string, string[]>();
  for (const ct of cycleTeams) {
    for (const ctt of ct.templates) {
      const arr = templateToTeams.get(ctt.templateId) ?? [];
      arr.push(ct.team.id);
      templateToTeams.set(ctt.templateId, arr);
    }
  }

  const sections = templates.flatMap((t) => t.sections as unknown as TemplateSection[]);

  const [responses, memberCalibrations] = await Promise.all([
    getDecryptedResponsesForSubject(cycleId, subjectId, dataKey),
    prisma.calibrationAdjustment.findMany({
      where: { cycleId, subjectId },
      include: { adjuster: { select: { name: true } } },
    }),
  ]);
  const memberCalibByTeam = new Map(memberCalibrations.map((c) => [c.teamId, c]));

  const cycleTeamById = new Map(cycleTeams.map((ct) => [ct.team.id, ct]));

  // Group responses by team — pick the first team this template belongs to that includes the subject
  const subjectTeams = new Set(subject.teamMemberships.map((tm) => tm.team.id));
  const responsesByTeam = new Map<string, { teamId: string; teamName: string; templateId: string; responses: DecryptedResponse[] }>();
  for (const resp of responses) {
    const candidateTeams = templateToTeams.get(resp.templateId) ?? [];
    const teamId = candidateTeams.find((tid) => subjectTeams.has(tid)) ?? candidateTeams[0];
    if (!teamId) continue;
    const teamName = cycleTeamById.get(teamId)?.team.name ?? "";
    const existing = responsesByTeam.get(teamId);
    if (existing) {
      existing.responses.push(resp);
    } else {
      responsesByTeam.set(teamId, { teamId, teamName, templateId: resp.templateId, responses: [resp] });
    }
  }

  const teamBreakdowns = Array.from(responsesByTeam.values()).map(({ teamId, teamName, templateId, responses: teamResponses }) => {
    const teamSections = templateSectionsMap.get(templateId) ?? sections;
    const subjectRole = subjectTeamRoleMap.get(teamId) ?? null;
    const tplWeights = templateWeightsMap.get(templateId);
    const teamWeights = tplWeights ? resolveWeightsForSubject(tplWeights.member, tplWeights.manager, subjectRole) : null;

    const weightedResult = calculateWeightedOverallScore(teamResponses, teamSections, teamWeights);
    const rawScore = calculateOverallScore(teamResponses, teamSections);

    const memberCalib = memberCalibByTeam.get(teamId);
    const cycleTeam = cycleTeamById.get(teamId);
    const teamOffset = cycleTeam?.calibrationOffset ?? null;
    const teamJustification = cycleTeam?.calibrationJustification ?? null;

    let calibratedScore: number | null = null;
    let calibrationJustification: string | null = null;
    if (memberCalib) {
      calibratedScore = memberCalib.calibratedScore;
      calibrationJustification = memberCalib.justification;
    } else if (teamOffset !== null) {
      calibratedScore = parseFloat(Math.min(5, Math.max(0, rawScore + teamOffset)).toFixed(2));
      calibrationJustification = teamJustification;
    }

    return {
      teamId,
      teamName,
      overallScore: rawScore,
      weightedOverallScore: weightedResult?.score ?? null,
      appliedWeights: weightedResult?.appliedWeights ?? null,
      categoryScores: buildCategoryScores(teamResponses, teamSections),
      weightedCategoryScores: buildWeightedCategoryScores(teamResponses, teamSections, teamWeights),
      scoresByDirection: buildDirectionScores(teamResponses, teamSections),
      questionDetails: buildQuestionDetails(teamResponses, teamSections),
      textFeedback: buildTextFeedback(teamResponses, teamSections),
      calibrationOffset: teamOffset,
      calibratedScore,
      calibrationJustification,
    };
  });

  const teamsWithWeights = teamBreakdowns.filter((tb) => tb.weightedOverallScore !== null);
  const weightedOverallScore = teamsWithWeights.length > 0
    ? parseFloat(
        (teamsWithWeights.reduce((s, tb) => s + tb.weightedOverallScore!, 0) / teamsWithWeights.length).toFixed(2)
      )
    : null;

  const teamsWithCalibration = teamBreakdowns.filter((tb) => tb.calibratedScore !== null);
  const calibratedScore = teamsWithCalibration.length > 0
    ? parseFloat(
        (teamsWithCalibration.reduce((s, tb) => s + tb.calibratedScore!, 0) / teamsWithCalibration.length).toFixed(2)
      )
    : null;

  const latestCalib = memberCalibrations.length > 0
    ? memberCalibrations.reduce((latest, c) => (c.updatedAt > latest.updatedAt ? c : latest))
    : null;

  // Per-direction rating-question count (after section direction filtering).
  // Lets the per-user UI disclose that, e.g., "self" averaged over fewer
  // questions than "downward" because some sections were direction-tagged.
  const directionQuestionCounts = emptyDirectionCounts();
  for (const section of sections) {
    const ratingCount = section.questions.filter((q) => q.type === "rating_scale").length;
    if (ratingCount === 0) continue;
    const dirs = section.directions ?? [];
    const targetDirs: Direction[] = dirs.length === 0 ? DIRECTION_KEYS as Direction[] : dirs;
    for (const d of targetDirs) directionQuestionCounts[d] += ratingCount;
  }

  return {
    subjectId,
    subjectName: subject.name,
    cycleId,
    cycleName: cycle.name,
    overallScore: calculateOverallScore(responses, sections),
    weightedOverallScore,
    categoryScores: buildCategoryScores(responses, sections),
    scoresByDirection: buildDirectionScores(responses, sections),
    directionQuestionCounts,
    questionDetails: buildQuestionDetails(responses, sections),
    textFeedback: buildTextFeedback(responses, sections),
    teamBreakdowns,
    calibratedScore,
    calibrationJustification: latestCalib?.justification ?? null,
    calibrationAdjustedBy: latestCalib?.adjuster.name ?? null,
    subjectContext,
    responseRate,
    reviewerBreakdown,
    selfVsOthers: buildSelfVsOthers(responses, sections),
  };
}

export async function buildCycleReport(
  cycleId: string,
  companyId: string,
  dataKey: Buffer
): Promise<CycleReport> {
  const [cycle, assignments, cycleTeams, allCalibrations] = await Promise.all([
    prisma.evaluationCycle.findUnique({ where: { id: cycleId }, select: { name: true } }),
    prisma.evaluationAssignment.findMany({
      where: { cycleId },
      select: { status: true, subjectId: true, reviewerId: true, templateId: true },
    }),
    prisma.cycleTeam.findMany({
      where: { cycleId },
      select: {
        teamId: true,
        calibrationOffset: true,
        templates: { select: { templateId: true } },
      },
    }),
    prisma.calibrationAdjustment.findMany({
      where: { cycleId },
      select: {
        subjectId: true,
        teamId: true,
        rawScore: true,
        calibratedScore: true,
        justification: true,
      },
    }),
  ]);

  if (!cycle) throw new Error("Cycle not found");

  const totalAssignments = assignments.length;
  const completedAssignments = assignments.filter((a) => a.status === "SUBMITTED").length;
  const pendingAssignments = assignments.filter((a) => a.status === "PENDING").length;
  const inProgressAssignments = assignments.filter((a) => a.status === "IN_PROGRESS").length;
  const completionRate = totalAssignments > 0
    ? parseFloat(((completedAssignments / totalAssignments) * 100).toFixed(1))
    : 0;

  const participationStats: ParticipationStats = {
    totalAssignments,
    completedAssignments,
    pendingAssignments,
    inProgressAssignments,
  };

  const cycleTeamIds = cycleTeams.map((ct) => ct.teamId);
  const calibBySubjectTeam = new Map(allCalibrations.map((c) => [`${c.subjectId}:${c.teamId}`, c]));
  const teamOffsetMap = new Map(cycleTeams.map((ct) => [ct.teamId, ct.calibrationOffset]));
  const hasAnyCalibration = allCalibrations.length > 0
    || cycleTeams.some((ct) => ct.calibrationOffset !== null);

  const subjectIds = Array.from(new Set(assignments.map((a) => a.subjectId)));
  const subjectAssignmentCounts = new Map<string, { total: number; completed: number }>();
  for (const a of assignments) {
    const e = subjectAssignmentCounts.get(a.subjectId) ?? { total: 0, completed: 0 };
    e.total++;
    if (a.status === "SUBMITTED") e.completed++;
    subjectAssignmentCounts.set(a.subjectId, e);
  }

  const allTemplateIds = Array.from(new Set(assignments.map((a) => a.templateId)));

  const [teams, subjectUsers, templateWeightsMap] = await Promise.all([
    prisma.team.findMany({
      where: { id: { in: cycleTeamIds } },
      select: {
        id: true,
        name: true,
        members: { select: { userId: true, role: true } },
      },
    }),
    prisma.user.findMany({
      where: { id: { in: subjectIds }, companyId },
      select: { id: true, name: true },
    }),
    loadTemplateWeights(allTemplateIds),
  ]);
  const subjectNameMap = new Map(subjectUsers.map((u) => [u.id, u.name]));

  const teamCompletionRates: TeamCompletionRate[] = teams.map((team) => {
    const memberIds = new Set(team.members.map((m) => m.userId));
    const teamAssignments = assignments.filter(
      (a) => memberIds.has(a.subjectId) || memberIds.has(a.reviewerId)
    );
    const teamCompleted = teamAssignments.filter((a) => a.status === "SUBMITTED").length;
    const teamTotal = teamAssignments.length;
    return {
      teamId: team.id,
      teamName: team.name,
      total: teamTotal,
      completed: teamCompleted,
      rate: teamTotal > 0 ? parseFloat(((teamCompleted / teamTotal) * 100).toFixed(1)) : 0,
    };
  });

  const scoreDistribution: number[] = [0, 0, 0, 0, 0];
  const individualSummaries: IndividualSummary[] = [];
  const avgScoreByTeam: TeamScore[] = [];
  let avgScoreByDirection: DirectionScores = emptyDirectionScores();
  const submissionTrend: SubmissionTrendPoint[] = [];
  const templateNameById = new Map<string, string>();

  if (completedAssignments > 0 && allTemplateIds.length > 0) {
    const templates = await prisma.evaluationTemplate.findMany({
      where: { id: { in: allTemplateIds } },
      select: { id: true, name: true, sections: true },
    });
    for (const t of templates) templateNameById.set(t.id, t.name);

    const ratingQuestionIds = new Set<string>();
    for (const t of templates) {
      const secs = t.sections as unknown as TemplateSection[];
      for (const s of secs) {
        for (const q of s.questions) {
          if (q.type === "rating_scale") ratingQuestionIds.add(q.id);
        }
      }
    }

    const allResponses = await prisma.evaluationResponse.findMany({
      where: { assignment: { cycleId } },
      select: {
        subjectId: true,
        answersEncrypted: true,
        answersIv: true,
        answersTag: true,
        submittedAt: true,
        assignment: { select: { direction: true, templateId: true } },
      },
    });

    // Subject → teams + role per team
    const subjectTeamMap = new Map<string, string[]>();
    const subjectTeamRoleMap = new Map<string, Map<string, string>>();
    for (const team of teams) {
      for (const m of team.members) {
        const arr = subjectTeamMap.get(m.userId) ?? [];
        arr.push(team.id);
        subjectTeamMap.set(m.userId, arr);
        if (!subjectTeamRoleMap.has(m.userId)) subjectTeamRoleMap.set(m.userId, new Map());
        subjectTeamRoleMap.get(m.userId)!.set(team.id, m.role);
      }
    }

    const subjectScores = new Map<string, { total: number; count: number }>();
    const subjectTemplateDirGroups = new Map<string, Map<string, Record<Direction, number[]>>>();
    // Count of submitted ratings per (subject, templateId). Drives the
    // primary-template attribution on each individual summary.
    const subjectTemplateRatings = new Map<string, Map<string, number>>();
    const directionGroups = emptyDirectionGroups();
    const dailySubmissions = new Map<string, number>();

    for (const resp of allResponses) {
      try {
        const answers = decryptResponse(resp.answersEncrypted, resp.answersIv, resp.answersTag, dataKey);
        const accum = subjectScores.get(resp.subjectId) ?? { total: 0, count: 0 };
        let respTotal = 0;
        let respCount = 0;
        for (const [k, v] of Object.entries(answers)) {
          if (ratingQuestionIds.has(k) && typeof v === "number") {
            const bucket = Math.min(Math.max(Math.round(v), 1), 5) - 1;
            scoreDistribution[bucket]++;
            accum.total += v;
            accum.count++;
            respTotal += v;
            respCount++;
          }
        }
        subjectScores.set(resp.subjectId, accum);

        if (respCount > 0) {
          const direction = resp.assignment.direction;
          const tplId = resp.assignment.templateId;

          // Per subject × template × direction
          if (!subjectTemplateDirGroups.has(resp.subjectId)) {
            subjectTemplateDirGroups.set(resp.subjectId, new Map());
          }
          const tplMap = subjectTemplateDirGroups.get(resp.subjectId)!;
          if (!tplMap.has(tplId)) tplMap.set(tplId, emptyDirectionGroups());
          tplMap.get(tplId)![direction].push(respTotal / respCount);

          // Track template usage per subject (weighted by question count, so the
          // primary template is the one that drove the most rating answers).
          if (!subjectTemplateRatings.has(resp.subjectId)) {
            subjectTemplateRatings.set(resp.subjectId, new Map());
          }
          const tr = subjectTemplateRatings.get(resp.subjectId)!;
          tr.set(tplId, (tr.get(tplId) ?? 0) + respCount);

          directionGroups[direction].push(respTotal / respCount);
        }

        if (resp.submittedAt) {
          const dateKey = new Date(resp.submittedAt).toISOString().split("T")[0];
          dailySubmissions.set(dateKey, (dailySubmissions.get(dateKey) ?? 0) + 1);
        }
      } catch {
        // Skip responses that can't be decrypted (e.g. encrypted with a previous key)
      }
    }

    for (const subjectId of subjectIds) {
      const scores = subjectScores.get(subjectId);
      const counts = subjectAssignmentCounts.get(subjectId) ?? { total: 0, completed: 0 };
      const overallScore = scores && scores.count > 0
        ? parseFloat((scores.total / scores.count).toFixed(2))
        : 0;

      // Weighted score: average of per-template weighted scores
      let weightedOverallScore: number | null = null;
      const tplDirMap = subjectTemplateDirGroups.get(subjectId);
      if (tplDirMap) {
        const subjTeams = subjectTeamMap.get(subjectId) ?? [];
        // Pick subject's role from any of their teams (first available)
        const role = subjTeams.length > 0
          ? subjectTeamRoleMap.get(subjectId)?.get(subjTeams[0]) ?? null
          : null;
        const weighted: number[] = [];
        for (const [tplId, groups] of tplDirMap.entries()) {
          const tplW = templateWeightsMap.get(tplId);
          if (!tplW) continue;
          const w = resolveWeightsForSubject(tplW.member, tplW.manager, role);
          if (w) {
            const result = applyWeightsToDirectionAverages(groups, w);
            if (result) weighted.push(result.score);
          }
        }
        if (weighted.length > 0) {
          weightedOverallScore = parseFloat(
            (weighted.reduce((a, b) => a + b, 0) / weighted.length).toFixed(2)
          );
        }
      }

      let calibratedScore: number | null = null;
      const sTeamIds = subjectTeamMap.get(subjectId) ?? [];
      const calibScores: number[] = [];
      for (const tid of sTeamIds) {
        const memberCalib = calibBySubjectTeam.get(`${subjectId}:${tid}`);
        const teamOffset = teamOffsetMap.get(tid) ?? null;
        if (memberCalib) calibScores.push(memberCalib.calibratedScore);
        else if (teamOffset !== null) {
          calibScores.push(parseFloat(Math.min(5, Math.max(0, overallScore + teamOffset)).toFixed(2)));
        }
      }
      if (calibScores.length > 0) {
        calibratedScore = parseFloat(
          (calibScores.reduce((a, b) => a + b, 0) / calibScores.length).toFixed(2)
        );
      }

      // Primary template = template that drove the most rating answers for this subject.
      let primaryTemplateId: string | null = null;
      const tr = subjectTemplateRatings.get(subjectId);
      if (tr) {
        let topCount = -1;
        for (const [tplId, count] of tr) {
          if (count > topCount) {
            topCount = count;
            primaryTemplateId = tplId;
          }
        }
      }
      const primaryTemplateName = primaryTemplateId
        ? templateNameById.get(primaryTemplateId) ?? null
        : null;

      individualSummaries.push({
        subjectId,
        subjectName: subjectNameMap.get(subjectId) ?? "Unknown",
        overallScore,
        weightedOverallScore,
        reviewCount: counts.total,
        completedCount: counts.completed,
        calibratedScore,
        primaryTemplateId,
        primaryTemplateName,
      });
    }

    avgScoreByDirection = {
      downward: roundedMean(directionGroups.DOWNWARD),
      upward: roundedMean(directionGroups.UPWARD),
      lateral: roundedMean(directionGroups.LATERAL),
      self: roundedMean(directionGroups.SELF),
      external: roundedMean(directionGroups.EXTERNAL),
    };

    for (const team of teams) {
      const memberIds = new Set(team.members.map((m) => m.userId));
      const roleByUserId = new Map(team.members.map((m) => [m.userId, m.role]));
      let teamTotal = 0;
      let teamCount = 0;
      const teamWeightedScores: number[] = [];

      for (const [sid, scores] of subjectScores.entries()) {
        if (!memberIds.has(sid) || scores.count === 0) continue;
        teamTotal += scores.total / scores.count;
        teamCount++;

        const tplDirMap = subjectTemplateDirGroups.get(sid);
        if (tplDirMap) {
          const role = roleByUserId.get(sid) ?? null;
          const weighted: number[] = [];
          for (const [tplId, groups] of tplDirMap.entries()) {
            const tplW = templateWeightsMap.get(tplId);
            if (!tplW) continue;
            const w = resolveWeightsForSubject(tplW.member, tplW.manager, role);
            if (w) {
              const result = applyWeightsToDirectionAverages(groups, w);
              if (result) weighted.push(result.score);
            }
          }
          if (weighted.length > 0) {
            teamWeightedScores.push(weighted.reduce((a, b) => a + b, 0) / weighted.length);
          }
        }
      }

      if (teamCount > 0) {
        const rawAvg = parseFloat((teamTotal / teamCount).toFixed(2));
        const teamOffset = teamOffsetMap.get(team.id) ?? null;
        const calibScores: number[] = [];
        for (const [sid, scores] of subjectScores.entries()) {
          if (!memberIds.has(sid) || scores.count === 0) continue;
          const memberRaw = scores.total / scores.count;
          const memberCalib = calibBySubjectTeam.get(`${sid}:${team.id}`);
          if (memberCalib) calibScores.push(memberCalib.calibratedScore);
          else if (teamOffset !== null) {
            calibScores.push(parseFloat(Math.min(5, Math.max(0, memberRaw + teamOffset)).toFixed(2)));
          }
        }

        // Per-template breakout: group team subjects by their primary template.
        const byTemplateMap = new Map<string, { total: number; count: number }>();
        for (const summary of individualSummaries) {
          if (!memberIds.has(summary.subjectId)) continue;
          if (!summary.primaryTemplateId || summary.overallScore <= 0) continue;
          const e = byTemplateMap.get(summary.primaryTemplateId) ?? { total: 0, count: 0 };
          e.total += summary.overallScore;
          e.count += 1;
          byTemplateMap.set(summary.primaryTemplateId, e);
        }
        const byTemplate: TeamScore["byTemplate"] = [];
        if (byTemplateMap.size > 1) {
          for (const [tplId, { total, count }] of byTemplateMap) {
            byTemplate.push({
              templateId: tplId,
              templateName: templateNameById.get(tplId) ?? "Unknown template",
              avgScore: parseFloat((total / count).toFixed(2)),
              subjectCount: count,
            });
          }
          byTemplate.sort((a, b) => b.subjectCount - a.subjectCount);
        }

        avgScoreByTeam.push({
          teamId: team.id,
          teamName: team.name,
          avgScore: rawAvg,
          weightedAvgScore: teamWeightedScores.length > 0
            ? parseFloat(
                (teamWeightedScores.reduce((a, b) => a + b, 0) / teamWeightedScores.length).toFixed(2)
              )
            : null,
          calibratedAvgScore: calibScores.length > 0
            ? parseFloat((calibScores.reduce((a, b) => a + b, 0) / calibScores.length).toFixed(2))
            : null,
          byTemplate,
        });
      }
    }

    const sortedDates = Array.from(dailySubmissions.keys()).sort();
    let cumulative = 0;
    for (const date of sortedDates) {
      const count = dailySubmissions.get(date) ?? 0;
      cumulative += count;
      const formatted = new Date(date + "T00:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      submissionTrend.push({ date: formatted, count, cumulative });
    }
  } else {
    for (const subjectId of subjectIds) {
      const counts = subjectAssignmentCounts.get(subjectId) ?? { total: 0, completed: 0 };
      individualSummaries.push({
        subjectId,
        subjectName: subjectNameMap.get(subjectId) ?? "Unknown",
        overallScore: 0,
        weightedOverallScore: null,
        reviewCount: counts.total,
        completedCount: counts.completed,
        calibratedScore: null,
        primaryTemplateId: null,
        primaryTemplateName: null,
      });
    }
  }

  // Cycle-level template legend: count of subjects each template was primary for.
  const templatesUsed: CycleReport["templatesUsed"] = [];
  if (individualSummaries.some((s) => s.primaryTemplateId)) {
    const usageMap = new Map<string, number>();
    for (const summary of individualSummaries) {
      if (!summary.primaryTemplateId) continue;
      usageMap.set(
        summary.primaryTemplateId,
        (usageMap.get(summary.primaryTemplateId) ?? 0) + 1
      );
    }
    for (const [tplId, count] of usageMap) {
      templatesUsed.push({
        templateId: tplId,
        templateName: templateNameById.get(tplId) ?? "Unknown template",
        subjectCount: count,
      });
    }
    templatesUsed.sort((a, b) => b.subjectCount - a.subjectCount);
  }

  return {
    cycleId,
    cycleName: cycle.name,
    completionRate,
    teamCompletionRates,
    scoreDistribution,
    participationStats,
    individualSummaries,
    avgScoreByTeam,
    avgScoreByDirection,
    submissionTrend,
    isCalibrated: hasAnyCalibration,
    templatesUsed,
  };
}
