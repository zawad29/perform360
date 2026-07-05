import ExcelJS from "exceljs";
import { DIRECTION_LABELS } from "@/lib/directions";
import type { Direction } from "@/lib/directions";

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

const BANNER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFEAF3FE" },
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In Progress",
  SUBMITTED: "Submitted",
};

export interface ExportAssignment {
  subjectName: string;
  direction: Direction | string;
  status: string;
}

export interface ExportReviewer {
  reviewerName: string;
  assignments: ExportAssignment[];
}

export interface ExportTeam {
  teamName: string;
  reviewers: ExportReviewer[];
}

const COLUMNS = ["Reviewer", "Subject", "Direction", "Status"] as const;

/**
 * Builds an .xlsx workbook of cycle assignments grouped by team. Each team is
 * introduced by a banner row, followed by a header row and one row per
 * reviewer×subject assignment. Mirrors the on-screen Assignments tab.
 */
export async function renderAssignmentsToExcel(
  teams: ExportTeam[],
  cycleName: string
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Perform360";
  wb.title = `${cycleName} — Assignments`;
  wb.created = new Date();

  const ws = wb.addWorksheet("Assignments");
  ws.columns = COLUMNS.map((header) => ({ header, width: 20 }));
  // Drop the auto-added header row from `columns`; teams supply their own.
  ws.spliceRows(1, 1);

  for (const team of teams) {
    // Banner row spanning all columns.
    const banner = ws.addRow([team.teamName]);
    ws.mergeCells(banner.number, 1, banner.number, COLUMNS.length);
    const bannerCell = banner.getCell(1);
    bannerCell.value = team.teamName;
    bannerCell.font = { bold: true, size: 12, color: { argb: "FF0071E3" } };
    bannerCell.fill = BANNER_FILL;
    bannerCell.alignment = { vertical: "middle", horizontal: "left" };
    banner.height = 22;

    // Column header row.
    const header = ws.addRow([...COLUMNS]);
    header.eachCell((cell) => {
      cell.fill = HEADER_FILL;
      cell.font = HEADER_FONT;
      cell.alignment = { vertical: "middle", horizontal: "left" };
    });
    header.height = 20;

    // Data rows. Merge the Reviewer cell vertically across that reviewer's rows.
    for (const reviewer of team.reviewers) {
      if (reviewer.assignments.length === 0) continue;
      const firstRow = ws.rowCount + 1;
      reviewer.assignments.forEach((a, i) => {
        ws.addRow([
          i === 0 ? reviewer.reviewerName : "",
          a.subjectName,
          DIRECTION_LABELS[a.direction as Direction] ?? a.direction,
          STATUS_LABELS[a.status] ?? a.status,
        ]);
      });
      const lastRow = ws.rowCount;
      if (lastRow > firstRow) {
        ws.mergeCells(firstRow, 1, lastRow, 1);
      }
      ws.getCell(firstRow, 1).alignment = {
        vertical: "top",
        horizontal: "left",
      };
    }

    // Spacer row between teams.
    ws.addRow([]);
  }

  autoWidth(ws);

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

function autoWidth(ws: ExcelJS.Worksheet): void {
  ws.columns.forEach((col) => {
    let max = 18;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? "").length + 4;
      if (len > max) max = len;
    });
    col.width = Math.min(max, 60);
  });
}
