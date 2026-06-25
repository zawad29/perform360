import path from "path";
import PDFDocument from "pdfkit";
import type {
  IndividualReport,
  CategoryScore,
  DirectionScores,
  TeamBreakdown,
} from "@/types/report";
import { DIRECTIONS, WEIGHT_FIELD_BY_DIRECTION } from "@/lib/directions";

// Swiss International Typographic Style
const COLORS = {
  accent: "#E63946",
  heading: "#111111",
  body: "#111111",
  secondary: "#555555",
  muted: "#888888",
  border: "#DDDDDD",
  white: "#FFFFFF",
} as const;

const PAGE_MARGIN = 50;
const CONTENT_WIDTH = 612 - PAGE_MARGIN * 2; // Letter width minus margins

export async function renderReportToPdf(
  report: IndividualReport,
  cycleName: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margin: PAGE_MARGIN,
      bufferPages: true,
    });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    renderHeader(doc, report.subjectName, cycleName);
    renderSubjectContext(doc, report);
    renderOverallScore(doc, report);
    renderDirectionScores(doc, report.scoresByDirection);
    renderCategoryScores(doc, report.categoryScores);
    if (report.teamBreakdowns.length > 1) {
      for (const tb of report.teamBreakdowns) {
        doc.addPage();
        renderTeamBreakdown(doc, tb, cycleName);
      }
    }

    renderFooter(doc);
    doc.end();
  });
}

// ─── Layout Helpers ───

function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  const remaining = doc.page.height - PAGE_MARGIN - doc.y;
  if (remaining < needed) {
    doc.addPage();
    doc.x = PAGE_MARGIN;
  }
}

function resetCursor(doc: PDFKit.PDFDocument): void {
  doc.x = PAGE_MARGIN;
}

function drawAccentRule(doc: PDFKit.PDFDocument): void {
  doc
    .moveTo(PAGE_MARGIN, doc.y)
    .lineTo(PAGE_MARGIN + CONTENT_WIDTH, doc.y)
    .strokeColor(COLORS.accent)
    .lineWidth(2)
    .stroke();
  doc.moveDown(0.8);
}

function _drawSubtleRule(doc: PDFKit.PDFDocument): void {
  doc
    .moveTo(PAGE_MARGIN, doc.y)
    .lineTo(PAGE_MARGIN + CONTENT_WIDTH, doc.y)
    .strokeColor(COLORS.border)
    .lineWidth(0.5)
    .stroke();
}

function renderSubjectContext(doc: PDFKit.PDFDocument, report: IndividualReport): void {
  const ctx = report.subjectContext;
  const teamNames = ctx.teams.map((t) => t.name).join(", ");
  const parts: string[] = [];
  if (ctx.role) parts.push(ctx.role);
  if (ctx.designation) parts.push(`Designation ${ctx.designation}`);
  if (teamNames) parts.push(teamNames);
  if (parts.length === 0) return;
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(COLORS.secondary)
    .text(parts.join("  ·  "), { align: "left" });
  doc.moveDown(0.8);
}

function renderHeader(
  doc: PDFKit.PDFDocument,
  name: string,
  cycleName: string
): void {
  // Employee name — large serif editorial style
  doc
    .font("Times-Bold")
    .fontSize(36)
    .fillColor(COLORS.heading)
    .text(name, { align: "left" });

  // Metadata dateline
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(COLORS.muted)
    .text(cycleName.toUpperCase(), { align: "left", characterSpacing: 1.5 });

  doc.moveDown(0.5);
  drawAccentRule(doc);
  doc.moveDown(0.5);
}

function renderOverallScore(
  doc: PDFKit.PDFDocument,
  report: {
    overallScore: number;
    weightedOverallScore?: number | null;
    calibratedScore?: number | null;
    calibrationJustification?: string | null;
  }
): void {
  const displayScore = report.calibratedScore ?? report.weightedOverallScore ?? report.overallScore;
  const label = report.calibratedScore != null
    ? "OVERALL SCORE (CALIBRATED)"
    : report.weightedOverallScore != null
      ? "OVERALL SCORE (WEIGHTED)"
      : "OVERALL SCORE";

  // Section label — caps grotesque
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(COLORS.muted)
    .text(label, { characterSpacing: 1.5 });

  // Large score number
  const scoreColor = displayScore >= 4.0 ? COLORS.accent : COLORS.heading;
  doc
    .font("Times-Bold")
    .fontSize(48)
    .fillColor(scoreColor)
    .text(displayScore.toFixed(1), { continued: true });
  doc
    .font("Helvetica")
    .fontSize(18)
    .fillColor(COLORS.muted)
    .text("  / 5.0");

  if (report.calibratedScore != null) {
    const rawLabel = report.weightedOverallScore != null
      ? `Weighted: ${report.weightedOverallScore.toFixed(1)}  |  Raw: ${report.overallScore.toFixed(1)}`
      : `Raw: ${report.overallScore.toFixed(1)}`;
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(COLORS.muted)
      .text(rawLabel);
    if (report.calibrationJustification) {
      doc
        .fontSize(9)
        .fillColor(COLORS.muted)
        .text(report.calibrationJustification);
    }
  } else if (report.weightedOverallScore != null) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(COLORS.muted)
      .text(`Unweighted: ${report.overallScore.toFixed(1)}`);
  }

  doc.moveDown(1);
}

