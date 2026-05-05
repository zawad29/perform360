"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ChevronLeft, ChevronRight, Send, Loader2, AlertCircle, Check, Shield, ArrowRight } from "lucide-react";
import { QuestionRenderer } from "@/components/evaluation/question-renderer";

import type { TemplateSection } from "@/types/evaluation";
import { DIRECTION_LABELS, type Direction } from "@/lib/directions";

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
  const [answers, setAnswers] = useState<Record<string, string | number | boolean>>({});
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
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-white border border-gray-900 flex items-center justify-center">
            <Loader2 size={22} className="text-gray-900 animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-headline text-gray-900 uppercase tracking-tight">Loading evaluation</p>
            <p className="text-callout text-gray-500 mt-1">Preparing your form...</p>
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="w-full max-w-[420px] space-y-8">
          <div className="text-center">
            <div className="w-16 h-16 bg-white border border-gray-900 flex items-center justify-center mx-auto mb-6">
              <AlertCircle size={28} strokeWidth={1.5} className="text-gray-900" />
            </div>
            <h1 className="text-title text-gray-900 uppercase tracking-tight">Unable to Load Form</h1>
            <p className="text-body text-gray-500 mt-2">{loadError}</p>
          </div>
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
  const progressPercent = Math.round((answeredQuestions / totalQuestions) * 100);

  function getSectionAnsweredCount(sectionIndex: number) {
    const s = sections[sectionIndex];
    return s.questions.filter((q) => answers[q.id] !== undefined).length;
  }

  function isSectionComplete(sectionIndex: number) {
    const s = sections[sectionIndex];
    return s.questions.every((q) => answers[q.id] !== undefined);
  }

  function setAnswer(questionId: string, value: string | number | boolean) {
    setAnswers((prev) => {
      // Remove key when value is cleared so progress counter stays accurate
      if (value === "" || value === undefined) {
        const { [questionId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [questionId]: value };
    });
    // Clear error for this question as user answers it
    if (value !== "" && value !== undefined && sectionErrors.has(questionId)) {
      setSectionErrors((prev) => {
        const next = new Set(prev);
        next.delete(questionId);
        return next;
      });
    }
  }

  function validateSection(sectionIndex: number): boolean {
    const s = sections[sectionIndex];
    const unanswered = s.questions
      .filter((q) => q.required && (answers[q.id] === undefined || answers[q.id] === ""))
      .map((q) => q.id);

    if (unanswered.length > 0) {
      setSectionErrors(new Set(unanswered));
      setShowValidation(true);
      return false;
    }
    setSectionErrors(new Set());
    setShowValidation(false);
    return true;
  }

  function validateAllSections(): { valid: boolean; firstInvalidSection: number } {
    const allMissing: string[] = [];
    let firstInvalid = -1;

    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      const unanswered = s.questions
        .filter((q) => q.required && (answers[q.id] === undefined || answers[q.id] === ""))
        .map((q) => q.id);
      if (unanswered.length > 0 && firstInvalid === -1) {
        firstInvalid = i;
      }
      allMissing.push(...unanswered);
    }

    if (allMissing.length > 0) {
      // Navigate to first incomplete section and show its errors
      const sectionQuestionIds = new Set(
        sections[firstInvalid].questions
          .filter((q) => q.required && (answers[q.id] === undefined || answers[q.id] === ""))
          .map((q) => q.id)
      );
      setSectionErrors(sectionQuestionIds);
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
        // If server says required fields missing, trigger client-side validation UI
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

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="w-full max-w-[480px]">
          <div className="text-center space-y-6">
            <div className="w-20 h-20 bg-white border border-gray-900 flex items-center justify-center mx-auto">
              <CheckCircle2 size={40} strokeWidth={1.5} className="text-gray-900" />
            </div>
            <div>
              <h1 className="text-title text-gray-900 uppercase tracking-tight">Thank You!</h1>
              <p className="text-body text-gray-500 mt-2">
                Your evaluation for <span className="font-medium text-gray-900">{subjectName}</span> has been submitted successfully.
              </p>
            </div>
          </div>
          <Card padding="md" className="mt-8">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 bg-white border border-gray-900 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Shield size={18} strokeWidth={1.5} className="text-gray-900" />
              </div>
              <div>
                <p className="text-callout font-medium text-gray-900">End-to-end encrypted</p>
                <p className="text-caption-style mt-0.5">
                  Your responses are encrypted and securely stored. Only authorized administrators can view the results.
                </p>
              </div>
            </div>
          </Card>

          {remainingEvals.length > 0 && (
            <Card padding="md" className="mt-4">
              <p className="text-callout font-medium text-gray-900 mb-3">
                You have {remainingEvals.length} more evaluation{remainingEvals.length > 1 ? "s" : ""} to complete
              </p>
              <div className="space-y-2">
                {remainingEvals.map((ev) => (
                  <a
                    key={ev.token}
                    href={`/evaluate/${ev.token}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 bg-white hover:bg-gray-50 border border-gray-900 group"
                  >
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium text-gray-900 truncate">{ev.subjectName}</p>
                      <p className="text-[12px] text-gray-500 truncate">{ev.cycleName} &middot; {DIRECTION_LABELS[ev.direction] ?? ev.direction}</p>
                    </div>
                    <ArrowRight size={16} strokeWidth={1.5} className="text-gray-400 group-hover:text-gray-900 flex-shrink-0" />
                  </a>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    );
  }

  const currentQuestionOffset = sections
    .slice(0, currentSection)
    .reduce((acc, s) => acc + s.questions.length, 0);

  return (
    <div className="min-h-screen bg-white">
      {/* Sticky Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-900">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between py-3">
            <div className="min-w-0">
              <p className="text-headline text-gray-900 truncate">
                Evaluating {subjectName}
              </p>
              <p className="text-caption-style truncate">
                {cycleName} &middot; {directionLabel}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0 ml-4">
              {answeredQuestions > 0 && (
                <span className="text-[11px] text-gray-900 hidden sm:inline">Draft in progress</span>
              )}
              <span className="text-caption-style hidden sm:inline">
                {answeredQuestions}/{totalQuestions}
              </span>
              <span className="text-[12px] font-semibold text-gray-900 uppercase tracking-wider tabular-nums">
                {progressPercent}%
              </span>
            </div>
          </div>
          {/* Text-only progress indicator */}
          <div className="pb-2">
            <p className="text-[11px] font-semibold text-gray-900 uppercase tracking-widest">
              SECTION {currentSection + 1} OF {sections.length}
            </p>
          </div>
        </div>
      </header>

      {isImpersonator && (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 mt-4">
          <div className="flex items-center gap-2.5 px-4 py-3 bg-white border border-gray-900">
            <AlertCircle size={16} strokeWidth={1.5} className="text-gray-900 flex-shrink-0" />
            <p className="text-[13px] text-gray-900">
              You are submitting this review on behalf of <span className="font-medium">{subjectName}</span> as an impersonator.
            </p>
          </div>
        </div>
      )}

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Section Stepper */}
        <nav className="mb-8">
          <div className="flex items-center justify-center gap-0">
            {sections.map((s, i) => {
              const complete = isSectionComplete(i);
              const active = i === currentSection;
              const answered = getSectionAnsweredCount(i);
              const total = s.questions.length;

              return (
                <div key={i} className="flex items-center">
                  {/* Connector line before (except first) */}
                  {i > 0 && (
                    <div
                      className={`h-px w-4 sm:w-6 md:w-10 ${
                        isSectionComplete(i - 1) ? "bg-gray-900" : "bg-[#DDD]"
                      }`}
                    />
                  )}
                  {/* Step dot */}
                  <button
                    onClick={() => { setSectionErrors(new Set()); setShowValidation(false); setCurrentSection(i); }}
                    aria-label={`Section ${i + 1}: ${s.title}, ${answered} of ${total} answered${complete ? " (complete)" : ""}`}
                    aria-current={active ? "step" : undefined}
                    className={`
                      relative flex items-center justify-center
                      ${active
                        ? "w-9 h-9 bg-gray-900 text-white border border-gray-900"
                        : complete
                          ? "w-7 h-7 bg-gray-900 text-white border border-gray-900"
                          : answered > 0
                            ? "w-7 h-7 bg-white text-gray-900 border border-gray-900"
                            : "w-7 h-7 bg-white text-gray-400 border border-gray-100"
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
          {/* Active section label */}
          <div className="text-center mt-3">
            <p className="text-[14px] font-medium text-gray-900">{section.title}</p>
            <p className="text-[12px] text-gray-400 mt-0.5">
              {getSectionAnsweredCount(currentSection)}/{section.questions.length} answered
            </p>
          </div>
        </nav>

        {/* Section Card */}
        <Card padding="lg">
          <CardHeader className="mb-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-title-small">{section.title}</CardTitle>
                {section.description && (
                  <CardDescription className="mt-1.5">{section.description}</CardDescription>
                )}
                {/* 2px red rule below section header */}
                <div className="mt-3 w-full h-[2px] bg-[#E63946]" />
              </div>
              <Badge variant="outline" className="flex-shrink-0 tabular-nums">
                {getSectionAnsweredCount(currentSection)}/{section.questions.length}
              </Badge>
            </div>
          </CardHeader>

          {/* Validation Banner */}
          {showValidation && sectionErrors.size > 0 && (
            <div className="mb-6 flex items-center gap-2.5 px-4 py-3 bg-white border border-gray-900">
              <AlertCircle size={16} strokeWidth={1.5} className="text-gray-900 flex-shrink-0" />
              <p className="text-[13px] text-gray-900">
                Please answer {sectionErrors.size} required {sectionErrors.size === 1 ? "question" : "questions"} before continuing
              </p>
            </div>
          )}

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
        </Card>

        {/* Submit Error */}
        {submitError && (
          <div className="mt-4 flex items-center gap-2.5 px-4 py-3 bg-white border border-gray-900">
            <AlertCircle size={16} strokeWidth={1.5} className="text-gray-900 flex-shrink-0" />
            <p className="text-[13px] text-gray-900">{submitError}</p>
          </div>
        )}

        {/* Navigation Footer */}
        <div className="flex items-center justify-between mt-6 pb-8">
          <Button
            variant="ghost"
            onClick={() => { setSectionErrors(new Set()); setShowValidation(false); setCurrentSection(Math.max(0, currentSection - 1)); }}
            disabled={currentSection === 0}
          >
            <ChevronLeft size={16} strokeWidth={1.5} className="mr-1" />
            Previous
          </Button>

          <span className="text-[11px] font-semibold text-gray-900 uppercase tracking-widest tabular-nums hidden sm:inline">
            SECTION {currentSection + 1} OF {sections.length}
          </span>

          {currentSection < sections.length - 1 ? (
            <Button onClick={() => {
              if (validateSection(currentSection)) {
                setCurrentSection(currentSection + 1);
              }
            }}>
              Next
              <ChevronRight size={16} strokeWidth={1.5} className="ml-1" />
            </Button>
          ) : (
            <Button onClick={() => {
              const result = validateAllSections();
              if (!result.valid) {
                if (result.firstInvalidSection !== currentSection) {
                  setCurrentSection(result.firstInvalidSection);
                }
                return;
              }
              handleSubmit();
            }} disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 size={16} strokeWidth={1.5} className="mr-1.5 animate-spin" />
              ) : (
                <Send size={16} strokeWidth={1.5} className="mr-1.5" />
              )}
              {isSubmitting ? "Submitting..." : "Submit"}
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
