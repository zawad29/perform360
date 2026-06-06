"use client";

import { Badge } from "@/components/ui/badge";
import { Layers, Users, Shield, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { DIRECTION_LABELS } from "@/lib/directions";
import type { SubjectContext, ResponseRate, ReviewerBreakdownItem } from "@/types/report";

interface ProfileBannerProps {
  subjectName: string;
  cycleName: string;
  context: SubjectContext;
  responseRate: ResponseRate;
  reviewerBreakdown: ReviewerBreakdownItem[];
}

function confidenceLevel(rate: number): { label: string; icon: React.ReactNode } {
  if (rate >= 80) return { label: "High confidence", icon: <CheckCircle2 size={12} strokeWidth={2} /> };
  if (rate >= 50) return { label: "Moderate confidence", icon: <Clock size={12} strokeWidth={2} /> };
  return { label: "Low confidence", icon: <AlertCircle size={12} strokeWidth={2} /> };
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  HR: "HR",
  MEMBER: "Member",
  EXTERNAL: "External",
};

export function ProfileBanner({
  subjectName,
  cycleName,
  context,
  responseRate,
  reviewerBreakdown,
}: ProfileBannerProps) {
  const confidence = confidenceLevel(responseRate.rate);

  return (
    <div className="bg-white border-b-2 border-accent p-5 mb-6">
      {/* Top: Name + Context */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-display text-gray-900 leading-tight">
            {subjectName}
          </h1>
          <p className="text-[13px] text-gray-500 uppercase tracking-caps mt-1">{cycleName}</p>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <Badge variant="outline" className="text-[11px] border-gray-900">
              <Shield size={10} strokeWidth={1.5} className="mr-1" />
              {ROLE_LABELS[context.role] ?? context.role}
            </Badge>
            {context.level && (
              <Badge variant="outline" className="text-[11px] border-gray-900">
                <Layers size={10} strokeWidth={1.5} className="mr-1" />
                {context.level}
              </Badge>
            )}
            {context.teams.map((t) => (
              <Badge key={t.id} variant="outline" className="text-[11px] border-gray-900">
                <Users size={10} strokeWidth={1.5} className="mr-1" />
                {t.name}
                {t.level && t.level !== context.level && (
                  <span className="ml-1 text-gray-500">({t.level})</span>
                )}
              </Badge>
            ))}
          </div>
        </div>

        {/* Response Rate */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <span className="text-[28px] font-bold text-gray-900 tabular-nums">
              {Math.round(responseRate.rate)}%
            </span>
          </div>
          <div>
            <p className="text-[12px] font-medium text-gray-700 tabular-nums">
              {responseRate.completed}/{responseRate.total} responded
            </p>
            <div className="flex items-center gap-1 mt-0.5 text-gray-500">
              {confidence.icon}
              <span className="text-[11px] font-medium">{confidence.label}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Reviewer Breakdown Chips */}
      {reviewerBreakdown.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-gray-900">
          <span className="text-[11px] text-gray-500 uppercase tracking-caps font-medium">
            Reviewers
          </span>
          {reviewerBreakdown.map((rb) => (
            <div
              key={rb.direction}
              className="flex items-center gap-1.5 text-[12px] text-gray-700 bg-white px-2.5 py-1 border border-gray-900"
            >
              <span className="font-medium">
                {DIRECTION_LABELS[rb.direction] ?? rb.direction}
              </span>
              <span className="text-gray-500 tabular-nums">
                {rb.completed}/{rb.total}
              </span>
              {rb.completed === rb.total ? (
                <CheckCircle2 size={11} strokeWidth={2} className="text-gray-900" />
              ) : (
                <Clock size={11} strokeWidth={2} className="text-gray-400" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
