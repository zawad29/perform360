import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrHR, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { buildIndividualReport } from "@/lib/reports";
import { getDataKeyFromRequest } from "@/lib/encryption-session";
import { DIRECTION_LABELS } from "@/lib/directions";
import { applyRateLimit } from "@/lib/rate-limit";
import { validateCuidParam } from "@/lib/validation";
import { writeAuditLog } from "@/lib/audit";
import { enqueue } from "@/lib/queue";
import { JOB_TYPES } from "@/types/job";
import type { DirectionScores, DirectionWeights } from "@/types/report";

type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

/**
 * Export cycle report as a structured JSON blob suitable for client-side PDF generation.
 * The client renders this into a PDF using the browser's print/PDF capabilities.
 *
 * Query params:
 *   ?userId=xxx — export individual report for a specific user
 *   (no userId) — export cycle aggregate + all individual reports
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = applyRateLimit(request);
  if (rl) return rl;
  const { id: cycleId } = await params;
  const invalid = validateCuidParam(cycleId);
  if (invalid) return invalid;

  const authResult = await requireAdminOrHR();
  if (isAuthError(authResult)) return authResult;
  const { companyId } = authResult;

  // Verify cycle belongs to user's company
  const cycle = await prisma.evaluationCycle.findFirst({
    where: { id: cycleId, companyId },
    select: { id: true, name: true },
  });

  if (!cycle) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Cycle not found", code: "NOT_FOUND" },
      { status: 404 }
    );
  }

  // Check if encryption is still set up (may have been reset by superadmin)
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { encryptionSetupAt: true },
  });
  if (!company?.encryptionSetupAt) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Encryption key was changed. Data from the previous encryption key cannot be viewed.", code: "ENCRYPTION_RESET" },
      { status: 403 }
    );
  }

  const dataKey = getDataKeyFromRequest(request);
  if (!dataKey) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Encryption locked. Enter your passphrase to export reports.", code: "ENCRYPTION_LOCKED" },
      { status: 403 }
    );
  }

  const userId = request.nextUrl.searchParams.get("userId");

  try {
    if (userId) {
      // Single individual report export
      const subject = await prisma.user.findFirst({
        where: { id: userId, companyId },
        select: { id: true },
      });

      if (!subject) {
        return NextResponse.json<ApiResponse<never>>(
          { success: false, error: "User not found", code: "NOT_FOUND" },
          { status: 404 }
        );
      }

      const report = await buildIndividualReport(cycleId, userId, companyId, dataKey);

      await writeAuditLog({
        companyId,
        userId: authResult.userId,
        action: "decryption",
        target: `cycle:${cycleId}`,
        metadata: { type: "export", exportedUserId: userId },
      });

      const html = renderIndividualReportHtml(report, cycle.name);

      return new NextResponse(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": `inline; filename="${sanitizeFilename(report.subjectName)}-${sanitizeFilename(cycle.name)}.html"`,
        },
      });
    }

    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "User ID is required", code: "BAD_REQUEST" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Export error:", error);
    const message = error instanceof Error ? error.message : "Failed to export report";
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

/**
 * Enqueue a background job to generate reports and email them.
 * Body: { format?: "pdf" | "excel" } — defaults to "pdf".
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = applyRateLimit(request);
  if (rl) return rl;
  const { id: cycleId } = await params;
  const invalid = validateCuidParam(cycleId);
  if (invalid) return invalid;

  const authResult = await requireAdminOrHR();
  if (isAuthError(authResult)) return authResult;
  const { companyId } = authResult;


  const cycle = await prisma.evaluationCycle.findFirst({
    where: { id: cycleId, companyId },
    select: { id: true },
  });

  if (!cycle) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Cycle not found", code: "NOT_FOUND" },
      { status: 404 }
    );
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { encryptionSetupAt: true },
  });
  if (!company?.encryptionSetupAt) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Encryption key was changed. Data from the previous encryption key cannot be viewed.", code: "ENCRYPTION_RESET" },
      { status: 403 }
    );
  }

  const dataKey = getDataKeyFromRequest(request);
  if (!dataKey) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Encryption locked. Enter your passphrase to export reports.", code: "ENCRYPTION_LOCKED" },
      { status: 403 }
    );
  }

  const jobId = await enqueue(
    JOB_TYPES.REPORTS_EXPORT_CYCLE_EXCEL,
    {
      cycleId,
      companyId,
      userId: authResult.userId,
      userEmail: authResult.email,
      dataKeyHex: dataKey.toString("hex"),
    },
    { maxAttempts: 1 }
  );

  return NextResponse.json<ApiResponse<{ jobId: string }>>(
    { success: true, data: { jobId } },
    { status: 202 }
  );
}

// ─── HTML Report Rendering ───

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 50);
}

function renderScoreSection(
  data: {
    overallScore: number;
    weightedOverallScore?: number | null;
    appliedWeights?: DirectionWeights | null;
    categoryScores: { category: string; score: number; maxScore: number }[];
    weightedCategoryScores?: { category: string; score: number; maxScore: number }[] | null;
    scoresByDirection: DirectionScores;
    textFeedback: { questionText: string; responses: string[] }[];
    calibratedScore?: number | null;
    calibrationJustification?: string | null;
  },
  dirLabels: Record<string, string>
): string {
  const displayScore = data.calibratedScore ?? data.weightedOverallScore ?? data.overallScore;
  const displayCategories = data.weightedCategoryScores ?? data.categoryScores;

  const scoreLabel = data.calibratedScore != null
    ? "Overall Score (Calibrated)"
    : data.weightedOverallScore != null
      ? "Overall Score (Weighted)"
      : "Overall Score";

  const categoryRows = displayCategories
    .map(
      (c) =>
        `<tr><td>${escapeHtml(c.category)}</td><td>${c.score.toFixed(1)}</td><td>${c.maxScore}</td></tr>`
    )
    .join("");

  const dirEntries: [string, number | null][] = [
    ["DOWNWARD", data.scoresByDirection.downward],
    ["UPWARD", data.scoresByDirection.upward],
    ["LATERAL", data.scoresByDirection.lateral],
    ["SELF", data.scoresByDirection.self],
    ["EXTERNAL", data.scoresByDirection.external],
  ];
  const directionRows = dirEntries
    .filter(([, v]) => v !== null)
    .map(
      ([key, value]) =>
        `<tr><td>${escapeHtml(dirLabels[key] ?? key)}</td><td>${(value as number).toFixed(1)}</td></tr>`
    )
    .join("");

  const weightsRow = data.appliedWeights
    ? `<p class="weights-info" style="text-align:left;color:#888888;font-size:11px;margin-top:4px;text-transform:uppercase;letter-spacing:0.05em;">
        Weights: Down ${Math.round(data.appliedWeights.downward)}%
        · Up ${Math.round(data.appliedWeights.upward)}%
        · Lat ${Math.round(data.appliedWeights.lateral)}%
        · Self ${Math.round(data.appliedWeights.self)}%
        · Ext ${Math.round(data.appliedWeights.external)}%
      </p>`
    : "";

  let subScoreNote = "";
  if (data.calibratedScore != null) {
    const parts = [];
    if (data.weightedOverallScore != null) parts.push(`Weighted: ${data.weightedOverallScore.toFixed(1)}`);
    parts.push(`Raw: ${data.overallScore.toFixed(1)}`);
    subScoreNote = `<p style="text-align:left;color:#888888;font-size:11px;">${parts.join(" · ")}</p>`;
    if (data.calibrationJustification) {
      subScoreNote += `<p style="text-align:left;color:#888888;font-size:10px;font-style:italic;">${escapeHtml(data.calibrationJustification)}</p>`;
    }
  } else if (data.weightedOverallScore != null) {
    subScoreNote = `<p style="text-align:left;color:#888888;font-size:11px;">Unweighted: ${data.overallScore.toFixed(1)}</p>`;
  }

  return `
  <div class="score-hero">
    <div class="score-value">${displayScore.toFixed(1)}</div>
    <div class="score-label">${scoreLabel}</div>
    ${subScoreNote}
    ${weightsRow}
  </div>

  <section>
    <h2>Scores by Direction</h2>
    <table><thead><tr><th>Direction</th><th>Avg Score</th></tr></thead>
    <tbody>${directionRows}</tbody></table>
  </section>

  <section>
    <h2>Competency Scores${data.weightedCategoryScores ? " (Weighted)" : ""}</h2>
    <table><thead><tr><th>Category</th><th>Score</th><th>Max</th></tr></thead>
    <tbody>${categoryRows}</tbody></table>
  </section>`;
}

function renderIndividualReportHtml(
  report: Awaited<ReturnType<typeof buildIndividualReport>>,
  cycleName: string
): string {
  const dirLabels: Record<string, string> = DIRECTION_LABELS;

  const hasTeamBreakdowns = report.teamBreakdowns.length > 1;

  const allTeamsHeading = hasTeamBreakdowns
    ? `<div class="team-divider"><h2 class="team-heading">All Teams (Merged)</h2></div>`
    : "";

  const mergedSection = renderScoreSection(report, dirLabels);

  const teamSections = hasTeamBreakdowns
    ? report.teamBreakdowns
        .map(
          (tb) => `
          <div class="team-divider page-break">
            <h2 class="team-heading">${escapeHtml(tb.teamName)}</h2>
          </div>
          ${renderScoreSection(tb, dirLabels)}`
        )
        .join("")
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(report.subjectName)} — ${escapeHtml(cycleName)}</title>
<style>${reportCss}</style>
</head>
<body>
<div class="container">
  <header>
    <h1>${escapeHtml(report.subjectName)}</h1>
    <p class="subtitle">${escapeHtml(cycleName)}</p>
  </header>

  ${allTeamsHeading}
  ${mergedSection}
  ${teamSections}

  <footer>
    <a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}" style="text-decoration:none;"><img src="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/logo.png" alt="Performs360" width="100" style="display:block;margin-bottom:12px;" /></a>
    <p>Generated by Performs360 &middot; ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
  </footer>
</div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const reportCss = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', 'Arial Narrow', Arial, sans-serif; color: #111111; background: #fff; }
  .container { max-width: 800px; margin: 0 auto; padding: 48px 32px; }
  header { margin-bottom: 32px; text-align: left; border-bottom: 2px solid #E63946; padding-bottom: 16px; }
  h1 { font-family: Georgia, 'Times New Roman', serif; font-size: 36px; font-weight: 700; letter-spacing: -0.01em; line-height: 1.1; }
  .subtitle { font-size: 12px; color: #888888; margin-top: 8px; text-transform: uppercase; letter-spacing: 0.15em; font-weight: 500; }
  h2 { font-size: 14px; font-weight: 700; margin-bottom: 12px; margin-top: 32px; text-transform: uppercase; letter-spacing: 0.15em; color: #111111; }
  h4 { font-size: 12px; font-weight: 700; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.1em; color: #555555; }
  .score-hero { text-align: left; margin: 24px 0 32px; }
  .score-value { font-family: Georgia, 'Times New Roman', serif; font-size: 48px; font-weight: 700; color: #E63946; }
  .score-label { font-size: 12px; color: #888888; text-transform: uppercase; letter-spacing: 0.15em; font-weight: 500; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th, td { padding: 10px 16px; text-align: left; border-bottom: 1px solid #DDDDDD; font-size: 14px; }
  th { font-weight: 700; color: #888888; background: #F5F5F5; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; border-bottom: 2px solid #E63946; }
  .feedback-group { margin-bottom: 16px; padding: 16px; background: #F5F5F5; border-left: 3px solid #111111; }
  .feedback-group ul { padding-left: 20px; }
  .feedback-group li { margin-bottom: 6px; font-family: Georgia, 'Times New Roman', serif; font-size: 14px; color: #555555; line-height: 1.7; }
  .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 24px 0; }
  .stat { text-align: left; padding: 16px; background: #F5F5F5; border-top: 2px solid #111111; }
  .stat-value { font-family: Georgia, 'Times New Roman', serif; font-size: 24px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .stat-label { font-size: 11px; color: #888888; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.1em; }
  footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #DDDDDD; text-align: left; }
  footer p { font-size: 11px; color: #888888; text-transform: uppercase; letter-spacing: 0.05em; }
  .individual-report { max-width: 800px; margin: 0 auto; padding: 48px 32px; }
  .individual-report header { margin-bottom: 32px; text-align: left; }
  .team-divider { margin-top: 40px; padding-top: 24px; border-top: 2px solid #111111; }
  .team-heading { font-family: Georgia, 'Times New Roman', serif; font-size: 24px; font-weight: 700; color: #111111; margin-bottom: 0; text-transform: none; letter-spacing: -0.01em; }
  .weights-info { text-align: left !important; }
  @media print {
    body { background: #fff; }
    .container { padding: 0; max-width: 100%; }
    .page-break { page-break-before: always; }
    @page { margin: 1in; }
    header { border-bottom-color: #E63946; }
  }
`;
