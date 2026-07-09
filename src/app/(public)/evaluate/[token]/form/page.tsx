"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2, ChevronLeft, ChevronRight, Send, Loader2,
  AlertCircle, Check, Shield, ArrowRight
} from "lucide-react";
import { QuestionRenderer } from "@/components/evaluation/question-renderer";

import type { AnswerMap, TemplateSection } from "@/types/evaluation";
import { DIRECTION_LABELS, type Direction } from "@/lib/directions";
import { requiredUnanswered, firstBlockedSection } from "@/lib/evaluation-form";

interface FormData {
  subjectName: string;
  cycleName: string;
  direction: Direction;
  sections: TemplateSection[];
  isImpersonator: boolean;
}

export default function EvaluationFormPage({ params: paramsPromise }: { params: Promise<{ token: string }> }) {
  const params = use(paramsPromise);
  const router = useRouter();
  const [formData, setFormData] = useState<FormData | null>(null);
  const [isLoadingForm, setIsLoadingForm] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [currentSection, setCurrentSection] = useState(0);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [sectionErrors, setSectionErrors] = useState<Set<string>>(new Set());
  const [showValidation, setShowValidation] = useState(false);
  const [remainingEvals, setRemainingEvals] = useState<
    Array<{ token: string; subjectName: string; cycleName: string; direction: Direction }>
  >([]);

  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (Object.keys(answers).length > 0 && !isSubmitted) {
        e.preventDefault();
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [answers, isSubmitted]);

  useEffect(() => {
    async function loadForm() {
      try {
        const res = await fetch(`/api/evaluate/${params.token}/form`);
        const data = await res.json();
        if (!res.ok || !data.success) {
          if (data.code === "NO_SESSION" || data.code === "SESSION_EXPIRED") {
            router.replace(`/evaluate/${params.token}`);
            return;
          }
          setLoadError(data.error || "Failed to load evaluation form");
          return;
        }
        setFormData(data.data);
      } catch {
        setLoadError("Failed to load evaluation form");
      } finally {
        setIsLoadingForm(false);
      }
    }
    loadForm();
  }, [params.token, router]);

  if (isLoadingForm) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={24} className="text-gray-400 animate-spin" />
          <p className="text-[13px] text-gray-400">Preparing your form...</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-[420px] text-center">
          <div className="w-14 h-14 bg-white border border-gray-200 flex items-center justify-center mx-auto mb-5">
            <AlertCircle size={24} strokeWidth={1.5} className="text-gray-400" />
          </div>
          <h1 className="text-[18px] font-semibold text-gray-900 tracking-tight">Unable to Load Form</h1>
          <p className="text-[14px] text-gray-500 mt-2">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!formData) return null;

  const { sections, subjectName, cycleName, direction, isImpersonator } = formData;
  const directionLabel = DIRECTION_LABELS[direction] ?? direction;
  const section = sections[currentSection];
  const totalQuestions = sections.reduce((acc, s) => acc + s.questions.length, 0);
  const answeredQuestions = Object.keys(answers).length;
  const progressPercent = totalQuestions > 0 ? Math.round((answeredQuestions / totalQuestions) * 100) : 0;

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
    if (value !== "" && value !== undefined && sectionErrors.has(questionId)) {
      setSectionErrors((prev) => {
        const next = new Set(prev);
        next.delete(questionId);
        return next;
      });
    }
  }

  function goToSection(target: number) {
    if (target > currentSection) {
      const blocked = firstBlockedSection(sections, answers, currentSection, target);
      if (blocked !== -1) {
        setSectionErrors(new Set(requiredUnanswered(sections[blocked], answers)));
        setShowValidation(true);
        setCurrentSection(blocked);
        return;
      }
    }
    setSectionErrors(new Set());
    setShowValidation(false);
    setCurrentSection(target);
  }

  function validateAllSections(): { valid: boolean; firstInvalidSection: number } {
    const allMissing: string[] = [];
    let firstInvalid = -1;

    for (let i = 0; i < sections.length; i++) {
      const unanswered = requiredUnanswered(sections[i], answers);
      if (unanswered.length > 0 && firstInvalid === -1) firstInvalid = i;
      allMissing.push(...unanswered);
    }

    if (allMissing.length > 0) {
      setSectionErrors(new Set(requiredUnanswered(sections[firstInvalid], answers)));
      setShowValidation(true);
      return { valid: false, firstInvalidSection: firstInvalid };
    }

    setSectionErrors(new Set());
    setShowValidation(false);
    return { valid: true, firstInvalidSection: -1 };
  }

  async function handleSubmit() {
    setIsSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch(`/api/evaluate/${params.token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setRemainingEvals(data.data?.remaining ?? []);
        setIsSubmitted(true);
      } else {
        if (data.code === "MISSING_REQUIRED") {
          const result = validateAllSections();
          if (!result.valid && result.firstInvalidSection !== currentSection) {
            setCurrentSection(result.firstInvalidSection);
          }
        }
        setSubmitError(data.error || "Failed to submit evaluation");
      }
    } catch {
      setSubmitError("Failed to submit evaluation. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Success state ──
  if (isSubmitted) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-[480px] space-y-6">
          <div className="text-center">
            <div className="w-16 h-16 bg-gray-900 flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 size={32} strokeWidth={1.5} className="text-white" />
            </div>
            <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">Submitted</h1>
            <p className="text-[14px] text-gray-500 mt-2">
              Your evaluation for <span className="font-medium text-gray-900">{subjectName}</span> has been recorded.
            </p>
          </div>

          <div className="flex items-start gap-3 px-4 py-3 bg-gray-50 border border-gray-100">
            <Shield size={15} strokeWidth={1.5} className="text-gray-400 flex-shrink-0 mt-0.5" />
            <p className="text-[13px] text-gray-500 leading-relaxed">
              Responses are end-to-end encrypted. Only authorized administrators can view results.
            </p>
          </div>

          {remainingEvals.length > 0 && (
            <div>
              <p className="text-[12px] font-semibold text-gray-400 uppercase tracking-widest mb-3">
                {remainingEvals.length} remaining
              </p>
              <div className="space-y-2">
                {remainingEvals.map((ev) => (
                  <a
                    key={ev.token}
                    href={`/evaluate/${ev.token}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 bg-white border border-gray-200 hover:border-gray-900 hover:bg-gray-50 transition-colors group"
                  >
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium text-gray-900 truncate">{ev.subjectName}</p>
                      <p className="text-[12px] text-gray-400 truncate mt-0.5">
                        {ev.cycleName} · {DIRECTION_LABELS[ev.direction] ?? ev.direction}
                      </p>
                    </div>
                    <ArrowRight size={15} strokeWidth={1.5} className="text-gray-300 group-hover:text-gray-900 flex-shrink-0 transition-colors" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const currentQuestionOffset = sections
    .slice(0, currentSection)
    .reduce((acc, s) => acc + s.questions.length, 0);

  const isLastSection = currentSection === sections.length - 1;

  // ── Form ──
  return (
    <div className="flex-1 bg-white">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between py-3 gap-4">
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-gray-900 truncate">
                {subjectName}
              </p>
              <p className="text-[12px] text-gray-400 truncate">
                {cycleName} · {directionLabel}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="text-[12px] text-gray-400 hidden sm:inline tabular-nums">
                {answeredQuestions}/{totalQuestions}
              </span>
              <div className="flex items-center gap-2">
                <div className="w-20 h-1 bg-gray-100 hidden sm:block">
                  <div
                    className="h-full bg-gray-900 transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <span className="text-[12px] font-semibold text-gray-900 tabular-nums w-8 text-right">
                  {progressPercent}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Impersonator notice */}
      {isImpersonator && (
        <div className="border-b border-amber-200 bg-amber-50">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 py-2.5 flex items-center gap-2">
            <AlertCircle size={14} strokeWidth={1.5} className="text-amber-600 flex-shrink-0" />
            <p className="text-[13px] text-amber-800">
              Submitting on behalf of <span className="font-medium">{subjectName}</span>
            </p>
          </div>
        </div>
      )}

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
            {/* Section stepper */}
            {sections.length > 1 && (
              <nav className="mb-8">
                <div className="flex items-center justify-center gap-0">
                  {sections.map((s, i) => {
                    const complete = isSectionComplete(i);
                    const active = i === currentSection;
                    const answered = getSectionAnsweredCount(i);

                    return (
                      <div key={i} className="flex items-center">
                        {i > 0 && (
                          <div className={`h-px w-6 sm:w-10 transition-colors ${complete || isSectionComplete(i - 1) ? "bg-gray-300" : "bg-gray-100"}`} />
                        )}
                        <button
                          type="button"
                          onClick={() => goToSection(i)}
                          title={`${s.title} (${answered}/${s.questions.length})`}
                          className={`
                            relative flex items-center justify-center transition-all
                            ${active
                              ? "w-9 h-9 bg-gray-900 text-white"
                              : complete
                                ? "w-7 h-7 bg-gray-900 text-white"
                                : answered > 0
                                  ? "w-7 h-7 bg-white text-gray-900 border border-gray-300"
                                  : "w-7 h-7 bg-white text-gray-300 border border-gray-100"
                            }
                          `}
                        >
                          {complete && !active ? (
                            <Check size={12} strokeWidth={3} />
                          ) : (
                            <span className={`font-semibold tabular-nums ${active ? "text-[13px]" : "text-[11px]"}`}>{i + 1}</span>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="text-center mt-3">
                  <p className="text-[14px] font-medium text-gray-900">{section.title}</p>
                  {section.description && (
                    <p className="text-[12px] text-gray-400 mt-0.5">{section.description}</p>
                  )}
                </div>
              </nav>
            )}

            {/* Single section title (when only one section) */}
            {sections.length === 1 && (
              <div className="mb-8">
                <h2 className="text-[18px] font-semibold text-gray-900">{section.title}</h2>
                {section.description && (
                  <p className="text-[13px] text-gray-400 mt-1">{section.description}</p>
                )}
              </div>
            )}

            {/* Validation banner */}
            {showValidation && sectionErrors.size > 0 && (
              <div className="mb-6 flex items-center gap-2.5 px-4 py-3 bg-red-50 border border-red-200">
                <AlertCircle size={14} strokeWidth={1.5} className="text-red-500 flex-shrink-0" />
                <p className="text-[13px] text-red-700">
                  {sectionErrors.size} required {sectionErrors.size === 1 ? "question" : "questions"} need answers before you can continue
                </p>
              </div>
            )}

            {/* Questions */}
            <div className="space-y-10">
              {section.questions.map((q, qIdx) => (
                <QuestionRenderer
                  key={q.id}
                  question={q}
                  questionNumber={currentQuestionOffset + qIdx + 1}
                  answer={answers[q.id]}
                  onAnswer={(val) => setAnswer(q.id, val)}
                  hasError={showValidation && sectionErrors.has(q.id)}
                  showWordCount
                />
              ))}
            </div>

            {/* Submit error */}
            {submitError && (
              <div className="mt-6 flex items-center gap-2.5 px-4 py-3 bg-red-50 border border-red-200">
                <AlertCircle size={14} strokeWidth={1.5} className="text-red-500 flex-shrink-0" />
                <p className="text-[13px] text-red-700">{submitError}</p>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-10 pt-6 border-t border-gray-100">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => goToSection(Math.max(0, currentSection - 1))}
                disabled={currentSection === 0}
                className="text-gray-500"
              >
                <ChevronLeft size={15} strokeWidth={1.5} className="mr-1" />
                Previous
              </Button>

              <span className="text-[11px] font-medium text-gray-300 uppercase tracking-widest hidden sm:inline">
                {currentSection + 1} / {sections.length}
              </span>

              {!isLastSection ? (
                <Button
                  size="sm"
                  onClick={() => goToSection(currentSection + 1)}
                >
                  Next
                  <ChevronRight size={15} strokeWidth={1.5} className="ml-1" />
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => {
                    const result = validateAllSections();
                    if (!result.valid) {
                      if (result.firstInvalidSection !== currentSection) setCurrentSection(result.firstInvalidSection);
                      return;
                    }
                    handleSubmit();
                  }}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 size={14} strokeWidth={1.5} className="mr-1.5 animate-spin" />
                  ) : (
                    <Send size={14} strokeWidth={1.5} className="mr-1.5" />
                  )}
                  {isSubmitting ? "Submitting..." : "Submit"}
                </Button>
              )}
            </div>
      </main>
    </div>
  );
}
