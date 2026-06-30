"use client";

import { Info } from "lucide-react";
import { RichTextContent } from "@/components/ui/rich-text-content";

interface GuidelineItem {
  id: string;
  questionNumber: number;
  questionText: string;
  guideline: string;
}

interface GuidelinePanelProps {
  sectionTitle: string;
  items: GuidelineItem[];
  className?: string;
}

export function GuidelinePanel({
  sectionTitle,
  items,
  className = "",
}: GuidelinePanelProps) {
  if (items.length === 0) return null;

  return (
    <div className={`border border-gray-200 bg-gray-50 ${className}`}>
      <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
        <Info size={14} strokeWidth={1.75} className="text-gray-500" />
        <div className="min-w-0">
          <p className="text-[12px] font-semibold uppercase tracking-widest text-gray-700">
            Guidelines
          </p>
          <p className="truncate text-[12px] text-gray-400">{sectionTitle}</p>
        </div>
      </div>

      <div className="space-y-4 p-4">
        {items.map((item) => (
          <section key={item.id} className="space-y-2 border-l-2 border-gray-200 pl-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                Question {item.questionNumber}
              </p>
              <p className="mt-1 text-[13px] font-medium leading-snug text-gray-900">
                {item.questionText}
              </p>
            </div>
            <RichTextContent
              html={item.guideline}
              className="prose prose-sm max-w-none text-[13px] leading-relaxed text-gray-600 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-strong:text-gray-900"
            />
          </section>
        ))}
      </div>
    </div>
  );
}
