import { prisma } from "@/lib/prisma";
import {
  decryptResponse,
  extractRatingScores,
  type TemplateSection,
  type TemplateQuestion,
} from "@/lib/reports";
import { emptyDirectionScores, emptyDirectionGroups, roundedMean } from "@/lib/directions";
import type {
  TrendsReport,
  CycleTrendPoint,
  KpiSummary,
  KpiMetric,
} from "@/types/trends";
import type { CycleStatus } from "@prisma/client";

interface CycleRow {
  id: string;
  name: string;
  status: CycleStatus;
  startDate: Date;
}

async function buildScoredCyclePoint(
  cycle: CycleRow,
  _companyId: string,
  dataKey: Buffer
): Promise<CycleTrendPoint> {
  const [assignments, cycleTeams] = await Promise.all([
    prisma.evaluationAssignment.findMany({
      where: { cycleId: cycle.id },
      select: { status: true, subjectId: true, templateId: true },
    }),
    prisma.cycleTeam.findMany({
      where: { cycleId: cycle.id },
      select: {
        teamId: true,
        templates: { select: { templateId: true } },
        team: {
          select: {
            id: true,
            name: true,
            members: { select: { userId: true } },
          },
        },
      },
    }),
  ]);

  const totalAssignments = assignments.length;
  const completedAssignments = assignments.filter((a) => a.status === "SUBMITTED").length;
  const completionRate =
    totalAssignments > 0
      ? parseFloat(((completedAssignments / totalAssignments) * 100).toFixed(1))
      : 0;

  const teamsEvaluated = cycleTeams.length;
  const templateIds = Array.from(
    new Set(assignments.map((a) => a.templateId).filter((id): id is string => Boolean(id)))
  );

  const emptyPoint: CycleTrendPoint = {
    cycleId: cycle.id,
    cycleName: cycle.name,
    startDate: cycle.startDate.toISOString(),
    status: cycle.status,
    isDraft: false,
    avgScore: null,
    completionRate,
    totalAssignments,
    completedAssignments,
    teamsEvaluated,
    directionScores: emptyDirectionScores(),
    teamScores: [],
    topPerformer: null,
    templateIds,
  };

  if (completedAssignments === 0 || templateIds.length === 0) return emptyPoint;

  const [templates, allResponses] = await Promise.all([
    prisma.evaluationTemplate.findMany({
      where: { id: { in: templateIds } },
      select: { sections: true },
    }),
    prisma.evaluationResponse.findMany({
      where: { assignment: { cycleId: cycle.id } },
      select: {
        subjectId: true,
        answersEncrypted: true,
        answersIv: true,
        answersTag: true,
        assignment: { select: { direction: true } },
      },
    }),
  ]);

  const allSections = templates.flatMap((t) => t.sections as unknown as TemplateSection[]);
  const ratingQuestions = allSections
    .flatMap((s) => s.questions)
    .filter((q: TemplateQuestion) => q.type === "rating_scale");
  const ratingQuestionIds = new Set(ratingQuestions.map((q) => q.id));

  if (ratingQuestionIds.size === 0) return emptyPoint;

  const subjectTeamMap = new Map<string, string[]>();
  for (const ct of cycleTeams) {
    for (const m of ct.team.members) {
      const arr = subjectTeamMap.get(m.userId) ?? [];
      arr.push(ct.team.id);
      subjectTeamMap.set(m.userId, arr);
    }
  }

  const teamNameMap = new Map(cycleTeams.map((ct) => [ct.team.id, ct.team.name]));

  const subjectScores = new Map<string, { total: number; count: number }>();
  const directionGroups = emptyDirectionGroups();
  const teamScoreAccum = new Map<string, { total: number; count: number }>();

  for (const resp of allResponses) {
    try {
      const answers = decryptResponse(
        resp.answersEncrypted,
        resp.answersIv,
        resp.answersTag,
        dataKey
      );
      const scores = extractRatingScores(answers, ratingQuestions);
      if (scores.length === 0) continue;
      const respAvg = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;

      const accum = subjectScores.get(resp.subjectId) ?? { total: 0, count: 0 };
      accum.total += respAvg;
      accum.count++;
      subjectScores.set(resp.subjectId, accum);

      const dir = resp.assignment.direction;
      directionGroups[dir].push(respAvg);

      const subjectTeams = subjectTeamMap.get(resp.subjectId) ?? [];
      for (const teamId of subjectTeams) {
        const teamAccum = teamScoreAccum.get(teamId) ?? { total: 0, count: 0 };
        teamAccum.total += respAvg;
        teamAccum.count++;
        teamScoreAccum.set(teamId, teamAccum);
      }
    } catch {
      // Skip responses that can't be decrypted (e.g. encrypted with a previous key)
    }
  }

  let totalScore = 0;
  let totalCount = 0;
  for (const [, scores] of subjectScores) {
    if (scores.count > 0) {
      totalScore += scores.total / scores.count;
      totalCount++;
    }
  }
  const avgScore = totalCount > 0 ? parseFloat((totalScore / totalCount).toFixed(2)) : null;

  const directionScores = {
    downward: roundedMean(directionGroups.DOWNWARD),
    upward: roundedMean(directionGroups.UPWARD),
    lateral: roundedMean(directionGroups.LATERAL),
    self: roundedMean(directionGroups.SELF),
    external: roundedMean(directionGroups.EXTERNAL),
  };

  const teamScores: CycleTrendPoint["teamScores"] = [];
  for (const [teamId, accum] of teamScoreAccum) {
    if (accum.count > 0) {
      teamScores.push({
        teamId,
        teamName: teamNameMap.get(teamId) ?? "Unknown",
        avgScore: parseFloat((accum.total / accum.count).toFixed(2)),
      });
    }
  }

  let topPerformer: CycleTrendPoint["topPerformer"] = null;
  let topScore = -1;
  let topSubjectId = "";
  for (const [subjectId, scores] of subjectScores) {
    if (scores.count > 0) {
      const subjectAvg = scores.total / scores.count;
      if (subjectAvg > topScore) {
        topScore = subjectAvg;
        topSubjectId = subjectId;
      }
    }
  }
  if (topSubjectId) {
    const topUser = await prisma.user.findUnique({
      where: { id: topSubjectId },
      select: { name: true },
    });
    topPerformer = {
      subjectId: topSubjectId,
      subjectName: topUser?.name ?? "Unknown",
      score: parseFloat(topScore.toFixed(2)),
    };
  }

  return {
    cycleId: cycle.id,
    cycleName: cycle.name,
    startDate: cycle.startDate.toISOString(),
    status: cycle.status,
    isDraft: false,
    avgScore,
    completionRate,
    totalAssignments,
    completedAssignments,
    teamsEvaluated,
    directionScores,
    teamScores,
    topPerformer,
    templateIds,
  };
}

