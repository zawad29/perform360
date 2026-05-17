"use client";

import { useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useTemplateBuilder } from "@/store/template-builder";
import { SectionEditor } from "./section-editor";
import { TemplateMetaStrips } from "./template-meta-strips";

export function TemplateBuilder() {
  const {
    name,
    description,
    levelIds,
    weightPreset,
    weightsMember,
    weightsManager,
    sections,
    useDirectionRouting,
    setName,
    setDescription,
    setLevelIds,
    setWeights,
    setUseDirectionRouting,
    addSection,
    updateSection,
    removeSection,
    moveSection,
    addQuestion,
    updateQuestion,
    removeQuestion,
    moveQuestion,
    moveQuestionBetweenSections,
  } = useTemplateBuilder();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const activeData = active.data.current as { type: string; sectionId?: string } | undefined;
      const overData = over.data.current as { type: string; sectionId?: string } | undefined;

      if (activeData?.type === "section" && overData?.type === "section") {
        const fromIndex = sections.findIndex((s) => s.id === active.id);
        const toIndex = sections.findIndex((s) => s.id === over.id);
        if (fromIndex !== -1 && toIndex !== -1) {
          moveSection(fromIndex, toIndex);
        }
        return;
      }

      if (activeData?.type === "question" && overData?.type === "question") {
        const fromSectionId = activeData.sectionId;
        const toSectionId = overData.sectionId;

        if (!fromSectionId || !toSectionId) return;

        if (fromSectionId === toSectionId) {
          const section = sections.find((s) => s.id === fromSectionId);
          if (!section) return;
          const fromIndex = section.questions.findIndex((q) => q.id === active.id);
          const toIndex = section.questions.findIndex((q) => q.id === over.id);
          if (fromIndex !== -1 && toIndex !== -1) {
            moveQuestion(fromSectionId, fromIndex, toIndex);
          }
        } else {
          const fromSection = sections.find((s) => s.id === fromSectionId);
          const toSection = sections.find((s) => s.id === toSectionId);
          if (!fromSection || !toSection) return;
          const fromIndex = fromSection.questions.findIndex((q) => q.id === active.id);
          const toIndex = toSection.questions.findIndex((q) => q.id === over.id);
          if (fromIndex !== -1 && toIndex !== -1) {
            moveQuestionBetweenSections(fromSectionId, toSectionId, fromIndex, toIndex);
          }
        }
      }
    },
    [sections, moveSection, moveQuestion, moveQuestionBetweenSections]
  );

  const sectionIds = sections.map((s) => s.id);

  return (
    <div>
      <div className="space-y-4">
          {/* Template info */}
          <div className="bg-white border border-gray-900 p-6 space-y-4">
            <Input
              id="template-name"
              data-tour="template-name"
              label="Template Name"
              placeholder="e.g. Standard 360° Review"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <div className="space-y-1.5">
              <label htmlFor="template-desc" className="block text-[14px] font-medium uppercase tracking-caps text-gray-900">
                Description
              </label>
              <textarea
                id="template-desc"
                placeholder="Brief description of this template..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full px-4 py-3 border border-gray-900 bg-white text-body placeholder:text-gray-400 focus:outline-none focus:outline-2 focus:outline-accent focus:outline-offset-2 resize-none"
              />
            </div>
          </div>

          {/* Optional config: Levels + Weights as collapsible strips */}
          <TemplateMetaStrips
            levelIds={levelIds}
            onLevelsChange={setLevelIds}
            preset={weightPreset}
            member={weightsMember}
            manager={weightsManager}
            onWeightsChange={setWeights}
          />

          {/* Direction routing opt-in */}
          <label data-tour="direction-routing" className="flex items-start gap-2 cursor-pointer bg-white border border-gray-200 px-4 py-3">
            <input
              type="checkbox"
              checked={useDirectionRouting}
              onChange={(e) => setUseDirectionRouting(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="block text-[13px] text-gray-900">
                Some sections only apply to certain review directions
              </span>
              <span className="block text-[12px] text-gray-500 mt-0.5">
                Off by default. Turn on to tag sections with directions like Downward / Upward / Lateral.
              </span>
            </span>
          </label>

          {/* Sections with DnD */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            modifiers={[restrictToVerticalAxis]}
          >
            <SortableContext items={sectionIds} strategy={verticalListSortingStrategy}>
              {sections.map((section) => (
                <SectionEditor
                  key={section.id}
                  section={section}
                  showDirections={useDirectionRouting}
                  onUpdateSection={(data) => updateSection(section.id, data)}
                  onRemoveSection={() => removeSection(section.id)}
                  onAddQuestion={() => addQuestion(section.id)}
                  onUpdateQuestion={(qId, data) => updateQuestion(section.id, qId, data)}
                  onRemoveQuestion={(qId) => removeQuestion(section.id, qId)}
                />
              ))}
            </SortableContext>
          </DndContext>

          {/* Add section button */}
          <button
            type="button"
            data-tour="add-section"
            onClick={addSection}
            className="w-full py-4 border-2 border-dashed border-gray-900 text-[14px] font-medium uppercase tracking-caps text-gray-900 hover:text-gray-600 hover:border-gray-600 flex items-center justify-center gap-1.5"
          >
            <Plus size={16} strokeWidth={2} />
            Add Section
          </button>
        </div>
    </div>
  );
}
