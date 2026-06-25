"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { useToast } from "@/components/ui/toast";
import {
  Upload,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowLeft,
  Users,
  UserPlus,
  Link2,
  ChevronDown,
  ChevronUp,
  Download,
  Crown,
} from "lucide-react";
import Link from "next/link";
import type { CsvRow, ParsedRow, ImportResult } from "@/types/import";

const SAMPLE_CSV = `Name,Email,Team,Role,Designation
James Carter,james.carter@techcorp.com,Executive / Leadership Team,Manager,C-Suite
Sarah Chen,sarah.chen@techcorp.com,Executive / Leadership Team,Member,VP
Robert Hayes,robert.hayes@techcorp.com,Executive / Leadership Team,Member,VP
Emily Tran,emily.tran@techcorp.com,Executive / Leadership Team,Member,VP
Maria Santos,maria.santos@techcorp.com,Executive / Leadership Team,Member,VP
David Liu,david.liu@techcorp.com,Executive / Leadership Team,Member,VP
Sarah Chen,sarah.chen@techcorp.com,Engineering Management,Manager,VP
Alex Rivera,alex.rivera@techcorp.com,Engineering Management,Member,Senior
Priya Sharma,priya.sharma@techcorp.com,Engineering Management,Member,Senior
Dan Kim,dan.kim@techcorp.com,Engineering Management,Member,Senior
Alex Rivera,alex.rivera@techcorp.com,Platform Team,Manager,Senior
Jordan Lee,jordan.lee@techcorp.com,Platform Team,Member,Mid
Maya Patel,maya.patel@techcorp.com,Platform Team,Member,Mid
Chris Wu,chris.wu@techcorp.com,Platform Team,External,Junior
Priya Sharma,priya.sharma@techcorp.com,Frontend Team,Manager,Senior
Tom Zhang,tom.zhang@techcorp.com,Frontend Team,Member,Mid
Nina Costa,nina.costa@techcorp.com,Frontend Team,Member,Junior
Dan Kim,dan.kim@techcorp.com,DevOps Team,Manager,Senior
Sam Ali,sam.ali@techcorp.com,DevOps Team,Member,Mid
Robert Hayes,robert.hayes@techcorp.com,Finance Team,Manager,VP
Lisa Park,lisa.park@techcorp.com,Finance Team,Member,Senior
Mark Jensen,mark.jensen@techcorp.com,Finance Team,Member,Mid
Emily Tran,emily.tran@techcorp.com,Accounts Team,Manager,VP
James Wong,james.wong@techcorp.com,Accounts Team,Member,Mid
Aisha Khan,aisha.khan@techcorp.com,Accounts Team,Member,Junior
Maria Santos,maria.santos@techcorp.com,HR Team,Manager,VP
Kevin Brown,kevin.brown@techcorp.com,HR Team,Member,Senior
Rachel Adams,rachel.adams@techcorp.com,HR Team,Member,Mid
David Liu,david.liu@techcorp.com,Admin Team,Manager,VP
Sophie Martin,sophie.martin@techcorp.com,Admin Team,Member,Mid
Omar Farooq,omar.farooq@techcorp.com,Admin Team,Member,Junior`;

function downloadSampleCsv() {
  const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "sample-teams.csv";
  a.click();
  URL.revokeObjectURL(url);
}

type WizardStep = 1 | 2 | 3;

const STEPS = [
  { num: 1, label: "Upload" },
  { num: 2, label: "Review & Import" },
  { num: 3, label: "Done" },
] as const;