async function buildDraftCyclePoint(cycle: CycleRow): Promise<CycleTrendPoint> {
  const [assignmentCount, ctRows] = await Promise.all([
    prisma.evaluationAssignment.count({ where: { cycleId: cycle.id } }),
    prisma.cycleTeam.findMany({
      where: { cycleId: cycle.id },
      select: { templates: { select: { templateId: true } } },
    }),
  ]);

  const teamCount = ctRows.length;
  const templateIds = Array.from(
    new Set(ctRows.flatMap((ct) => ct.templates.map((t) => t.templateId)))
  );

  return {
    cycleId: cycle.id,
    cycleName: cycle.name,
    startDate: cycle.startDate.toISOString(),
    status: cycle.status,
    isDraft: true,
    avgScore: null,
    completionRate: null,
    totalAssignments: assignmentCount,
    completedAssignments: 0,
    teamsEvaluated: teamCount,
    directionScores: emptyDirectionScores(),
    teamScores: [],
    topPerformer: null,
    templateIds,
  };
}

function buildKpiMetric(values: (number | null)[]): KpiMetric {
  const nonNull = values.filter((v): v is number => v !== null);
  if (nonNull.length === 0) return { current: null, rollingAvg: null, delta: null };
  const current = nonNull[nonNull.length - 1];
  if (nonNull.length < 2) return { current, rollingAvg: null, delta: null };
  const previous = nonNull.slice(0, -1);
  const rollingAvg = parseFloat(
    (previous.reduce((a, b) => a + b, 0) / previous.length).toFixed(2)
  );
  return { current, rollingAvg, delta: parseFloat((current - rollingAvg).toFixed(2)) };
}

function buildKpiSummary(scoredCycles: CycleTrendPoint[]): KpiSummary {
  const avgScoreMetric = buildKpiMetric(scoredCycles.map((c) => c.avgScore));
  const completionMetric = buildKpiMetric(scoredCycles.map((c) => c.completionRate));
  const assignmentMetric = buildKpiMetric(scoredCycles.map((c) => c.totalAssignments));
  const teamsMetric = buildKpiMetric(scoredCycles.map((c) => c.teamsEvaluated));

  const latest = scoredCycles[scoredCycles.length - 1];
  const directionSplit = latest?.directionScores ?? emptyDirectionScores();

  const topScores = scoredCycles.map((c) => c.topPerformer?.score ?? null);
  const nonNullTopScores = topScores.filter((v): v is number => v !== null);
  const currentTop = nonNullTopScores.length > 0 ? nonNullTopScores[nonNullTopScores.length - 1] : null;
  const previousTop = nonNullTopScores.length > 1 ? nonNullTopScores[nonNullTopScores.length - 2] : null;

  return {
    avgScore: avgScoreMetric,
    completionRate: completionMetric,
    assignments: assignmentMetric,
    teamsEvaluated: teamsMetric,
    directionSplit,
    topPerformerDelta: {
      current: currentTop,
      previous: previousTop,
      delta: currentTop !== null && previousTop !== null
        ? parseFloat((currentTop - previousTop).toFixed(2))
        : null,
      currentName: latest?.topPerformer?.subjectName ?? null,
    },
  };
}

export async function buildTrendsReport(
  companyId: string,
  dataKey: Buffer
): Promise<TrendsReport> {
  const cycles = await prisma.evaluationCycle.findMany({
    where: { companyId },
    orderBy: { startDate: "asc" },
    select: { id: true, name: true, status: true, startDate: true },
  });

  const draftCycles = cycles.filter((c) => c.status === "DRAFT");
  const scoredCycles = cycles.filter((c) => c.status !== "DRAFT");

  const [draftPoints, scoredPoints] = await Promise.all([
    Promise.all(draftCycles.map(buildDraftCyclePoint)),
    Promise.all(scoredCycles.map((c) => buildScoredCyclePoint(c, companyId, dataKey))),
  ]);

  const allPoints = [...draftPoints, ...scoredPoints].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );

  const sortedScoredPoints = scoredPoints.sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );
  const kpiSummary = buildKpiSummary(sortedScoredPoints);

  const teamMap = new Map<string, string>();
  for (const point of allPoints) {
    for (const ts of point.teamScores) {
      teamMap.set(ts.teamId, ts.teamName);
    }
  }
  const allTeams = Array.from(teamMap.entries()).map(([teamId, teamName]) => ({
    teamId,
    teamName,
  }));

  return { cycles: allPoints, kpiSummary, allTeams };
}
