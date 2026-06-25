/** A single row parsed from the CSV */
export interface CsvRow {
  name: string;
  email: string;
  team: string;
  role: string;
  designation?: string;
}

/** A row enriched with validation status for the preview table */
export interface ParsedRow extends CsvRow {
  rowIndex: number;
  status: "valid" | "skipped" | "warning";
  skipReason?: string;
  warnings?: string[];
  teamRole: "MANAGER" | "MEMBER" | "EXTERNAL";
}

/** Payload sent to POST /api/import/teams */
export interface ImportPayload {
  rows: CsvRow[];
}

/** Summary returned from the server after import */
export interface ImportResult {
  teamsCreated: number;
  teamsExisted: number;
  usersCreated: number;
  usersExisted: number;
  membershipsCreated: number;
  membershipsExisted: number;
  rowsSkipped: number;
  skippedDetails: Array<{ name: string; reason: string }>;
  managersLinked: number;
  managersNotFound: string[];
}