function parseCsv(text: string): { rows: ParsedRow[]; error?: string } {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return { rows: [], error: "CSV has no data rows" };

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const nameIdx = header.indexOf("name");
  const emailIdx = header.indexOf("email");
  const teamIdx = header.indexOf("team");
  const roleIdx = header.indexOf("role");
  const designationIdx = header.indexOf("designation");

  if (nameIdx === -1 || emailIdx === -1 || teamIdx === -1 || roleIdx === -1) {
    return {
      rows: [],
      error: "CSV must have Name, Email, Team, and Role columns",
    };
  }

  const rawRows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(",").map((c) => c.trim());
    if (!cols[nameIdx]) continue;
    const row: CsvRow = {
      name: cols[nameIdx],
      email: cols[emailIdx] ?? "",
      team: cols[teamIdx] ?? "",
      role: cols[roleIdx] ?? "",
    };
    if (designationIdx !== -1 && cols[designationIdx]) {
      row.designation = cols[designationIdx];
    }
    rawRows.push(row);
  }

  if (rawRows.length === 0) {
    return { rows: [], error: "No valid rows found in CSV" };
  }

  const parsedRows: ParsedRow[] = rawRows.map((row, idx) => {
    const roleLower = row.role.toLowerCase();
    const warnings: string[] = [];

    const ROLE_MAP: Record<string, "MANAGER" | "MEMBER" | "EXTERNAL"> = {
      manager: "MANAGER",
      member: "MEMBER",
      external: "EXTERNAL",
    };
    const teamRole = ROLE_MAP[roleLower] ?? "MEMBER";

    if (!ROLE_MAP[roleLower]) {
      warnings.push(`Unknown role "${row.role}" — treating as Member`);
    }

    if (!row.email || !row.email.includes("@")) {
      return {
        ...row,
        rowIndex: idx + 2,
        status: "skipped" as const,
        skipReason: "No email address",
        warnings,
        teamRole,
      };
    }

    return {
      ...row,
      rowIndex: idx + 2,
      status: warnings.length > 0 ? ("warning" as const) : ("valid" as const),
      warnings,
      teamRole,
    };
  });

  return { rows: parsedRows };
}

function StepIndicator({ current }: { current: WizardStep }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((step, i) => {
        const isActive = step.num === current;
        const isDone = step.num < current;
        return (
          <div key={step.num} className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <div
                className={`w-7 h-7 flex items-center justify-center text-[12px] font-semibold ${
                  isDone
                    ? "bg-gray-900 text-white"
                    : isActive
                      ? "bg-gray-900 text-white"
                      : "bg-gray-200 text-gray-500"
                }`}
              >
                {isDone ? <CheckCircle2 size={14} strokeWidth={2} /> : step.num}
              </div>
              <span
                className={`text-[13px] font-medium ${isActive ? "text-gray-900" : "text-gray-400"}`}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="w-8 h-px bg-gray-200 mx-1" />
            )}
          </div>
        );
      })}
    </div>
  );
}

interface TeamGroup {
  name: string;
  manager: ParsedRow | null;
  members: ParsedRow[];
  skipped: ParsedRow[];
  warnings: ParsedRow[];
}

