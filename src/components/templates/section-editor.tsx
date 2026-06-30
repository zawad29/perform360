"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronUp, Trash2, Plus, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DragHandle } from "./drag-handle";
import { QuestionEditor } from "./question-editor";
import { DIRECTIONS, type Direction } from "@/lib/directions";

interface QuestionData {
  id: string;
  text: string;
  type: "rating_scale" | "text" | "multiple_choice";
  required: boolean;
  guideline?: string;
  options?: string[];
  scaleMin?: number;
  scaleMax?: number;
  scaleLabels?: string[];
}

interface SectionData {
  id: string;
  title: string;
  description?: string;
  directions: Direction[];
  questions: QuestionData[];
}

interface SectionEditorProps {
  section: SectionData;
  showDirections: boolean;
  onUpdateSection: (data: Partial<SectionData>) => void;
  onRemoveSection: () => void;
  onAddQuestion: () => void;
  onUpdateQuestion: (questionId: string, data: Partial<QuestionData>) => void;
  onRemoveQuestion: (questionId: string) => void;
}

export function SectionEditor({
  section,
  showDirections,
  onUpdateSection,
  onRemoveSection,
  onAddQuestion,
  onUpdateQuestion,
  onRemoveQuestion,
}: SectionEditorProps) {
  const [expanded, setExpanded] = useState(true);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: section.id,
    data: { type: "section" },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const questionIds = section.questions.map((q) => q.id);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white border border-gray-900 p-5"
    >
      {/* Section header */}
      <div className="flex items-center gap-2">
        <DragHandle
          className="shrink-0"
          listeners={listeners}
          attributes={attributes}
        />

        <input
          type="text"
          value={section.title}
          onChange={(e) => onUpdateSection({ title: e.target.value })}
          aria-label="Section title"
          className="flex-1 text-headline text-gray-900 bg-transparent border-none focus:outline-none focus:ring-0 p-0 min-w-0"
          placeholder="Section title"
        />

        <Badge variant="outline" className="shrink-0">
          {section.questions.length} {section.questions.length === 1 ? "question" : "questions"}
        </Badge>

        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-label={expanded ? "Collapse section" : "Expand section"}
          aria-expanded={expanded}
          className="p-1.5 hover:bg-gray-100 shrink-0"
        >
          {expanded ? (
            <ChevronUp size={16} strokeWidth={1.5} className="text-gray-400" />
          ) : (
            <ChevronDown size={16} strokeWidth={1.5} className="text-gray-400" />
          )}
        </button>

        <button
          type="button"
          onClick={onRemoveSection}
          aria-label="Remove section"
          className="p-1.5 hover:bg-gray-100 shrink-0"
        >
          <Trash2 size={16} strokeWidth={1.5} className="text-gray-400 hover:text-gray-900" />
        </button>
      </div>

      {/* Section description */}
      {expanded && (
        <div className="mt-2 ml-8">
          <input
            type="text"
            value={section.description ?? ""}
            onChange={(e) => onUpdateSection({ description: e.target.value || undefined })}
            aria-label="Section description"
            className="w-full text-[13px] text-gray-500 bg-transparent border-none focus:outline-none focus:ring-0 p-0 placeholder:text-gray-300"
            placeholder="Section description (optional)"
          />
        </div>
      )}

      {/* Direction tags */}
      {expanded && showDirections && (
        <div className="mt-3 ml-8">
          <div className="flex items-center gap-2 mb-1.5">
            <p className="text-[11px] font-medium uppercase tracking-caps text-gray-500">
              Shown for
            </p>
            {section.directions.length === 0 && (
              <span className="text-[10px] text-gray-400">All directions</span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {DIRECTIONS.map((d) => {
              const isSelected = section.directions.includes(d.key);
              return (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => {
                    const next = isSelected
                      ? section.directions.filter((x) => x !== d.key)
                      : [...section.directions, d.key];
                    onUpdateSection({ directions: next });
                  }}
                  title={d.description}
                  className={`inline-flex items-center gap-1 border px-2 py-1 text-[11px] ${
                    isSelected
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-400"
                  }`}
                >
                  {isSelected && <Check size={10} strokeWidth={2.5} />}
                  <span className="font-medium">{d.glyph}</span>
                  <span>{d.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Questions */}
      {expanded && (
        <div className="mt-4 space-y-2">
          <SortableContext items={questionIds} strategy={verticalListSortingStrategy}>
            {section.questions.map((question) => (
              <QuestionEditor
                key={question.id}
                question={question}
                sectionId={section.id}
                onUpdate={(data) => onUpdateQuestion(question.id, data)}
                onRemove={() => onRemoveQuestion(question.id)}
              />
            ))}
          </SortableContext>

          <button
            type="button"
            onClick={onAddQuestion}
            className="w-full py-2.5 border-2 border-dashed border-gray-900 text-[13px] font-medium uppercase tracking-caps text-gray-900 hover:text-gray-600 hover:border-gray-600 flex items-center justify-center gap-1.5"
          >
            <Plus size={14} strokeWidth={2} />
            Add Question
          </button>
        </div>
      )}
    </div>
  );
}
