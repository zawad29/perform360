"use client";

import { useState } from "react";
import { Check, Info } from "lucide-react";
import type { TemplateQuestion } from "@/types/evaluation";
import { RichTextContent } from "@/components/ui/rich-text-content";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface QuestionRendererProps {
  question: TemplateQuestion;
  questionNumber: number;
  answer: string | number | boolean | undefined;
  onAnswer: (value: string | number | boolean) => void;
  hasError?: boolean;
  showPlaceholder?: boolean;
  wordLimit?: number;
  showWordCount?: boolean;
  indentClass?: string;
}

function RatingScale({
  question: q,
  answer,
  onAnswer,
}: {
  question: TemplateQuestion;
  answer: number | undefined;
  onAnswer: (value: number) => void;
}) {
  const [hoveredVal, setHoveredVal] = useState<number | null>(null);

  const scaleMin = q.scaleMin || 1;
  const scaleMax = q.scaleMax || 5;
  const values = Array.from({ length: scaleMax - scaleMin + 1 }, (_, i) => i + scaleMin);

  return (
    <div className="space-y-3">
      <TooltipProvider>
        <div className="relative flex items-center justify-between gap-1">
          {/* Track */}
          <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-[2px] bg-gray-100" />
          {/* Filled track */}
          {answer !== undefined && (
            <div
              className="absolute left-4 top-1/2 -translate-y-1/2 h-[2px] bg-gray-300 transition-all duration-150"
              style={{ width: `calc((${((answer - scaleMin) / (scaleMax - scaleMin)) * 100}%) - 8px)` }}
            />
          )}
          {values.map((val) => {
            const isSelected = answer === val;
            const isHovered = hoveredVal === val;
            const label = q.scaleLabels?.[val - scaleMin];
            return (
              <Tooltip key={val}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onAnswer(val)}
                    onMouseEnter={() => setHoveredVal(val)}
                    onMouseLeave={() => setHoveredVal(null)}
                    className={`
                      relative z-10 flex items-center justify-center transition-all duration-100
                      ${isSelected
                        ? "w-10 h-10 bg-gray-900 text-white shadow-sm scale-110"
                        : isHovered
                          ? "w-9 h-9 bg-gray-900 text-white scale-105"
                          : answer !== undefined && val < answer
                            ? "w-8 h-8 bg-gray-200 text-gray-600 border border-gray-200"
                            : "w-8 h-8 bg-white text-gray-400 border border-gray-200 hover:border-gray-400"
                      }
                    `}
                  >
                    <span className={`font-semibold tabular-nums ${isSelected || isHovered ? "text-[14px]" : "text-[12px]"}`}>
                      {val}
                    </span>
                  </button>
                </TooltipTrigger>
                {label && (
                  <TooltipContent side="top">
                    {label}
                  </TooltipContent>
                )}
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
    </div>
  );
}

export function QuestionRenderer({
  question: q,
  questionNumber,
  answer,
  onAnswer,
  hasError = false,
  showPlaceholder = false,
  wordLimit = 1000,
  showWordCount = true,
  indentClass = "pl-0 sm:pl-10",
}: QuestionRendererProps) {
  const [showGuidelineDialog, setShowGuidelineDialog] = useState(false);
  const isAnswered = answer !== undefined && answer !== "";

  return (
    <>
    <div className={`relative ${hasError ? "rounded-sm ring-1 ring-red-400 ring-offset-4" : ""}`}>
      {/* Question header */}
      <div className="flex items-start gap-3 mb-4">
        <span
          className={`
            w-6 h-6 flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5 transition-colors
            ${isAnswered ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-400"}
          `}
        >
          {isAnswered ? <Check size={11} strokeWidth={3} /> : questionNumber}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-medium text-gray-900 leading-snug">
            {showPlaceholder && !q.text ? (
              <span className="text-gray-300 italic">Question text...</span>
            ) : (
              q.text
            )}
            {q.required && <span className="text-red-500 ml-1 font-bold">*</span>}
          </p>
          {hasError && (
            <p className="text-[12px] text-red-500 font-medium mt-0.5">Required — please answer before continuing</p>
          )}
          {q.guideline && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowGuidelineDialog(true)}
                className="inline-flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-gray-600 transition-colors"
              >
                <Info size={12} strokeWidth={1.75} />
                <span>View instructions</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Rating Scale */}
      {q.type === "rating_scale" && (
        <div className={indentClass}>
          <RatingScale question={q} answer={answer as number | undefined} onAnswer={onAnswer} />
        </div>
      )}

      {/* Text Input */}
      {q.type === "text" && (() => {
        const text = (answer as string) || "";
        const wordCount = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
        const nearLimit = wordCount >= wordLimit * 0.85;

        return (
          <div className={indentClass}>
            <textarea
              value={text}
              onChange={(e) => {
                const value = e.target.value;
                const count = value.trim() === "" ? 0 : value.trim().split(/\s+/).length;
                if (!showWordCount || count <= wordLimit) onAnswer(value);
              }}
              placeholder="Share your thoughts..."
              rows={5}
              className="w-full px-3 py-3 border border-gray-200 bg-white text-[14px] text-gray-800 placeholder:text-gray-300 focus:outline-none focus:border-gray-900 resize-none transition-colors leading-relaxed"
            />
            {showWordCount && (
              <div className="flex justify-end mt-1">
                <span className={`text-[11px] tabular-nums ${nearLimit ? "text-amber-600 font-medium" : "text-gray-300"}`}>
                  {wordCount} / {wordLimit} words
                </span>
              </div>
            )}
          </div>
        );
      })()}

      {/* Multiple Choice */}
      {q.type === "multiple_choice" && q.options && (
        <div className={`${indentClass} space-y-2`}>
          {q.options.map((option, optIdx) => {
            const selected = answer === option;
            const letter = String.fromCharCode(65 + optIdx);
            return (
              <button
                key={option}
                type="button"
                onClick={() => onAnswer(option)}
                className={`
                  w-full flex items-center gap-3 text-left px-3 py-2.5 text-[14px] border transition-all
                  ${selected
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-150 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                  }
                `}
              >
                <span
                  className={`
                    w-6 h-6 flex items-center justify-center text-[11px] font-bold flex-shrink-0 transition-colors
                    ${selected ? "bg-white text-gray-900" : "bg-gray-100 text-gray-400"}
                  `}
                >
                  {selected ? <Check size={11} strokeWidth={3} /> : letter}
                </span>
                <span className="font-medium">{option}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>

      <Dialog open={showGuidelineDialog} onOpenChange={(o) => !o && setShowGuidelineDialog(false)}>
        <DialogContent className="max-w-xl max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[14px] font-semibold uppercase tracking-caps">
              <Info size={14} strokeWidth={1.75} />
              View instructions
            </DialogTitle>
          </DialogHeader>
          <RichTextContent
            html={q.guideline ?? ""}
            className="prose prose-sm max-w-none text-[13px] leading-relaxed text-gray-600 prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-strong:text-gray-900"
          />
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => setShowGuidelineDialog(false)}
              className="text-[12px] text-gray-400 hover:text-gray-600 transition-colors"
            >
              Close
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