function TeamCard({ group }: { group: TeamGroup }) {
  const [expanded, setExpanded] = useState(false);
  const total = (group.manager ? 1 : 0) + group.members.length;

  return (
    <div className="border border-gray-100 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <div className="w-8 h-8 bg-gray-100 flex items-center justify-center shrink-0">
          <Users size={14} strokeWidth={1.5} className="text-gray-900" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-medium text-gray-900 truncate">{group.name}</p>
          <p className="text-[12px] text-gray-500">
            {total} {total === 1 ? "person" : "people"}
            {group.manager && <span> &middot; 1 manager</span>}
            {group.skipped.length > 0 && (
              <span className="text-gray-900"> &middot; {group.skipped.length} skipped</span>
            )}
            {group.warnings.length > 0 && (
              <span className="text-gray-900"> &middot; {group.warnings.length} warnings</span>
            )}
          </p>
        </div>
        {expanded ? (
          <ChevronUp size={14} className="text-gray-400 shrink-0" />
        ) : (
          <ChevronDown size={14} className="text-gray-400 shrink-0" />
        )}
      </button>
      {expanded && (
        <div className="px-4 pb-3 border-t border-gray-50">
          <div className="space-y-1 pt-2">
            {group.manager && (
              <div className="flex items-center gap-2 py-1">
                <Crown size={12} strokeWidth={1.5} className="text-gray-900 shrink-0" />
                <span className="text-[13px] text-gray-900 font-medium">{group.manager.name}</span>
                <span className="text-[12px] text-gray-400">{group.manager.email}</span>
                <Badge variant="info" className="ml-auto text-[10px]">Manager</Badge>
              </div>
            )}
            {group.members.map((m) => (
              <div key={m.rowIndex} className="flex items-center gap-2 py-1">
                <span className="w-3 shrink-0" />
                <span className={`text-[13px] ${m.status === "skipped" ? "text-gray-400 line-through" : "text-gray-700"}`}>
                  {m.name}
                </span>
                <span className="text-[12px] text-gray-400">{m.email || "no email"}</span>
                {m.teamRole === "EXTERNAL" && m.status !== "skipped" && (
                  <Badge variant="outline" className="ml-auto text-[10px]">External</Badge>
                )}
                {m.status === "skipped" && (
                  <Badge variant="error" className="ml-auto text-[10px]">Skipped</Badge>
                )}
                {m.status === "warning" && m.teamRole !== "EXTERNAL" && (
                  <span className="ml-auto text-[11px] text-gray-900" title={m.warnings?.join("; ")}>
                    {m.warnings?.[0]}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TeamsImportPage() {
  const [step, setStep] = useState<WizardStep>(1);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [_fileName, setFileName] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addToast } = useToast();

  const validRows = parsedRows.filter((r) => r.status !== "skipped");
  const skippedRows = parsedRows.filter((r) => r.status === "skipped");
  const warningRows = parsedRows.filter((r) => r.status === "warning");
  const uniqueTeams = Array.from(new Set(validRows.map((r) => r.team)));
  const uniqueEmails = Array.from(new Set(validRows.map((r) => r.email.toLowerCase())));
  const hasIssues = skippedRows.length > 0 || warningRows.length > 0;

  const teamGroups = useMemo((): TeamGroup[] => {
    const groupMap = new Map<string, { manager: ParsedRow | null; members: ParsedRow[]; skipped: ParsedRow[]; warnings: ParsedRow[] }>();

    for (const row of parsedRows) {
      if (!groupMap.has(row.team)) {
        groupMap.set(row.team, { manager: null, members: [], skipped: [], warnings: [] });
      }
      const group = groupMap.get(row.team)!;

      if (row.teamRole === "MANAGER" && row.status !== "skipped" && !group.manager) {
        group.manager = row;
      } else {
        group.members.push(row);
      }

      if (row.status === "skipped") group.skipped.push(row);
      if (row.status === "warning") group.warnings.push(row);
    }

    return Array.from(groupMap.entries()).map(([name, data]) => ({ name, ...data }));
  }, [parsedRows]);

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith(".csv")) {
      setParseError("Please upload a .csv file");
      return;
    }

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const result = parseCsv(text);
      if (result.error) {
        setParseError(result.error);
        setParsedRows([]);
      } else {
        setParseError(null);
        setParsedRows(result.rows);
        setStep(2);
      }
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleImport = async () => {
    setIsImporting(true);
    try {
      const csvRows: CsvRow[] = validRows.map((r) => ({
        name: r.name,
        email: r.email,
        team: r.team,
        role: r.role,
        ...(r.designation ? { designation: r.designation } : {}),
      }));

      const res = await fetch("/api/import/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: csvRows }),
      });

      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || "Import failed");
      }

      setImportResult(json.data);
      setStep(3);
      addToast("Import completed successfully", "success");
    } catch (err) {
      addToast(
        err instanceof Error ? err.message : "Import failed",
        "error"
      );
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Import Teams"
        description="Bulk-create teams and members from a CSV file"
      >
        <Link href="/teams">
          <Button variant="ghost">
            <ArrowLeft size={16} strokeWidth={1.5} className="mr-1.5" />
            Back
          </Button>
        </Link>
      </PageHeader>

      <StepIndicator current={step} />

      {/* Step 1: Upload */}
      {step === 1 && (
        <Card className="max-w-xl mx-auto">
          <div
            className={`border-2 border-dashed p-10 text-center cursor-pointer ${
              isDragging
                ? "border-gray-900 bg-white"
                : "border-gray-200 hover:border-gray-300"
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <Upload
              size={36}
              strokeWidth={1.5}
              className="mx-auto text-gray-400 mb-3"
            />
            <p className="text-body-emphasis text-gray-900 mb-1">
              Drop your CSV here or click to browse
            </p>
            <p className="text-[12px] text-gray-400">
              Columns: Name, Email, Team, Role (optional: Designation)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </div>

          {parseError && (
            <div className="mt-4 p-3 border border-gray-900 text-gray-900 text-[14px] flex items-center gap-2">
              <XCircle size={16} strokeWidth={1.5} />
              {parseError}
            </div>
          )}

          <div className="mt-5 pt-5 border-t border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[13px] font-medium text-gray-500">Example format</p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  downloadSampleCsv();
                }}
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-gray-900"
              >
                <Download size={12} strokeWidth={1.5} />
                Download sample
              </button>
            </div>
            <div className="border border-gray-900 overflow-x-auto">
              <table className="w-full min-w-[480px] text-[12px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-900">
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Name</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Email</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Team</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Role</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Designation</th>
                  </tr>
                </thead>
                <tbody className="text-gray-600">
                  {[
                    ["Sarah Chen", "sarah@co.com", "Engineering", "Manager", "Senior"],
                    ["Alex Rivera", "alex@co.com", "Engineering", "Member", "Mid"],
                    ["Chris Wu", "chris@co.com", "Engineering", "External", "Junior"],
                    ["Lisa Park", "lisa@co.com", "Finance", "Manager", "VP"],
                  ].map(([name, email, team, role, designation], i) => (
                    <tr key={i} className="border-b border-gray-50 last:border-0">
                      <td className="py-1.5 px-3 font-medium text-gray-900">{name}</td>
                      <td className="py-1.5 px-3">{email}</td>
                      <td className="py-1.5 px-3">{team}</td>
                      <td className="py-1.5 px-3">{role}</td>
                      <td className="py-1.5 px-3">{designation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-gray-400">
              Role: &quot;Manager&quot;, &quot;Member&quot;, or &quot;External&quot;. Designation is optional (e.g. Junior, Mid, Senior).
            </p>
          </div>
        </Card>
      )}

      {/* Step 2: Review & Import */}
      {step === 2 && (
        <div className="max-w-3xl mx-auto">
          {/* Summary bar */}
          <div className="flex flex-wrap items-center gap-4 mb-5 p-4 bg-white border border-gray-900">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gray-100 flex items-center justify-center">
                <Users size={14} strokeWidth={1.5} className="text-gray-900" />
              </div>
              <div>
                <p className="text-[18px] font-semibold text-gray-900 leading-none">{uniqueTeams.length}</p>
                <p className="text-[11px] text-gray-500">teams</p>
              </div>
            </div>
            <div className="w-px h-8 bg-gray-200" />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gray-100 flex items-center justify-center">
                <UserPlus size={14} strokeWidth={1.5} className="text-gray-900" />
              </div>
              <div>
                <p className="text-[18px] font-semibold text-gray-900 leading-none">{uniqueEmails.length}</p>
                <p className="text-[11px] text-gray-500">people</p>
              </div>
            </div>
            <div className="w-px h-8 bg-gray-200" />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gray-100 flex items-center justify-center">
                <Link2 size={14} strokeWidth={1.5} className="text-gray-900" />
              </div>
              <div>
                <p className="text-[18px] font-semibold text-gray-900 leading-none">{validRows.length}</p>
                <p className="text-[11px] text-gray-500">memberships</p>
              </div>
            </div>
            {hasIssues && (
              <>
                <div className="w-px h-8 bg-gray-200" />
                <button
                  type="button"
                  onClick={() => setShowIssues(!showIssues)}
                  className="flex items-center gap-1.5 text-[12px] font-medium text-gray-900"
                >
                  <AlertTriangle size={14} strokeWidth={1.5} />
                  {skippedRows.length + warningRows.length} issues
                  {showIssues ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              </>
            )}
          </div>

          {/* Issues detail (collapsed by default) */}
          {hasIssues && showIssues && (
            <Card padding="sm" className="mb-4">
              <div className="space-y-2">
                {skippedRows.length > 0 && (
                  <div>
                    <p className="text-[12px] font-medium text-gray-900 mb-1">
                      {skippedRows.length} rows skipped (no email)
                    </p>
                    <ul className="space-y-0.5">
                      {skippedRows.map((r) => (
                        <li key={r.rowIndex} className="text-[12px] text-gray-500">
                          {r.name} — {r.team}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {warningRows.length > 0 && (
                  <div>
                    <p className="text-[12px] font-medium text-gray-900 mb-1">
                      {warningRows.length} warnings
                    </p>
                    <ul className="space-y-0.5">
                      {warningRows.map((r) => (
                        <li key={r.rowIndex} className="text-[12px] text-gray-500">
                          {r.name} — {r.warnings?.join("; ")}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Team cards */}
          <div className="space-y-2 mb-6">
            {teamGroups.map((group) => (
              <TeamCard key={group.name} group={group} />
            ))}
          </div>

          <div className="p-3 bg-gray-50 text-[13px] text-gray-500 mb-6">
            All users created with <strong>Member</strong> company role. Team-level roles assigned from CSV.
          </div>

          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={() => {
                setStep(1);
                setParsedRows([]);
                setFileName(null);
                setShowIssues(false);
              }}
            >
              <ArrowLeft size={16} strokeWidth={1.5} className="mr-1.5" />
              Upload different file
            </Button>
            <Button onClick={handleImport} disabled={isImporting || validRows.length === 0}>
              {isImporting ? "Importing..." : `Import ${uniqueTeams.length} teams`}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Done */}
      {step === 3 && importResult && (
        <div className="max-w-xl mx-auto">
          <Card className="mb-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-11 h-11 bg-gray-100 flex items-center justify-center">
                <CheckCircle2 size={22} strokeWidth={1.5} className="text-gray-900" />
              </div>
              <div>
                <h2 className="text-[16px] font-semibold text-gray-900">Import Complete</h2>
                <p className="text-[13px] text-gray-500">
                  {importResult.teamsCreated + importResult.teamsExisted} teams &middot;{" "}
                  {importResult.usersCreated + importResult.usersExisted} users &middot;{" "}
                  {importResult.membershipsCreated + importResult.membershipsExisted} memberships
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-gray-50">
                <p className="text-[11px] text-gray-500 mb-0.5">Teams</p>
                <p className="text-[15px] font-semibold text-gray-900">
                  {importResult.teamsCreated} new
                  {importResult.teamsExisted > 0 && (
                    <span className="text-[13px] text-gray-400 font-normal"> / {importResult.teamsExisted} existing</span>
                  )}
                </p>
              </div>
              <div className="p-3 bg-gray-50">
                <p className="text-[11px] text-gray-500 mb-0.5">Users</p>
                <p className="text-[15px] font-semibold text-gray-900">
                  {importResult.usersCreated} new
                  {importResult.usersExisted > 0 && (
                    <span className="text-[13px] text-gray-400 font-normal"> / {importResult.usersExisted} existing</span>
                  )}
                </p>
              </div>
              <div className="p-3 bg-gray-50">
                <p className="text-[11px] text-gray-500 mb-0.5">Memberships</p>
                <p className="text-[15px] font-semibold text-gray-900">
                  {importResult.membershipsCreated} new
                  {importResult.membershipsExisted > 0 && (
                    <span className="text-[13px] text-gray-400 font-normal"> / {importResult.membershipsExisted} existing</span>
                  )}
                </p>
              </div>
              {importResult.rowsSkipped > 0 && (
                <div className="p-3 bg-gray-50">
                  <p className="text-[11px] text-gray-500 mb-0.5">Skipped</p>
                  <p className="text-[15px] font-semibold text-gray-900">{importResult.rowsSkipped}</p>
                </div>
              )}
            </div>

            {importResult.managersLinked > 0 && (
              <div className="mt-4 p-3 border border-gray-900 text-[13px] text-gray-900">
                {importResult.managersLinked} external manager(s) linked from existing users
              </div>
            )}

            {importResult.managersNotFound.length > 0 && (
              <div className="mt-4 p-3 border border-gray-900">
                <p className="text-[13px] font-medium text-gray-900 mb-1">
                  {importResult.managersNotFound.length} managers not found
                </p>
                <ul className="space-y-0.5">
                  {importResult.managersNotFound.map((email) => (
                    <li key={email} className="text-[12px] text-gray-900">{email}</li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <div className="flex items-center justify-center gap-3">
            <Link href="/teams">
              <Button>Go to Teams</Button>
            </Link>
            <Link href="/people">
              <Button variant="secondary">View People</Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
