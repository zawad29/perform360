"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trash2, Plus, X, Settings2 } from "lucide-react";
import { DragHandle } from "./drag-handle";
import { QuestionTypeSelector, type QuestionType } from "./question-type-selector";
import { RichTextEditor } from "@/components/ui/rich-text-editor";

interface QuestionData {
  id: string;
  text: string;
  type: QuestionType;
  required: boolean;
  guideline?: string;
  options?: string[];
  scaleMin?: number;
  scaleMax?: number;
  scaleLabels?: string[];
}

interface QuestionEditorProps {
  question: QuestionData;
  sectionId: string;
  onUpdate: (data: Partial<QuestionData>) => void;
  onRemove: () => void;
}

export function QuestionEditor({ question, sectionId, onUpdate, onRemove }: QuestionEditorProps) {
  const [showSettings, setShowSettings] = useState(false);
  const hasCustomScale = question.type === "rating_scale" && (
    (question.scaleMin != null && question.scaleMin !== 1) ||
    (question.scaleMax != null && question.scaleMax !== 5) ||
    question.scaleLabels?.some((l) => l)
  );

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: question.id,
    data: { type: "question", sectionId },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const scaleMin = question.scaleMin ?? 1;
  const scaleMax = question.scaleMax ?? 5;
  const guidelineEnabled = question.guideline !== undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex gap-2 p-3 bg-gray-50 items-start group"
    >
      <DragHandle
        className="mt-2.5 shrink-0"
        listeners={listeners}
        attributes={attributes}
      />

      <div className="flex-1 min-w-0 space-y-2">
        {/* Question text */}
        <input
          type="text"
          value={question.text}
          onChange={(e) => onUpdate({ text: e.target.value })}
          aria-label="Question text"
          className="w-full text-[14px] text-gray-900 bg-white border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all duration-200"
          placeholder="Enter question text..."
        />

        {/* Type selector + required + settings toggle — single row */}
        <div className="flex flex-wrap gap-3 items-center">
          <QuestionTypeSelector
            value={question.type}
            onChange={(type) => {
              const updates: Partial<QuestionData> = { type };
              if (type === "rating_scale") {
                updates.scaleMin = question.scaleMin ?? 1;
                updates.scaleMax = question.scaleMax ?? 5;
              }
              if (type === "multiple_choice") {
                updates.options = question.options?.length ? question.options : ["Option 1", "Option 2"];
              }
              onUpdate(updates);
            }}
          />
          <label className="flex items-center gap-1.5 text-[13px] text-gray-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={question.required}
              onChange={(e) => onUpdate({ required: e.target.checked })}
              className="rounded border-gray-300 text-brand-500 focus:ring-brand-500/40"
            />
            Required
          </label>

          {/* Compact scale summary for rating questions */}
          {question.type === "rating_scale" && (
            <button
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              className={`inline-flex items-center gap-1.5 text-[12px] font-medium px-2 py-1 transition-colors ${
                showSettings || hasCustomScale
                  ? "text-brand-600 bg-brand-50"
                  : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Settings2 size={12} strokeWidth={2} />
              {scaleMin}–{scaleMax}
            </button>
          )}
        </div>

        <label className="flex items-center gap-1.5 text-[13px] text-gray-500 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={guidelineEnabled}
            onChange={(e) => onUpdate({ guideline: e.target.checked ? (question.guideline ?? "") : undefined })}
            className="rounded border-gray-300 text-brand-500 focus:ring-brand-500/40"
          />
          Reviewer guideline
        </label>

        {/* Expandable settings */}
        {question.type === "rating_scale" && showSettings && (
          <RatingScaleSettings
            scaleMin={scaleMin}
            scaleMax={scaleMax}
            scaleLabels={question.scaleLabels}
            onUpdate={onUpdate}
          />
        )}

        {question.type === "multiple_choice" && (
          <MultipleChoiceSettings
            options={question.options ?? []}
            onUpdate={onUpdate}
          />
        )}

        {guidelineEnabled && (
          <div className="space-y-1.5">
            <p className="text-[12px] text-gray-500">
              Optional guidance shown to reviewers while answering this question.
            </p>
            <RichTextEditor
              value={question.guideline ?? ""}
              onChange={(guideline) => onUpdate({ guideline })}
              placeholder="Add examples, expectations, or scoring notes..."
            />
          </div>
        )}

      </div>

      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove question"
        className="p-1.5 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
      >
        <Trash2 size={14} strokeWidth={1.5} className="text-gray-300 hover:text-red-500" />
      </button>
    </div>
  );
}

function RatingScaleSettings({
  scaleMin,
  scaleMax,
  scaleLabels,
  onUpdate,
}: {
  scaleMin: number;
  scaleMax: number;
  scaleLabels?: string[];
  onUpdate: (data: Partial<QuestionData>) => void;
}) {
  const count = scaleMax - scaleMin + 1;

  function handleLabelChange(index: number, value: string) {
    const labels = [...(scaleLabels ?? Array(count).fill(""))];
    while (labels.length < count) labels.push("");
    labels[index] = value;
    onUpdate({ scaleLabels: labels });
  }

  return (
    <div className="space-y-2 pl-0.5">
      <div className="flex items-center gap-3">
        <label className="text-[12px] text-gray-500">Range:</label>
        <input
          type="number"
          min={0}
          max={scaleMax - 1}
          value={scaleMin}
          onChange={(e) => {
            const val = parseInt(e.target.value);
            if (isNaN(val)) return;
            const clamped = Math.max(0, Math.min(val, scaleMax - 1));
            onUpdate({ scaleMin: clamped });
          }}
          className="w-16 h-7 px-2 text-[13px] border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500"
        />
        <span className="text-[12px] text-gray-400">to</span>
        <input
          type="number"
          min={scaleMin + 1}
          max={10}
          value={scaleMax}
          onChange={(e) => {
            const val = parseInt(e.target.value);
            if (isNaN(val)) return;
            const clamped = Math.max(scaleMin + 1, Math.min(val, 10));
            onUpdate({ scaleMax: clamped });
          }}
          className="w-16 h-7 px-2 text-[13px] border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500"
        />
      </div>
      <div className="space-y-1">
        <label className="text-[12px] text-gray-500">Scale labels (optional):</label>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: count }, (_, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className="text-[11px] text-gray-400 w-4 text-center">{scaleMin + i}</span>
              <input
                type="text"
                value={scaleLabels?.[i] ?? ""}
                onChange={(e) => handleLabelChange(i, e.target.value)}
                placeholder={i === 0 ? "Low" : i === count - 1 ? "High" : ""}
                className="w-24 h-7 px-2 text-[12px] border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MultipleChoiceSettings({
  options,
  onUpdate,
}: {
  options: string[];
  onUpdate: (data: Partial<QuestionData>) => void;
}) {
  function updateOption(index: number, value: string) {
    const next = [...options];
    next[index] = value;
    onUpdate({ options: next });
  }

  function addOption() {
    if (options.length >= 10) return;
    onUpdate({ options: [...options, `Option ${options.length + 1}`] });
  }

  function removeOption(index: number) {
    onUpdate({ options: options.filter((_, i) => i !== index) });
  }

  return (
    <div className="space-y-2 pl-0.5">
      <label className="text-[12px] text-gray-500">Options:</label>
      <div className="space-y-1.5">
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full border-2 border-gray-300 shrink-0" />
            <input
              type="text"
              value={opt}
              onChange={(e) => updateOption(i, e.target.value)}
              className="flex-1 h-7 px-2 text-[13px] border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500"
            />
            {options.length > 1 && (
              <button
                type="button"
                onClick={() => removeOption(i)}
                className="p-1 rounded hover:bg-red-50 transition-colors"
              >
                <X size={12} strokeWidth={2} className="text-gray-400 hover:text-red-500" />
              </button>
            )}
          </div>
        ))}
      </div>
      {options.length < 10 ? (
        <button
          type="button"
          onClick={addOption}
          className="flex items-center gap-1 text-[12px] text-gray-400 hover:text-gray-600 transition-colors"
        >
          <Plus size={12} strokeWidth={2} />
          Add option
        </button>
      ) : (
        <p className="text-[11px] text-gray-400">Maximum 10 options</p>
      )}
    </div>
  );
}
