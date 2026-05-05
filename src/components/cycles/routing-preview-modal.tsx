"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { TemplatePreview } from "@/components/templates/template-preview";
import {
  DIRECTIONS,
  DIRECTION_LABELS,
  type Direction,
  type DirectionWeights,
} from "@/lib/directions";
import type { TemplateMeta } from "@/lib/template-routing";
import type { TemplateQuestion } from "@/types/evaluation";

interface RoutingPreviewModalProps {
  open: boolean;
  onClose: () => void;
  template: TemplateMeta & { name: string; description?: string | null };
  // When previewing a real subject — name + role/level label.
  // When previewing an abstract role × level cell — leave subjectName undefined.
  subjectName?: string;
  subjectLabel: string; // e.g. "MEMBER · SE L-1"
  // The subject's role drives which weight column applies.
  subjectRole: "MANAGER" | "MEMBER" | "EXTERNAL";
  weightsMember: DirectionWeights | null;
  weightsManager: DirectionWeights | null;
  // Restrict the direction tab strip when previewing a real subject who only
  // has assignments in some directions (e.g. external reviewer is irrelevant).
  // Empty / undefined means all 5 directions are shown.
  availableDirections?: Direction[];
}

const ROLE_TO_PROFILE: Record<RoutingPreviewModalProps["subjectRole"], "member" | "manager"> = {
  MANAGER: "manager",
  MEMBER: "member",
  EXTERNAL: "member",
};

export function RoutingPreviewModal({
  open,
  onClose,
  template,
  subjectName,
  subjectLabel,
  subjectRole,
  weightsMember,
  weightsManager,
  availableDirections,
}: RoutingPreviewModalProps) {
  const directions = availableDirections && availableDirections.length > 0
    ? DIRECTIONS.filter((d) => availableDirections.includes(d.key))
    : DIRECTIONS;

  const [activeDirection, setActiveDirection] = useState<Direction>(directions[0]?.key ?? "DOWNWARD");

  const profile = ROLE_TO_PROFILE[subjectRole];
  const appliedWeights = profile === "manager" ? weightsManager : weightsMember;

  // Cast template sections to the shape TemplatePreview expects.
  // The runtime shape is identical; we just narrow `questions: unknown[]`.
  const sections = (template.sections ?? []).map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    directions: s.directions,
    questions: (s.questions as TemplateQuestion[]) ?? [],
  }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl p-0 flex flex-col max-h-[85vh] w-[95vw] overflow-hidden">
        <DialogHeader className="px-5 pt-4 pb-0 mb-0 shrink-0">
          <DialogTitle>
            {subjectName ? `${subjectName}'s evaluation` : "Routing preview"}
          </DialogTitle>
          <DialogDescription>
            <span className="text-gray-700">{subjectLabel}</span>
            <span className="text-gray-300 mx-2">·</span>
            <span>Template: {template.name}</span>
          </DialogDescription>
        </DialogHeader>

        {/* Direction tab strip */}
        <div className="flex border-b border-gray-200 px-5 mt-3 overflow-x-auto shrink-0" role="tablist">
          {directions.map((d) => {
            const active = d.key === activeDirection;
            return (
              <button
                key={d.key}
                role="tab"
                aria-selected={active}
                onClick={() => setActiveDirection(d.key)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium uppercase tracking-caps shrink-0 ${
                  active
                    ? "text-gray-900 border-b-2 border-accent -mb-px"
                    : "text-gray-500 hover:text-gray-900"
                }`}
                title={d.description}
              >
                <span aria-hidden="true">{d.glyph}</span>
                {d.label}
              </button>
            );
          })}
        </div>

        {/* Preview body — uses the rich TemplatePreview with directionFilter */}
        <div className="flex-1 min-h-0 overflow-y-auto bg-gray-50">
          <TemplatePreview
            name={template.name}
            description={template.description ?? ""}
            sections={sections}
            directionFilter={activeDirection}
          />
        </div>

        {/* Weights footer */}
        <div className="border-t border-gray-200 bg-white px-5 py-2 flex items-center gap-2.5 flex-wrap shrink-0">
          <Badge variant="outline" className="shrink-0">
            {profile === "manager" ? "Manager profile" : "Member profile"}
          </Badge>
          {appliedWeights ? (
            <div className="flex items-center gap-3 text-[12px] text-gray-600 flex-wrap">
              {DIRECTIONS.map((d) => {
                const value = appliedWeights[d.key.toLowerCase() as keyof DirectionWeights];
                const isCurrent = d.key === activeDirection;
                return (
                  <span
                    key={d.key}
                    className={isCurrent ? "text-gray-900 font-semibold" : ""}
                  >
                    <span aria-hidden="true">{d.glyph}</span> {Math.round(value)}%
                  </span>
                );
              })}
            </div>
          ) : (
            <span className="text-[12px] text-gray-500">
              No weights configured · {DIRECTION_LABELS[activeDirection]} averages contribute equally
            </span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
