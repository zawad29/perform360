import ExcelJS from "exceljs";
import type {
  CycleReport,
  IndividualReport,
} from "@/types/report";

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF0071E3" },
};

const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: "FFFFFFFF" },
  size: 11,
};

const NUM_FMT = "0.00";

function styleHeader(ws: ExcelJS.Worksheet): void {
  const row = ws.getRow(1);
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  row.height = 24;
}

function autoWidth(ws: ExcelJS.Worksheet): void {
  ws.columns.forEach((col) => {
    let max = 12;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? "").length + 2;
      if (len > max) max = len;
    });
    col.width = Math.min(max, 40);
  });
}

export async function renderCycleReportToExcel(
  cycleReport: CycleReport,
  individuals: IndividualReport[],
  cycleName: string,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Performs360";
  wb.created = new Date();

  // ─── Sheet 1: Summary ───
  const summary = wb.addWorksheet("Summary");
  summary.columns = [
    { header: "Metric", key: "metric" },
    { header: "Value", key: "value" },
  ];
  summary.addRow({ metric: "Cycle", value: cycleName });
  summary.addRow({ metric: "Completion Rate", value: `${cycleReport.completionRate.toFixed(1)}%` });
  summary.addRow({ metric: "Total Assignments", value: cycleReport.participationStats.totalAssignments });
  summary.addRow({ metric: "Completed", value: cycleReport.participationStats.completedAssignments });
  summary.addRow({ metric: "Pending", value: cycleReport.participationStats.pendingAssignments });
  summary.addRow({ metric: "In Progress", value: cycleReport.participationStats.inProgressAssignments });
  summary.addRow({});

  // Team completion sub-table
  summary.addRow({ metric: "Team Completion", value: "" });
  const teamHeaderRow = summary.addRow({ metric: "Team", value: "Completed / Total" });
  teamHeaderRow.getCell(1).font = { bold: true };
  teamHeaderRow.getCell(2).font = { bold: true };
  for (const tc of cycleReport.teamCompletionRates) {
    summary.addRow({ metric: tc.teamName, value: `${tc.completed}/${tc.total} (${tc.rate.toFixed(1)}%)` });
  }

  styleHeader(summary);
  autoWidth(summary);

  // ─── Sheet 2: Individual Scores ───
  const hasWeighted = individuals.some((r) => r.weightedOverallScore != null);
  const hasCalibrated = individuals.some((r) => r.calibratedScore != null);
  const hasMultipleTemplates = cycleReport.templatesUsed.length > 1;

  const scoresCols: Partial<ExcelJS.Column>[] = [
    { header: "Name", key: "name" },
    { header: "Team(s)", key: "teams" },
  ];
  if (hasMultipleTemplates) scoresCols.push({ header: "Template", key: "template" });
  scoresCols.push({ header: "Raw Score", key: "rawScore" });
  if (hasWeighted) scoresCols.push({ header: "Weighted Score", key: "weightedScore" });
  if (hasCalibrated) scoresCols.push({ header: "Calibrated Score", key: "calibratedScore" });
  scoresCols.push(
    { header: "Reviews Done", key: "done" },
    { header: "Total Reviews", key: "total" },
  );

  const scores = wb.addWorksheet("Individual Scores");
  scores.columns = scoresCols;

  // Build subject → team mapping from IndividualReport.teamBreakdowns
  const sorted = [...individuals].sort((a, b) => {
    const sa = a.calibratedScore ?? a.weightedOverallScore ?? a.overallScore;
    const sb = b.calibratedScore ?? b.weightedOverallScore ?? b.overallScore;
    return sb - sa;
  });

  // Match individual summary counts
  const summaryMap = new Map(
    cycleReport.individualSummaries.map((s) => [s.subjectId, s]),
  );

  for (const r of sorted) {
    const teamNames = r.teamBreakdowns.length > 0
      ? r.teamBreakdowns.map((tb) => tb.teamName).join(", ")
      : "";
    const summ = summaryMap.get(r.subjectId);

    const row: Record<string, unknown> = {
      name: r.subjectName,
      teams: teamNames,
      rawScore: r.overallScore,
      done: summ?.completedCount ?? 0,
      total: summ?.reviewCount ?? 0,
    };
    if (hasMultipleTemplates) row.template = summ?.primaryTemplateName ?? "";
    if (hasWeighted) row.weightedScore = r.weightedOverallScore ?? "";
    if (hasCalibrated) row.calibratedScore = r.calibratedScore ?? "";
    const dataRow = scores.addRow(row);

    // Number formatting
    dataRow.getCell("rawScore").numFmt = NUM_FMT;
    if (hasWeighted && r.weightedOverallScore != null) {
      dataRow.getCell("weightedScore").numFmt = NUM_FMT;
    }
    if (hasCalibrated && r.calibratedScore != null) {
      dataRow.getCell("calibratedScore").numFmt = NUM_FMT;
    }
  }

  styleHeader(scores);
  autoWidth(scores);

  // ─── Sheet 3: Category Breakdown ───
  const categories = wb.addWorksheet("Category Breakdown");
  const catCols: Partial<ExcelJS.Column>[] = [
    { header: "Name", key: "name" },
    { header: "Category", key: "category" },
    { header: "Score", key: "score" },
    { header: "Max", key: "maxScore" },
  ];
  if (hasWeighted) catCols.push({ header: "Weighted Score", key: "weightedScore" });
  categories.columns = catCols;

  for (const r of sorted) {
    const weightedMap = new Map(
      (r.teamBreakdowns[0]?.weightedCategoryScores ?? []).map((c) => [c.category, c.score]),
    );

    for (const cat of r.categoryScores) {
      const row: Record<string, unknown> = {
        name: r.subjectName,
        category: cat.category,
        score: cat.score,
        maxScore: cat.maxScore,
      };
      if (hasWeighted) {
        row.weightedScore = weightedMap.get(cat.category) ?? "";
      }
      const dataRow = categories.addRow(row);
      dataRow.getCell("score").numFmt = NUM_FMT;
      if (hasWeighted && weightedMap.has(cat.category)) {
        dataRow.getCell("weightedScore").numFmt = NUM_FMT;
      }
    }
  }

  styleHeader(categories);
  autoWidth(categories);

  // ─── Sheet 4: Team Averages ───
  const teamAvg = wb.addWorksheet("Team Averages");
  const teamCols: Partial<ExcelJS.Column>[] = [
    { header: "Team", key: "team" },
    { header: "Raw Avg", key: "rawAvg" },
  ];
  const hasTeamWeighted = cycleReport.avgScoreByTeam.some((t) => t.weightedAvgScore != null);
  const hasTeamCalibrated = cycleReport.avgScoreByTeam.some((t) => t.calibratedAvgScore != null);
  if (hasTeamWeighted) teamCols.push({ header: "Weighted Avg", key: "weightedAvg" });
  if (hasTeamCalibrated) teamCols.push({ header: "Calibrated Avg", key: "calibratedAvg" });
  teamAvg.columns = teamCols;

  for (const t of cycleReport.avgScoreByTeam) {
    const row: Record<string, unknown> = {
      team: t.teamName,
      rawAvg: t.avgScore,
    };
    if (hasTeamWeighted) row.weightedAvg = t.weightedAvgScore ?? "";
    if (hasTeamCalibrated) row.calibratedAvg = t.calibratedAvgScore ?? "";
    const dataRow = teamAvg.addRow(row);
    dataRow.getCell("rawAvg").numFmt = NUM_FMT;
    if (hasTeamWeighted && t.weightedAvgScore != null) dataRow.getCell("weightedAvg").numFmt = NUM_FMT;
    if (hasTeamCalibrated && t.calibratedAvgScore != null) dataRow.getCell("calibratedAvg").numFmt = NUM_FMT;

    // Per-template breakout for multi-template teams. Indented as `  ↳ Template`
    // rows so the relationship to the parent team row is visible at a glance.
    for (const bt of t.byTemplate) {
      const subRow = teamAvg.addRow({
        team: `  ↳ ${bt.templateName} (${bt.subjectCount})`,
        rawAvg: bt.avgScore,
      });
      subRow.getCell("rawAvg").numFmt = NUM_FMT;
      subRow.getCell("team").font = { italic: true, color: { argb: "FF666666" } };
    }
  }

  styleHeader(teamAvg);
  autoWidth(teamAvg);

  // ─── Sheet (optional): Templates Used ───
  if (cycleReport.templatesUsed.length > 0) {
    const templates = wb.addWorksheet("Templates Used");
    templates.columns = [
      { header: "Template", key: "name" },
      { header: "Subjects", key: "count" },
    ];
    for (const t of cycleReport.templatesUsed) {
      templates.addRow({ name: t.templateName, count: t.subjectCount });
    }
    styleHeader(templates);
    autoWidth(templates);
  }

  // ─── Sheet 5: Direction Scores ───
  const relSheet = wb.addWorksheet("Direction Scores");
  relSheet.columns = [
    { header: "Name", key: "name" },
    { header: "Downward", key: "downward" },
    { header: "Upward", key: "upward" },
    { header: "Lateral", key: "lateral" },
    { header: "Self", key: "self" },
    { header: "External", key: "external" },
  ];

  for (const r of sorted) {
    const dir = r.scoresByDirection;
    const dataRow = relSheet.addRow({
      name: r.subjectName,
      downward: dir.downward ?? "",
      upward: dir.upward ?? "",
      lateral: dir.lateral ?? "",
      self: dir.self ?? "",
      external: dir.external ?? "",
    });
    for (const key of ["downward", "upward", "lateral", "self", "external"] as const) {
      if (dir[key] != null) dataRow.getCell(key).numFmt = NUM_FMT;
    }
  }

  styleHeader(relSheet);
  autoWidth(relSheet);

  // ─── Generate buffer ───
  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
