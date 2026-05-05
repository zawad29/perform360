"use client";

import { use, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, CheckCircle2, ChevronRight, ClipboardList, Shield } from "lucide-react";
import { DIRECTION_LABELS, type Direction } from "@/lib/directions";

interface Assignment {
  token: string;
  subjectName: string;
  direction: Direction;
  status: string;
}

interface AssignmentsData {
  cycleName: string;
  cycleEndDate: string;
  assignments: Assignment[];
}

export default function ReviewAssignmentsPage({ params: paramsPromise }: { params: Promise<{ token: string }> }) {
  const params = use(paramsPromise);
  const router = useRouter();
  const [data, setData] = useState<AssignmentsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAssignments = useCallback(async function loadAssignments() {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/review/${params.token}/assignments`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        if (json.code === "NO_SESSION" || json.code === "SESSION_EXPIRED") {
          router.replace(`/review/${params.token}`);
          return;
        }
        setError(json.error || "Failed to load assignments");
        return;
      }
      setData(json.data);
    } catch {
      setError("Failed to load assignments");
    } finally {
      setIsLoading(false);
    }
  }, [params.token, router]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-white border border-gray-900 flex items-center justify-center">
            <Loader2 size={22} className="text-gray-900 animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-headline text-gray-900 uppercase tracking-tight">Loading evaluations</p>
            <p className="text-callout text-gray-500 mt-1">Fetching your assignments...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="w-full max-w-[480px] space-y-8">
          <div className="text-center">
            <div className="w-16 h-16 bg-white border border-gray-900 flex items-center justify-center mx-auto mb-6">
              <AlertCircle size={28} strokeWidth={1.5} className="text-gray-900" />
            </div>
            <h1 className="text-title text-gray-900 uppercase tracking-tight">Unable to Load</h1>
            <p className="text-body text-gray-500 mt-2">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { cycleName, cycleEndDate, assignments } = data;
  const completed = assignments.filter((a) => a.status === "SUBMITTED").length;
  const total = assignments.length;
  const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const allDone = completed === total;

  const deadline = new Date(cycleEndDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-900">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between py-3">
            <div className="min-w-0">
              <p className="text-headline text-gray-900 truncate">{cycleName}</p>
              <p className="text-caption-style truncate">
                Deadline: {deadline}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0 ml-4">
              <span className="text-caption-style hidden sm:inline">
                {completed}/{total}
              </span>
              <span className="text-[12px] font-semibold text-gray-900 uppercase tracking-wider tabular-nums">
                {progressPercent}%
              </span>
            </div>
          </div>
          {/* Text-only progress indicator */}
          <div className="pb-2">
            <p className="text-[11px] font-semibold text-gray-900 uppercase tracking-widest">
              {completed} OF {total} COMPLETED
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {allDone ? (
          <div className="text-center space-y-6 py-8">
            <div className="w-20 h-20 bg-white border border-gray-900 flex items-center justify-center mx-auto">
              <CheckCircle2 size={40} strokeWidth={1.5} className="text-gray-900" />
            </div>
            <div>
              <h1 className="text-title text-gray-900 uppercase tracking-tight">All Done!</h1>
              <p className="text-body text-gray-500 mt-2">
                You&apos;ve completed all {total} evaluation{total === 1 ? "" : "s"} for this cycle. Thank you!
              </p>
            </div>
            <Card padding="md">
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
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-white border border-gray-900 flex items-center justify-center">
                <ClipboardList size={20} strokeWidth={1.5} className="text-gray-900" />
              </div>
              <div>
                <h1 className="text-headline text-gray-900 uppercase tracking-tight">Your Evaluations</h1>
                <p className="text-caption-style">
                  {total - completed} remaining of {total} total
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {assignments.map((assignment) => {
                const isSubmitted = assignment.status === "SUBMITTED";

                return (
                  <Card key={assignment.token} padding="md">
                    <div className="flex items-center justify-between gap-2 sm:gap-4">
                      <div className="min-w-0">
                        <p className={`text-body-emphasis truncate ${isSubmitted ? "text-gray-400" : "text-gray-900"}`}>
                          {assignment.subjectName}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-[11px]">
                            {DIRECTION_LABELS[assignment.direction]}
                          </Badge>
                          {isSubmitted && (
                            <Badge variant="outline" className="text-[11px]">
                              Submitted
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        {isSubmitted ? (
                          <div className="w-9 h-9 bg-white border border-gray-900 flex items-center justify-center">
                            <CheckCircle2 size={18} strokeWidth={1.5} className="text-gray-900" />
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => router.push(`/evaluate/${assignment.token}/form`)}
                          >
                            Start
                            <ChevronRight size={14} strokeWidth={1.5} className="ml-0.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}

        <p className="text-center text-[12px] text-gray-400 mt-8 pb-4">
          Session valid for 4 hours. You can close this page and return later.
        </p>
      </main>
    </div>
  );
}
