"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Save, RotateCcw, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";

interface CalibrationSubject {
  subjectId: string;
  subjectName: string;
  teamId: string;
  teamName: string;
  rawScore: number;
  calibratedScore: number | null;
  justification: string | null;
  adjustedByName: string | null;
  updatedAt: string | null;
}

interface TeamCalibrationSummary {
  teamId: string;
  teamName: string;
  avgRawScore: number;
  avgCalibratedScore: number | null;
  calibrationOffset: number | null;
  calibrationJustification: string | null;
  memberCount: number;
}

export interface CalibrationData {
  cycleId: string;
  cycleName: string;
  subjects: CalibrationSubject[];
  teamSummaries: TeamCalibrationSummary[];
}

interface TeamOffsetEdit {
  offset: number;
  justification: string;
}

interface MemberEdit {
  calibratedScore: number;
  justification: string;
}

interface CalibrationPanelProps {
  cycleId: string;
  data: CalibrationData;
  readOnly?: boolean;
  onSaved?: () => void;
}

// Compact inline input — bypasses the ui/Input wrapper to avoid h-11 + label chrome
function CellInput(props: React.InputHTMLAttributes<HTMLInputElement> & { hasError?: boolean }) {
  const { className = "", hasError, ...rest } = props;
  // hasError thickens the border *and* sets aria-invalid so screen readers and
  // keyboard users get the same signal as sighted users (the visible difference
  // is greyscale-only and easy to miss).
  return (
    <input
      aria-invalid={hasError || undefined}
      className={`h-7 px-2 border bg-white text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:outline-2 focus:outline-accent focus:outline-offset-2 ${hasError ? "border-2 border-accent" : "border-gray-200"} ${className}`}
      {...rest}
    />
  );
}

