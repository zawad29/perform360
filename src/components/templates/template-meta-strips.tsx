"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { TemplateDesignations } from "./template-designations";
import { TemplateWeights } from "./template-weights";
import { WEIGHT_PRESETS, type DirectionWeights, type WeightPreset } from "@/lib/directions";
import type { TemplateApplicableRole } from "@/lib/template-routing";

interface DesignationOption {
  id: string;
  name: string;
}

const ROLE_OPTIONS: { value: TemplateApplicableRole; label: string }[] = [
  { value: "ANY", label: "Everyone" },
  { value: "MANAGER", label: "Manager" },
  { value: "MEMBER", label: "Member" },
];
const ROLE_SUMMARY: Record<TemplateApplicableRole, string> = {
  ANY: "Everyone",
  MANAGER: "Manager",
  MEMBER: "Member",
};

interface TemplateMetaStripsProps {
  designationIds: string[];
  onDesignationsChange: (ids: string[]) => void;
  appliesToRole: TemplateApplicableRole;
  onAppliesToRoleChange: (role: TemplateApplicableRole) => void;
  preset: WeightPreset | null;
  member: DirectionWeights | null;
  manager: DirectionWeights | null;
  onWeightsChange: (next: {
    preset: WeightPreset | null;
    member: DirectionWeights | null;
    manager: DirectionWeights | null;
  }) => void;
}

export function TemplateMetaStrips({
  designationIds,
  onDesignationsChange,
  appliesToRole,
  onAppliesToRoleChange,
  preset,
  member,
  manager,
  onWeightsChange,
}: TemplateMetaStripsProps) {
  const [openDesignations, setOpenDesignations] = useState(false);
  const [openRole, setOpenRole] = useState(false);
  const [openWeights, setOpenWeights] = useState(false);
  const [designations, setDesignations] = useState<DesignationOption[]>([]);

  // Just enough info to render the strip summary; <TemplateDesignations /> fetches its own list when opened.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/designations")
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && json.success) setDesignations(json.data as DesignationOption[]);
      })
      .catch(() => {
        /* fall back to id-count summary */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const designationSummary = (() => {
    if (designationIds.length === 0) return "All designations";
    if (designations.length === 0) {
      return `${designationIds.length} ${designationIds.length === 1 ? "designation" : "designations"}`;
    }
    const names = designationIds
      .map((id) => designations.find((d) => d.id === id)?.name)
      .filter(Boolean) as string[];
    if (names.length === 0) return `${designationIds.length} designations`;
    if (names.length <= 2) return names.join(", ");
    return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
  })();

  const weightSummary = preset ? WEIGHT_PRESETS[preset].label : "Off";

  return (
    <div className="space-y-2">
      <div>
        <Strip
          label="Designations"
          summary={designationSummary}
          open={openDesignations}
          onToggle={() => setOpenDesignations((v) => !v)}
          actionLabel={openDesignations ? "Done" : "Change"}
        />
      </div>
      {openDesignations && (
        <TemplateDesignations selected={designationIds} onChange={onDesignationsChange} />
      )}

      <div>
        <Strip
          label="Applies to"
          summary={ROLE_SUMMARY[appliesToRole]}
          open={openRole}
          onToggle={() => setOpenRole((v) => !v)}
          actionLabel={openRole ? "Done" : "Change"}
        />
      </div>
      {openRole && (
        <div className="border border-gray-200 bg-white p-3">
          <p className="mb-2 text-[12px] text-gray-500">
            Pick which team role this template scores. Subjects with a matching role get this
            template before any &ldquo;Everyone&rdquo; template.
          </p>
          <div className="flex flex-wrap gap-2">
            {ROLE_OPTIONS.map((opt) => {
              const active = appliesToRole === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onAppliesToRoleChange(opt.value)}
                  className={
                    active
                      ? "border border-gray-900 bg-gray-900 px-3 py-1.5 text-[13px] text-white"
                      : "border border-gray-300 bg-white px-3 py-1.5 text-[13px] text-gray-700 hover:bg-gray-50"
                  }
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <Strip
          label="Weights"
          summary={weightSummary}
          open={openWeights}
          onToggle={() => setOpenWeights((v) => !v)}
          actionLabel={openWeights ? "Done" : preset ? "Change" : "Add"}
        />
      </div>
      {openWeights && (
        <TemplateWeights
          preset={preset}
          member={member}
          manager={manager}
          onChange={onWeightsChange}
        />
      )}
    </div>
  );
}

function Strip({
  label,
  summary,
  open,
  onToggle,
  actionLabel,
}: {
  label: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  actionLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between gap-3 bg-white border border-gray-900 px-4 py-2.5 text-left hover:bg-gray-50"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[12px] font-medium uppercase tracking-caps text-gray-500 shrink-0">
          {label}
        </span>
        <span className="text-[13px] text-gray-900 truncate">{summary}</span>
      </div>
      <span className="flex items-center gap-1 text-[12px] font-medium text-gray-700 shrink-0">
        {actionLabel}
        {open ? (
          <ChevronUp size={14} strokeWidth={1.5} />
        ) : (
          <ChevronDown size={14} strokeWidth={1.5} />
        )}
      </span>
    </button>
  );
}
