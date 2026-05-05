"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";

interface LevelOption {
  id: string;
  name: string;
}

interface TemplateLevelsProps {
  selected: string[];
  onChange: (levelIds: string[]) => void;
}

export function TemplateLevels({ selected, onChange }: TemplateLevelsProps) {
  const [levels, setLevels] = useState<LevelOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/levels");
        const json = await res.json();
        if (!cancelled && json.success) setLevels(json.data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter((x) => x !== id));
    } else {
      onChange([...selected, id]);
    }
  }

  const allLevels = selected.length === 0;

  return (
    <div className="bg-white border border-gray-900 p-6">
      <h3 className="text-[14px] font-medium uppercase tracking-caps text-gray-900">
        Applies To Levels
      </h3>
      <p className="text-[12px] text-gray-500 mt-0.5 mb-3">
        Select which career levels use this template. None selected = applies to all levels.
      </p>

      {loading ? (
        <p className="text-[12px] text-gray-400">Loading levels…</p>
      ) : levels.length === 0 ? (
        <p className="text-[12px] text-gray-400">
          No levels defined. Members without a level always match templates with no level filter.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onChange([])}
            className={`inline-flex items-center gap-1.5 border px-3 py-1.5 text-[12px] ${
              allLevels
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-200 bg-white text-gray-700 hover:border-gray-400"
            }`}
          >
            {allLevels && <Check size={12} strokeWidth={2.5} />}
            All levels
          </button>
          {levels.map((lvl) => {
            const isSelected = selected.includes(lvl.id);
            return (
              <button
                key={lvl.id}
                type="button"
                onClick={() => toggle(lvl.id)}
                className={`inline-flex items-center gap-1.5 border px-3 py-1.5 text-[12px] ${
                  isSelected
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-400"
                }`}
              >
                {isSelected && <Check size={12} strokeWidth={2.5} />}
                {lvl.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
