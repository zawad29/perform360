"use client";

import { useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Check, ChevronLeft, ChevronRight, Star } from "lucide-react";
import { QuestionRenderer } from "@/components/evaluation/question-renderer";
import { filterSectionsForDirection } from "@/lib/template-routing";

import type { TemplateQuestion } from "@/types/evaluation";
import type { Direction } from "@/lib/directions";

interface SectionData {
  id: string;
  title: string;
  description?: string;
  directions?: Direction[];
  questions: TemplateQuestion[];
}

interface TemplatePreviewProps {
  name: string;
  description: string;
  sections: SectionData[];
  // When set, only sections that would render for the given direction are shown.
  // Mirrors the runtime section filter used by /api/evaluate/[token]/form.
  directionFilter?: Direction;
}

export function TemplatePreview({ name, description, sections: rawSections, directionFilter }: TemplatePreviewProps) {
  const sections = useMemo(
    () => (directionFilter ? filterSectionsForDirection(rawSections, directionFilter) : rawSections),
    [rawSections, directionFilter]
  );
  const [currentSection, setCurrentSection] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | number | boolean>>({});

  const totalQuestions = sections.reduce((acc, s) => acc + s.questions.length, 0);
  const answeredQuestions = Object.keys(answers).length;
  const progressPercent = totalQuestions > 0 ? Math.round((answeredQuestions / totalQuestions) * 100) : 0;

  if (sections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16">
        <div className="w-16 h-16 bg-gray-100 flex items-center justify-center mb-4">
          <Star size={24} strokeWidth={1.5} className="text-gray-300" />
        </div>
        <p className="text-[14px] text-gray-400 mb-1">No sections to show</p>
        <p className="text-[12px] text-gray-300">
          {directionFilter
            ? "No section in this template renders for this direction"
            : "Add sections and questions to see a preview"}
        </p>
      </div>
    );
  }

  // Clamp out-of-range cursor when the filter shrinks the section list under us.
  const safeCurrent = Math.min(currentSection, sections.length - 1);
  const section = sections[safeCurrent];

  function getSectionAnsweredCount(sectionIndex: number) {
    return sections[sectionIndex].questions.filter((q) => answers[q.id] !== undefined).length;
  }

  function isSectionComplete(sectionIndex: number) {
    return sections[sectionIndex].questions.every((q) => answers[q.id] !== undefined);
  }

  function setAnswer(questionId: string, value: string | number | boolean) {
    setAnswers((prev) => {
      if (value === "" || value === undefined) {
        const { [questionId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [questionId]: value };
    });
  }

  const currentQuestionOffset = sections
    .slice(0, safeCurrent)
    .reduce((acc, s) => acc + s.questions.length, 0);

  return (
    <div className="bg-gray-100 overflow-hidden">
      {/* Sticky Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-900">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between py-3">
            <div className="min-w-0">
              <p className="text-headline text-gray-900 truncate">
                {name || "Untitled Template"}
              </p>
              {description && (
                <p className="text-caption-style truncate">{description}</p>
              )}
            </div>
            <div className="flex items-center gap-3 flex-shrink-0 ml-4">
              <span className="text-caption-style hidden sm:inline">
                {answeredQuestions}/{totalQuestions}
              </span>
              <Badge
                variant={progressPercent === 100 ? "success" : "outline"}
                className="tabular-nums"
              >
                {progressPercent}%
              </Badge>
            </div>
          </div>
          <Progress value={progressPercent} className="h-1" />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Section Stepper */}
        <nav className="mb-8">
          <div className="flex items-center justify-center gap-0">
            {sections.map((s, i) => {
              const complete = isSectionComplete(i);
              const active = i === safeCurrent;
              const answered = getSectionAnsweredCount(i);
              const total = s.questions.length;

              return (
                <div key={s.id ?? `sec-${i}`} className="flex items-center">
                  {i > 0 && (
                    <div
                      className={`h-[2px] w-6 sm:w-10 ${
                        isSectionComplete(i - 1) ? "bg-gray-900" : "bg-gray-200"
                      }`}
                    />
                  )}
                  <button
                    onClick={() => setCurrentSection(i)}
                    aria-label={`Section ${i + 1}: ${s.title}, ${answered} of ${total} answered${complete ? " (complete)" : ""}`}
                    aria-current={active ? "step" : undefined}
                    className={`
                      relative flex items-center justify-center
                      ${active
                        ? "w-9 h-9 bg-gray-900 text-white ring-4 ring-gray-900/15"
                        : complete
                          ? "w-7 h-7 bg-gray-900 text-white hover:ring-4 hover:ring-gray-900/15"
                          : answered > 0
                            ? "w-7 h-7 bg-white text-gray-500 border-2 border-gray-900 hover:border-gray-600"
                            : "w-7 h-7 bg-white text-gray-400 border-2 border-gray-200 hover:border-gray-900"
                      }
                    `}
                    title={`${s.title} (${answered}/${total})`}
                  >
                    {complete ? (
                      <Check size={active ? 15 : 13} strokeWidth={2.5} />
                    ) : (
                      <span className={`font-semibold ${active ? "text-[14px]" : "text-[12px]"}`}>
                        {i + 1}
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="text-center mt-3">
            <p className="text-[14px] font-medium text-gray-800">{section.title || "Untitled Section"}</p>
            <p className="text-[12px] text-gray-400 mt-0.5">
              {getSectionAnsweredCount(safeCurrent)}/{section.questions.length} answered
            </p>
          </div>
        </nav>

        {/* Section Card */}
        <Card padding="lg">
          <CardHeader className="mb-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-title-small">{section.title || "Untitled Section"}</CardTitle>
                {section.description && (
                  <CardDescription className="mt-1.5">{section.description}</CardDescription>
                )}
              </div>
              <Badge variant="outline" className="flex-shrink-0 tabular-nums">
                {getSectionAnsweredCount(safeCurrent)}/{section.questions.length}
              </Badge>
            </div>
          </CardHeader>

          <div className="space-y-10">
            {section.questions.map((q, qIdx) => (
              <QuestionRenderer
                key={q.id ?? `q-${safeCurrent}-${qIdx}`}
                question={q}
                questionNumber={currentQuestionOffset + qIdx + 1}
                answer={answers[q.id]}
                onAnswer={(val) => setAnswer(q.id, val)}
                showPlaceholder
                showWordCount={false}
                indentClass="pl-10"
              />
            ))}

            {section.questions.length === 0 && (
              <p className="text-[13px] text-gray-400 italic text-center py-4">
                No questions in this section
              </p>
            )}
          </div>
        </Card>

        {/* Navigation Footer */}
        <div className="flex items-center justify-between mt-6 pb-2">
          <Button
            variant="ghost"
            onClick={() => setCurrentSection(Math.max(0, safeCurrent - 1))}
            disabled={safeCurrent === 0}
          >
            <ChevronLeft size={16} strokeWidth={1.5} className="mr-1" />
            Previous
          </Button>

          <span className="text-caption-style tabular-nums hidden sm:inline">
            Section {safeCurrent + 1} of {sections.length}
          </span>

          {safeCurrent < sections.length - 1 ? (
            <Button onClick={() => setCurrentSection(safeCurrent + 1)}>
              Next
              <ChevronRight size={16} strokeWidth={1.5} className="ml-1" />
            </Button>
          ) : (
            <Button disabled>
              Submit
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
