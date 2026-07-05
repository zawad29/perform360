import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { renderAssignmentsToExcel } from "@/lib/excel/render-assignments";

describe("renderAssignmentsToExcel", () => {
  it("builds a workbook with team banners and mapped labels", async () => {
    const buf = await renderAssignmentsToExcel(
      [
        {
          teamName: "Sales",
          reviewers: [
            {
              reviewerName: "Alice",
              assignments: [
                { subjectName: "Bob", direction: "PEER", status: "SUBMITTED" },
                { subjectName: "Cara", direction: "DOWNWARD", status: "PENDING" },
              ],
            },
          ],
        },
        {
          teamName: "Eng",
          reviewers: [
            {
              reviewerName: "Dave",
              assignments: [
                { subjectName: "Eve", direction: "UPWARD", status: "IN_PROGRESS" },
              ],
            },
          ],
        },
      ],
      "Q3 Review"
    );

    expect(buf.length).toBeGreaterThan(0);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Assignments");
    expect(ws).toBeTruthy();

    const flat: string[] = [];
    ws!.eachRow((row) => {
      row.eachCell((cell) => flat.push(String(cell.value ?? "")));
    });
    const joined = flat.join("|");
    expect(joined).toContain("Sales");
    expect(joined).toContain("Eng");
    expect(joined).toContain("Alice");
    expect(joined).toContain("In Progress"); // status label mapped
    expect(joined).toContain("Submitted");

    // Alice has 2 assignments -> her name cell is merged vertically.
    // Banner row 1, header row 2, Alice's two rows 3-4 with A3:A4 merged.
    expect(ws!.getCell("A3").value).toBe("Alice");
    expect(ws!.getCell("A3").isMerged).toBe(true);
    expect(ws!.getCell("A4").isMerged).toBe(true);
    expect(ws!.getCell("A4").master.address).toBe("A3");
  });

  it("handles empty input", async () => {
    const buf = await renderAssignmentsToExcel([], "Empty");
    expect(buf.length).toBeGreaterThan(0);
  });
});