export function CalibrationPanel({ cycleId, data, readOnly = false, onSaved }: CalibrationPanelProps) {
  const [teamOffsets, setTeamOffsets] = useState<Map<string, TeamOffsetEdit>>(new Map());
  const [memberEdits, setMemberEdits] = useState<Map<string, MemberEdit>>(new Map());
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set(data.teamSummaries.map((t) => t.teamId)));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Initialize from existing data
  useEffect(() => {
    const offsets = new Map<string, TeamOffsetEdit>();
    for (const ts of data.teamSummaries) {
      if (ts.calibrationOffset !== null) {
        offsets.set(ts.teamId, {
          offset: ts.calibrationOffset,
          justification: ts.calibrationJustification ?? "",
        });
      }
    }
    setTeamOffsets(offsets);

    const edits = new Map<string, MemberEdit>();
    for (const s of data.subjects) {
      if (s.calibratedScore !== null && s.justification !== null) {
        edits.set(`${s.subjectId}:${s.teamId}`, {
          calibratedScore: s.calibratedScore,
          justification: s.justification,
        });
      }
    }
    setMemberEdits(edits);
  }, [data]);

  const isDirty = teamOffsets.size > 0 || memberEdits.size > 0;

  const toggleTeam = useCallback((teamId: string) => {
    setExpandedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  }, []);

  const updateTeamOffset = useCallback((teamId: string, field: keyof TeamOffsetEdit, value: string | number) => {
    setTeamOffsets((prev) => {
      const next = new Map(prev);
      const existing = next.get(teamId) ?? { offset: 0, justification: "" };
      next.set(teamId, { ...existing, [field]: value });
      return next;
    });
  }, []);

  const updateMemberEdit = useCallback((key: string, field: keyof MemberEdit, value: string | number) => {
    setMemberEdits((prev) => {
      const next = new Map(prev);
      const existing = next.get(key) ?? { calibratedScore: 0, justification: "" };
      next.set(key, { ...existing, [field]: value });
      return next;
    });
  }, []);

  const removeMemberEdit = useCallback((key: string) => {
    setMemberEdits((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);

    // Validate: all entries with an offset/score must have justification
    const missingTeamJustifications = Array.from(teamOffsets.entries())
      .filter(([, v]) => v.offset !== 0 && v.justification.trim().length === 0);
    const missingMemberJustifications = Array.from(memberEdits.entries())
      .filter(([, v]) => v.justification.trim().length === 0);

    if (missingTeamJustifications.length > 0 || missingMemberJustifications.length > 0) {
      setSaveError("Please add a justification for all calibration adjustments.");
      setSaving(false);
      return;
    }

    const teamAdjustments = Array.from(teamOffsets.entries())
      .filter(([, v]) => v.offset !== 0)
      .map(([teamId, v]) => ({
        teamId,
        offset: v.offset,
        justification: v.justification.trim(),
      }));

    const memberAdjustments = Array.from(memberEdits.entries())
      .map(([key, v]) => {
        const [subjectId, teamId] = key.split(":");
        const subject = data.subjects.find((s) => s.subjectId === subjectId && s.teamId === teamId);
        return {
          subjectId,
          teamId,
          rawScore: subject?.rawScore ?? 0,
          calibratedScore: v.calibratedScore,
          justification: v.justification.trim(),
        };
      });

    try {
      const res = await fetch(`/api/cycles/${cycleId}/calibration`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamAdjustments, memberAdjustments }),
      });
      const json = await res.json();
      if (!json.success) {
        setSaveError(json.error ?? "Failed to save");
        return;
      }
      onSaved?.();
    } catch {
      setSaveError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Group subjects by team
  const subjectsByTeam = new Map<string, CalibrationSubject[]>();
  for (const s of data.subjects) {
    const existing = subjectsByTeam.get(s.teamId) ?? [];
    existing.push(s);
    subjectsByTeam.set(s.teamId, existing);
  }

  return (
    <div className="space-y-3">
      {/* Cross-team comparison — horizontal scroll with arrow buttons */}
      <ScrollRow>
        {data.teamSummaries.map((ts) => {
          const offset = teamOffsets.get(ts.teamId);
          const members = subjectsByTeam.get(ts.teamId) ?? [];
          const teamOff = offset?.offset ?? 0;

          // Compute effective avg from each member's actual effective score
          const scores = members.map((m) => {
            const edit = memberEdits.get(`${m.subjectId}:${m.teamId}`);
            if (edit) return edit.calibratedScore;
            if (teamOff !== 0) return Math.min(5, Math.max(0, m.rawScore + teamOff));
            return m.calibratedScore;
          }).filter((s): s is number => s !== null);

          const effectiveAvg = scores.length > 0
            ? parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2))
            : ts.avgCalibratedScore;

          return (
            <div key={ts.teamId} className="bg-white border border-gray-100 px-3 py-2.5 min-w-[150px] max-w-[180px] shrink-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12px] font-medium text-gray-900 truncate">{ts.teamName}</span>
                <span className="text-[11px] text-gray-400 ml-1 shrink-0">{ts.memberCount}</span>
              </div>
              <div className="flex items-baseline gap-2.5">
                <div className="leading-none">
                  <span className="text-[10px] uppercase tracking-wide text-gray-400">Raw</span>
                  <p className="text-[15px] font-semibold text-gray-900 tabular-nums">{ts.avgRawScore.toFixed(2)}</p>
                </div>
                {effectiveAvg !== null && (
                  <div className="leading-none">
                    <span className="text-[10px] uppercase tracking-wide text-gray-400">Cal</span>
                    <p className="text-[15px] font-semibold text-gray-900 tabular-nums">{effectiveAvg.toFixed(2)}</p>
                  </div>
                )}
                {offset && offset.offset !== 0 && <DeltaBadge value={offset.offset} />}
              </div>
            </div>
          );
        })}
      </ScrollRow>

      {/* Per-team calibration sections */}
      {data.teamSummaries.map((ts) => {
        const isExpanded = expandedTeams.has(ts.teamId);
        const members = subjectsByTeam.get(ts.teamId) ?? [];
        const offset = teamOffsets.get(ts.teamId);

        return (
          <div key={ts.teamId} className="bg-white border border-gray-100">
            <button
              onClick={() => toggleTeam(ts.teamId)}
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50/50"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-semibold text-gray-900">{ts.teamName}</span>
                <span className="text-[11px] text-gray-400">{members.length}</span>
                {offset && offset.offset !== 0 && <DeltaBadge value={offset.offset} />}
              </div>
              {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
            </button>

            {isExpanded && (
              <div className="px-3 pb-3 space-y-2">
                {/* Team-level offset */}
                {!readOnly && (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 bg-gray-50 px-2.5 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider shrink-0">Offset</span>
                      <CellInput
                        type="number"
                        step="0.1"
                        min={-5}
                        max={5}
                        placeholder="0.0"
                        aria-label={`${ts.teamName} team offset`}
                        className="w-16 text-center tabular-nums"
                        value={offset?.offset ?? ""}
                        onChange={(e) => updateTeamOffset(ts.teamId, "offset", parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <CellInput
                      placeholder="Justification required"
                      aria-label={`${ts.teamName} offset justification`}
                      className="flex-1 min-w-0"
                      value={offset?.justification ?? ""}
                      onChange={(e) => updateTeamOffset(ts.teamId, "justification", e.target.value)}
                      hasError={!!(offset && offset.offset !== 0 && !offset.justification?.trim())}
                    />
                  </div>
                )}

                {/* Member table — dense spreadsheet style */}
                <div className="overflow-x-auto -mx-3 px-3">
                <table className="w-full min-w-[540px]">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-1 text-[11px] font-medium text-gray-400 uppercase tracking-wider">Name</th>
                      <th className="text-center py-1 text-[11px] font-medium text-gray-400 uppercase tracking-wider w-16">Raw</th>
                      <th className="text-center py-1 text-[11px] font-medium text-gray-400 uppercase tracking-wider w-20">Cal.</th>
                      <th className="text-center py-1 text-[11px] font-medium text-gray-400 uppercase tracking-wider w-14">&Delta;</th>
                      <th className="text-left py-1 text-[11px] font-medium text-gray-400 uppercase tracking-wider">Justification</th>
                      {!readOnly && <th className="w-7"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((member) => {
                      const key = `${member.subjectId}:${member.teamId}`;
                      const edit = memberEdits.get(key);
                      const teamOff = offset?.offset ?? 0;

                      const effectiveScore = edit
                        ? edit.calibratedScore
                        : teamOff !== 0
                          ? parseFloat(Math.min(5, Math.max(0, member.rawScore + teamOff)).toFixed(2))
                          : member.calibratedScore;
                      const delta = effectiveScore !== null ? effectiveScore - member.rawScore : null;

                      return (
                        <tr key={key} className="border-b border-gray-50 hover:bg-gray-50/30">
                          <td className="py-1.5 text-[13px] text-gray-900">{member.subjectName}</td>
                          <td className="py-1.5 text-center text-[13px] text-gray-500 tabular-nums">{member.rawScore.toFixed(2)}</td>
                          <td className="py-1.5 text-center">
                            {readOnly ? (
                              <span className={`text-[13px] tabular-nums ${effectiveScore !== null ? "text-gray-900 font-medium" : "text-gray-300"}`}>
                                {effectiveScore?.toFixed(2) ?? "—"}
                              </span>
                            ) : (
                              <CellInput
                                type="number"
                                step="0.1"
                                min={0}
                                max={5}
                                aria-label={`${member.subjectName} calibrated score`}
                                className="w-16 text-center mx-auto tabular-nums"
                                placeholder={effectiveScore?.toFixed(2) ?? "—"}
                                value={edit?.calibratedScore ?? ""}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  if (!isNaN(val)) {
                                    updateMemberEdit(key, "calibratedScore", val);
                                  }
                                }}
                              />
                            )}
                          </td>
                          <td className="py-1.5 text-center">
                            {delta !== null ? <DeltaBadge value={parseFloat(delta.toFixed(2))} /> : <span className="text-gray-300 text-[12px]">—</span>}
                          </td>
                          <td className="py-1.5">
                            {readOnly ? (
                              <span className="text-[12px] text-gray-500">{edit?.justification ?? member.justification ?? "—"}</span>
                            ) : (
                              <CellInput
                                placeholder="Required"
                                aria-label={`${member.subjectName} calibration justification`}
                                className="w-full text-[12px]"
                                value={edit?.justification ?? ""}
                                onChange={(e) => updateMemberEdit(key, "justification", e.target.value)}
                                hasError={!!(edit && !edit.justification?.trim())}
                              />
                            )}
                          </td>
                          {!readOnly && (
                            <td className="py-1.5 text-center">
                              {edit && (
                                <button
                                  onClick={() => removeMemberEdit(key)}
                                  className="text-gray-300 hover:text-gray-900 p-0.5"
                                  title="Remove override"
                                  aria-label="Remove override"
                                >
                                  <RotateCcw size={12} />
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Save bar — compact sticky footer */}
      {!readOnly && (
        <div className="sticky bottom-3 z-10">
          <div className="bg-white border border-gray-900 px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              {saveError && (
                <>
                  <AlertTriangle size={12} className="text-gray-900 shrink-0" />
                  <span className="text-[12px] text-gray-900 truncate">{saveError}</span>
                </>
              )}
              {!saveError && isDirty && (
                <span className="text-[12px] text-gray-400">
                  {teamOffsets.size} offset(s), {memberEdits.size} override(s)
                </span>
              )}
            </div>
            <Button size="sm" onClick={handleSave} disabled={saving || !isDirty}>
              <Save size={12} className="mr-1" />
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ScrollRow({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => ro.disconnect();
  }, [checkScroll]);

  const scroll = (dir: -1 | 1) => {
    ref.current?.scrollBy({ left: dir * 200, behavior: "smooth" });
  };

  return (
    <div className="relative group">
      {/* Left arrow */}
      {canScrollLeft && (
        <button
          onClick={() => scroll(-1)}
          aria-label="Scroll left"
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 bg-white border border-gray-900 flex items-center justify-center text-gray-500 hover:text-gray-900 -ml-1"
        >
          <ChevronLeft size={14} />
        </button>
      )}
      {/* Right arrow */}
      {canScrollRight && (
        <button
          onClick={() => scroll(1)}
          aria-label="Scroll right"
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 bg-white border border-gray-900 flex items-center justify-center text-gray-500 hover:text-gray-900 -mr-1"
        >
          <ChevronRight size={14} />
        </button>
      )}
      {/* Fade edges */}
      {canScrollLeft && (
        <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-gray-50 to-transparent z-[1] pointer-events-none" />
      )}
      {canScrollRight && (
        <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-gray-50 to-transparent z-[1] pointer-events-none" />
      )}
      <div
        ref={ref}
        onScroll={checkScroll}
        className="flex gap-2 overflow-x-auto px-1 py-1 scrollbar-none"
      >
        {children}
      </div>
    </div>
  );
}

function DeltaBadge({ value }: { value: number }) {
  if (value === 0) return null;
  const isPositive = value > 0;
  return (
    <Badge
      variant={isPositive ? "success" : "error"}
      className="text-[10px] font-mono px-1.5 py-0"
    >
      {isPositive ? "+" : ""}{value.toFixed(2)}
    </Badge>
  );
}
