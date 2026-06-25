"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";

interface DesignationOption {
  id: string;
  name: string;
}

interface TemplateDesignationsProps {
  selected: string[];
  onChange: (designationIds: string[]) => void;
}

export function TemplateDesignations({ selected, onChange }: TemplateDesignationsProps) {
  const [designations, setDesignations] = useState<DesignationOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/designations");
        const json = await res.json();
        if (!cancelled && json.success) setDesignations(json.data);
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

  const allDesignations = selected.length === 0;

  return (
    <div className="bg-white border border-gray-900 p-6">
      <h3 className="text-[14px] font-medium uppercase tracking-caps text-gray-900">
        Applies To Designations
      </h3>
      <p className="text-[12px] text-gray-500 mt-0.5 mb-3">
        Select which career designations use this template. None selected = applies to all designations.
      </p>

      {loading ? (
        <p className="text-[12px] text-gray-400">Loading designations…</p>
      ) : designations.length === 0 ? (
        <p className="text-[12px] text-gray-400">
          No designations defined. Members without a designation always match templates with no designation filter.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onChange([])}
            className={`inline-flex items-center gap-1.5 border px-3 py-1.5 text-[12px] ${
              allDesignations
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-200 bg-white text-gray-700 hover:border-gray-400"
            }`}
          >
            {allDesignations && <Check size={12} strokeWidth={2.5} />}
            All designations
          </button>
          {designations.map((designation) => {
            const isSelected = selected.includes(designation.id);
            return (
              <button
                key={designation.id}
                type="button"
                onClick={() => toggle(designation.id)}
                className={`inline-flex items-center gap-1.5 border px-3 py-1.5 text-[12px] ${
                  isSelected
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-400"
                }`}
              >
                {isSelected && <Check size={12} strokeWidth={2.5} />}
                {designation.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
