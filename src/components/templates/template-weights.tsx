"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  WEIGHT_PRESETS,
  getWeightSum,
  type DirectionWeights,
  type WeightPreset,
} from "@/lib/directions";

function weightsEqual(a: DirectionWeights, b: DirectionWeights): boolean {
  return (
    a.downward === b.downward &&
    a.upward === b.upward &&
    a.lateral === b.lateral &&
    a.self === b.self &&
    a.external === b.external
  );
}

const WEIGHT_FIELDS: [keyof DirectionWeights, string][] = [
  ["downward", "Downward"],
  ["lateral", "Lateral"],
  ["upward", "Upward"],
  ["self", "Self"],
  ["external", "External"],
];

const PRESET_KEYS: WeightPreset[] = ["equal", "supervisor_focus", "peer_focus", "custom"];

interface TemplateWeightsProps {
  preset: WeightPreset | null;
  member: DirectionWeights | null;
  manager: DirectionWeights | null;
  onChange: (next: {
    preset: WeightPreset | null;
    member: DirectionWeights | null;
    manager: DirectionWeights | null;
  }) => void;
}

export function TemplateWeights({ preset, member, manager, onChange }: TemplateWeightsProps) {
  const isCustom = preset === "custom";

  // Manager column is "different" only when the user has explicitly diverged it
  // from the member column. Initial reveal flips this on; flipping it off mirrors
  // member into manager.
  const initialDifferent = useMemo(
    () => !!(member && manager && !weightsEqual(member, manager)),
    // intentionally only eval on mount of this widget
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [showManager, setShowManager] = useState(initialDifferent);

  function setPreset(p: WeightPreset) {
    const def = WEIGHT_PRESETS[p];
    // When the manager column is hidden, mirror member into manager so the API
    // payload stays consistent (`directionWeightsSchema` validates both fields).
    onChange({
      preset: p,
      member: { ...def.member },
      manager: showManager ? { ...def.manager } : { ...def.member },
    });
  }

  function clearWeights() {
    onChange({ preset: null, member: null, manager: null });
    setShowManager(false);
  }

  function updateField(role: "member" | "manager", field: keyof DirectionWeights, value: number) {
    if (role === "member" && member) {
      const nextMember = { ...member, [field]: value };
      onChange({
        preset,
        member: nextMember,
        // Mirror to manager whenever it's hidden, so the persisted "manager" weights
        // track the visible member edits.
        manager: showManager ? manager : nextMember,
      });
    } else if (role === "manager" && manager) {
      onChange({ preset, member, manager: { ...manager, [field]: value } });
    }
  }

  function toggleShowManager(next: boolean) {
    setShowManager(next);
    if (!next && member) {
      // Collapsing → mirror member into manager so saving keeps both consistent.
      onChange({ preset, member, manager: { ...member } });
    }
  }

  return (
    <div className="bg-white border border-gray-900 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[14px] font-medium uppercase tracking-caps text-gray-900">
            Scoring Weights
          </h3>
          <p className="text-[12px] text-gray-500 mt-0.5">
            Optional. How much each direction contributes to the final score.
          </p>
        </div>
        <button
          type="button"
          onClick={preset ? clearWeights : () => setPreset("equal")}
          className="text-[12px] font-medium text-gray-700 hover:text-gray-900"
        >
          {preset ? "Remove" : "Add weights"}
        </button>
      </div>

      {preset && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {PRESET_KEYS.map((key) => {
              const p = WEIGHT_PRESETS[key];
              const isActive = preset === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPreset(key)}
                  className={`border px-3 py-2.5 text-left ${
                    isActive
                      ? "border-gray-900 bg-white ring-1 ring-gray-900/30"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <p className="text-[12px] font-semibold text-gray-900">{p.label}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">
                    {p.description}
                  </p>
                </button>
              );
            })}
          </div>

          {member && (
            <div className="space-y-3">
              <WeightColumn
                label={showManager ? "For Members" : "Weights"}
                sublabel={
                  showManager
                    ? "When the subject is a team member"
                    : "Applied to every subject regardless of role"
                }
                weights={member}
                editable={isCustom}
                onChange={(field, value) => updateField("member", field, value)}
                inactiveField="upward"
                inactiveHint="Members don't have direct reports in a single team."
              />
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showManager}
                  onChange={(e) => toggleShowManager(e.target.checked)}
                  className="border-gray-300"
                />
                <span className="text-[12px] text-gray-700">
                  Different weights when subject is a manager
                </span>
              </label>
              {showManager && manager && (
                <WeightColumn
                  label="For Managers"
                  sublabel="When the subject is a team manager"
                  weights={manager}
                  editable={isCustom}
                  onChange={(field, value) => updateField("manager", field, value)}
                  inactiveField="downward"
                  inactiveHint="Managers typically have no skip-level boss within the same team."
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WeightColumn({
  label,
  sublabel,
  weights,
  editable,
  onChange,
  inactiveField,
  inactiveHint,
}: {
  label: string;
  sublabel: string;
  weights: DirectionWeights;
  editable: boolean;
  onChange: (field: keyof DirectionWeights, value: number) => void;
  inactiveField: keyof DirectionWeights;
  inactiveHint: string;
}) {
  const [showInactive, setShowInactive] = useState(false);
  const sum = getWeightSum(weights);
  const isValid = Math.abs(sum - 100) < 0.01;
  const primaryFields = WEIGHT_FIELDS.filter(([f]) => f !== inactiveField);
  const inactiveEntry = WEIGHT_FIELDS.find(([f]) => f === inactiveField)!;
  const hasInactiveValue = weights[inactiveField] > 0;

  return (
    <div className="border border-gray-100 bg-gray-50/50 p-3 space-y-2">
      <div>
        <p className="text-[12px] font-semibold text-gray-900">{label}</p>
        <p className="text-[10px] text-gray-500">{sublabel}</p>
      </div>
      <div className="space-y-1.5">
        {primaryFields.map(([field, fieldLabel]) => (
          <WeightRow
            key={field}
            field={field}
            fieldLabel={fieldLabel}
            value={weights[field]}
            editable={editable}
            onChange={onChange}
          />
        ))}
      </div>
      <div className="pt-1 border-t border-gray-200/40">
        <button
          type="button"
          onClick={() => setShowInactive(!showInactive)}
          aria-expanded={showInactive}
          aria-label={`${showInactive ? "Hide" : "Show"} ${inactiveEntry[1]} weight`}
          className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600"
        >
          {showInactive ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {inactiveEntry[1]}
          {hasInactiveValue ? (
            <span className="text-gray-900 font-medium ml-1">{weights[inactiveField]}%</span>
          ) : (
            <span className="ml-1">— 0% (cross-team)</span>
          )}
        </button>
        {showInactive && (
          <div className="mt-1.5 ml-3.5 space-y-1.5">
            <p className="text-[10px] text-gray-400 leading-relaxed">{inactiveHint}</p>
            <WeightRow
              field={inactiveField}
              fieldLabel={inactiveEntry[1]}
              value={weights[inactiveField]}
              editable={editable}
              onChange={onChange}
            />
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 pt-1 border-t border-gray-200/60">
        <span className="text-[11px] font-medium text-gray-900">Total: {sum}%</span>
        {!isValid && <span className="text-[10px] text-gray-900">Must equal 100%</span>}
      </div>
    </div>
  );
}

function WeightRow({
  field,
  fieldLabel,
  value,
  editable,
  onChange,
}: {
  field: keyof DirectionWeights;
  fieldLabel: string;
  value: number;
  editable: boolean;
  onChange: (field: keyof DirectionWeights, value: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-gray-600 w-16 shrink-0">{fieldLabel}</span>
      {editable ? (
        <div className="relative flex-1">
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={value}
            onChange={(e) =>
              onChange(field, Math.max(0, Math.min(100, Number(e.target.value) || 0)))
            }
            className="w-full border border-gray-200 bg-white px-2 py-1 text-[12px] text-gray-900 focus:outline-none focus:outline-2 focus:outline-accent focus:outline-offset-2 pr-6"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">%</span>
        </div>
      ) : (
        <div className="flex-1 flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-gray-200 overflow-hidden">
            <div className="h-full bg-gray-900" style={{ width: `${value}%` }} />
          </div>
          <span className="text-[11px] font-medium text-gray-700 w-8 text-right">{value}%</span>
        </div>
      )}
    </div>
  );
}