function renderDirectionScores(
  doc: PDFKit.PDFDocument,
  scores: DirectionScores
): void {
  const filtered = DIRECTIONS
    .map((d) => [d.label, scores[WEIGHT_FIELD_BY_DIRECTION[d.key]]] as const)
    .filter(([, v]) => v !== null) as [string, number][];

  if (filtered.length === 0) return;

  ensureSpace(doc, 40 + filtered.length * 24);

  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(COLORS.heading)
    .text("SCORES BY DIRECTION", { characterSpacing: 1.5 });
  doc.moveDown(0.5);

  drawTable(
    doc,
    ["DIRECTION", "AVG SCORE"],
    filtered.map(([label, value]) => [label.toUpperCase(), value.toFixed(1)]),
    [CONTENT_WIDTH * 0.65, CONTENT_WIDTH * 0.35]
  );
  resetCursor(doc);

  doc.moveDown(1);
}

function renderCategoryScores(
  doc: PDFKit.PDFDocument,
  categories: CategoryScore[]
): void {
  if (categories.length === 0) return;

  ensureSpace(doc, 40 + categories.length * 24);
  resetCursor(doc);

  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(COLORS.heading)
    .text("COMPETENCY SCORES", { characterSpacing: 1.5 });
  doc.moveDown(0.5);

  drawTable(
    doc,
    ["CATEGORY", "SCORE", "MAX"],
    categories.map((c) => [c.category.toUpperCase(), c.score.toFixed(1), String(c.maxScore)]),
    [CONTENT_WIDTH * 0.55, CONTENT_WIDTH * 0.225, CONTENT_WIDTH * 0.225]
  );
  resetCursor(doc);

  doc.moveDown(1);
}

function renderTeamBreakdown(
  doc: PDFKit.PDFDocument,
  tb: TeamBreakdown,
  _cycleName: string
): void {
  resetCursor(doc);
  doc
    .font("Times-Bold")
    .fontSize(24)
    .fillColor(COLORS.heading)
    .text(tb.teamName, PAGE_MARGIN, undefined, { width: CONTENT_WIDTH });
  doc.moveDown(0.3);
  drawAccentRule(doc);
  doc.moveDown(0.5);

  renderOverallScore(doc, tb);
  renderDirectionScores(doc, tb.scoresByDirection);
  renderCategoryScores(doc, tb.weightedCategoryScores ?? tb.categoryScores);
}

function renderFooter(doc: PDFKit.PDFDocument): void {
  const dateStr = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const logoPath = path.join(process.cwd(), "public", "logo.png");
  const logoWidth = 80;
  const logoHeight = Math.round((233 / 567) * logoWidth); // preserve aspect ratio

  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    const savedY = doc.y;

    const footerY = doc.page.height - 45;

    // Logo
    try {
      doc.image(logoPath, PAGE_MARGIN, footerY, { width: logoWidth });
      doc.y = savedY; // Reset immediately — prevents cursor overflow triggering a new page
    } catch {
      // Fallback if logo not found — skip silently
    }

    // Confidential text — right of logo
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(COLORS.muted)
      .text(
        `CONFIDENTIAL  \u00B7  PERFORMS360  \u00B7  ${dateStr.toUpperCase()}`,
        PAGE_MARGIN + logoWidth + 12,
        footerY + Math.round(logoHeight / 2) - 4,
        { align: "left", width: CONTENT_WIDTH - logoWidth - 12, lineBreak: false, characterSpacing: 1 }
      );
    doc.y = savedY;
  }
}

// ─── Table Drawing ───

function drawTable(
  doc: PDFKit.PDFDocument,
  headers: string[],
  rows: string[][],
  colWidths: number[]
): void {
  const rowHeight = 24;
  const cellPadding = 8;
  const startX = PAGE_MARGIN;

  // Header row — red accent underline
  let y = doc.y;
  doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.muted);
  let x = startX;
  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i], x + cellPadding, y + 7, {
      width: colWidths[i] - cellPadding * 2,
      characterSpacing: 1,
    });
    x += colWidths[i];
  }
  y += rowHeight;

  // Red rule under header
  doc
    .moveTo(startX, y - 2)
    .lineTo(startX + CONTENT_WIDTH, y - 2)
    .strokeColor(COLORS.accent)
    .lineWidth(1.5)
    .stroke();

  // Data rows
  doc.font("Helvetica").fontSize(10).fillColor(COLORS.heading);
  for (let r = 0; r < rows.length; r++) {
    ensureSpace(doc, rowHeight + 4);
    y = doc.y;

    // Subtle border between rows
    doc
      .moveTo(startX, y + rowHeight)
      .lineTo(startX + CONTENT_WIDTH, y + rowHeight)
      .strokeColor(COLORS.border)
      .lineWidth(0.5)
      .stroke();

    x = startX;
    for (let c = 0; c < rows[r].length; c++) {
      // Score column — check if it's a number >= 4.0 for accent color
      const cellText = rows[r][c];
      const numVal = parseFloat(cellText);
      if (!isNaN(numVal) && c > 0 && numVal >= 4.0) {
        doc.fillColor(COLORS.accent);
      } else {
        doc.fillColor(COLORS.heading);
      }
      doc.text(cellText, x + cellPadding, y + 7, {
        width: colWidths[c] - cellPadding * 2,
      });
      x += colWidths[c];
    }
    doc.y = y + rowHeight;
  }
  doc.x = PAGE_MARGIN;
  doc.y += 4;
}
