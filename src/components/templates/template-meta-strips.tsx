"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { TemplateLevels } from "./template-levels";
import { TemplateWeights } from "./template-weights";
import { WEIGHT_PRESETS, type DirectionWeights, type WeightPreset } from "@/lib/directions";

interface LevelOption {
  id: string;
  name: string;
}

interface TemplateMetaStripsProps {
  levelIds: string[];
  onLevelsChange: (ids: string[]) => void;
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
  levelIds,
  onLevelsChange,
  preset,
  member,
  manager,
  onWeightsChange,
}: TemplateMetaStripsProps) {
  const [openLevels, setOpenLevels] = useState(false);
  const [openWeights, setOpenWeights] = useState(false);
  const [levels, setLevels] = useState<LevelOption[]>([]);

  // Just enough info to render the strip summary; <TemplateLevels /> fetches its own list when opened.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/levels")
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && json.success) setLevels(json.data as LevelOption[]);
      })
      .catch(() => {
        /* fall back to id-count summary */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const levelSummary = (() => {
    if (levelIds.length === 0) return "All levels";
    if (levels.length === 0) {
      return `${levelIds.length} ${levelIds.length === 1 ? "level" : "levels"}`;
    }
    const names = levelIds
      .map((id) => levels.find((l) => l.id === id)?.name)
      .filter(Boolean) as string[];
    if (names.length === 0) return `${levelIds.length} levels`;
    if (names.length <= 2) return names.join(", ");
    return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
  })();

  const weightSummary = preset ? WEIGHT_PRESETS[preset].label : "Off";

  return (
    <div className="space-y-2">
      <Strip
        label="Levels"
        summary={levelSummary}
        open={openLevels}
        onToggle={() => setOpenLevels((v) => !v)}
        actionLabel={openLevels ? "Done" : "Change"}
      />
      {openLevels && (
        <TemplateLevels selected={levelIds} onChange={onLevelsChange} />
      )}

      <Strip
        label="Weights"
        summary={weightSummary}
        open={openWeights}
        onToggle={() => setOpenWeights((v) => !v)}
        actionLabel={openWeights ? "Done" : preset ? "Change" : "Add"}
      />
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
