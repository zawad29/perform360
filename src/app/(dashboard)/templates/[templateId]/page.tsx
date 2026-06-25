"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { Edit, Copy, Globe, Building2, AlertCircle, Layers, FileText, Calendar } from "lucide-react";
import Link from "next/link";
import {
  DIRECTIONS,
  DIRECTION_LABELS,
  DIRECTION_GLYPHS,
  type Direction,
  type DirectionWeights,
  type SubjectRole,
  type WeightPreset,
} from "@/lib/directions";
import { TemplatePreview } from "@/components/templates/template-preview";
import { TemplateVersionHistory } from "@/components/templates/template-version-history";
import type { TemplateQuestion } from "@/types/evaluation";

interface Question {
  id?: string;
  text: string;
  type: string;
  required: boolean;
  options?: string[];
}

interface Section {
  id?: string;
  title: string;
  description?: string;
  directions?: Direction[];
  questions: Question[];
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  isGlobal: boolean;
  version: number;
  designationIds: string[];
  weightPreset: WeightPreset | null;
  weightsMember: DirectionWeights | null;
  weightsManager: DirectionWeights | null;
  sections: Section[];
  createdAt: string;
}

interface PreviewFlowOption {
  direction: Direction;
  label: string;
  description: string;
  fixedSubjectRole: SubjectRole | null;
}

const PREVIEW_FLOW_OPTIONS: readonly PreviewFlowOption[] = [
  {
    direction: "DOWNWARD",
    label: "Manager -> Member",
    description: "What a manager fills out for a member.",
    fixedSubjectRole: "MEMBER",
  },
  {
    direction: "UPWARD",
    label: "Member -> Manager",
    description: "What a member fills out for a manager.",
    fixedSubjectRole: "MANAGER",
  },
  {
    direction: "LATERAL",
    label: "Peer",
    description: "Peer review between teammates.",
    fixedSubjectRole: null,
  },
  {
    direction: "SELF",
    label: "Self",
    description: "What someone fills out about themselves.",
    fixedSubjectRole: null,
  },
  {
    direction: "EXTERNAL",
    label: "External",
    description: "What an outside reviewer fills out.",
    fixedSubjectRole: null,
  },
] as const;


export default function TemplateDetailPage() {
  const params = useParams<{ templateId: string }>();
  const router = useRouter();
  const [template, setTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  const [activeDirection, setActiveDirection] = useState<Direction>("DOWNWARD");
  const [previewSubjectRole, setPreviewSubjectRole] = useState<SubjectRole>("MEMBER");

  async function fetchTemplate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/templates/${params.templateId}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to load template");
      setTemplate(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load template");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetch(`/api/templates/${params.templateId}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.success) throw new Error(json.error || "Failed to load template");
        setTemplate(json.data);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load template");
      })
      .finally(() => setLoading(false));
  }, [params.templateId]);

  // Memos must run on every render (Rules of Hooks) — keep them above the
  // early returns. Safe defaults when template hasn't loaded yet.
  const sections: Section[] = useMemo(
    () => (Array.isArray(template?.sections) ? (template?.sections as Section[]) : []),
    [template?.sections]
  );
  const previewSections = useMemo(
    () =>
      sections.map((s) => ({
        id: s.id ?? s.title,
        title: s.title,
        description: s.description,
        directions: s.directions,
        questions: (s.questions as TemplateQuestion[]) ?? [],
      })),
    [sections]
  );
  const createdLabel = useMemo(
    () => (template?.createdAt ? formatDate(template.createdAt) : ""),
    [template]
  );

  async function handleDuplicate() {
    if (!template) return;
    setDuplicating(true);
    setError(null);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${template.name} (Copy)`,
          description: template.description,
          designationIds: template.designationIds,
          weightPreset: template.weightPreset,
          weightsMember: template.weightsMember,
          weightsManager: template.weightsManager,
          sections: template.sections,
        }),
      });
      const json = await res.json();
      if (json.success) {
        router.push(`/templates/${json.data.id}`);
      } else {
        setError(json.error || "Failed to duplicate template");
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setDuplicating(false);
    }
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Template" description="" />
        <Card className="max-w-lg mx-auto mt-12 text-center">
          <div className="flex flex-col items-center gap-3 py-4">
            <AlertCircle size={32} strokeWidth={1.5} className="text-gray-900" />
            <p className="text-[14px] text-gray-600">{error}</p>
            <Button variant="secondary" size="sm" onClick={fetchTemplate}>Retry</Button>
          </div>
        </Card>
      </div>
    );
  }

  if (loading || !template) {
    return (
      <div>
        <PageHeader title="" description="">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-20" />
        </PageHeader>
        <div className="flex items-center gap-3 mb-6">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-[500px] max-w-5xl" />
      </div>
    );
  }

  const totalQuestions = sections.reduce((acc, s) => acc + s.questions.length, 0);
  const activeFlow = PREVIEW_FLOW_OPTIONS.find((flow) => flow.direction === activeDirection) ?? PREVIEW_FLOW_OPTIONS[0];
  const effectiveSubjectRole = activeFlow.fixedSubjectRole ?? previewSubjectRole;
  const appliedWeights = effectiveSubjectRole === "MANAGER" ? template.weightsManager : template.weightsMember;
  const activeWeight = appliedWeights?.[activeDirection.toLowerCase() as keyof DirectionWeights] ?? null;
  const showSubjectRoleToggle = activeFlow.fixedSubjectRole === null;

  return (
    <div className="max-w-6xl">
      <PageHeader title={template.name} description={template.description ?? ""}>
        <Button variant="ghost" size="sm" onClick={handleDuplicate} disabled={duplicating}>
          <Copy size={16} strokeWidth={1.5} className="mr-1.5" />
          {duplicating ? "Duplicating..." : "Duplicate"}
        </Button>
        {!template.isGlobal && (
          <Link href={`/templates/${template.id}/edit`}>
            <Button variant="secondary">
              <Edit size={16} strokeWidth={1.5} className="mr-1.5" />
              Edit
            </Button>
          </Link>
        )}
      </PageHeader>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-100 text-[13px] text-red-600">
          {error}
        </div>
      )}

      {/* Meta strip */}
      <div className="flex items-center gap-x-3 gap-y-2 flex-wrap mb-5 text-[12px] text-gray-500">
        {template.isGlobal ? (
          <Badge variant="info" className="shrink-0">
            <Globe size={10} strokeWidth={2} className="mr-1" />
            Global
          </Badge>
        ) : (
          <Badge variant="outline" className="shrink-0">
            <Building2 size={10} strokeWidth={2} className="mr-1" />
            Company
          </Badge>
        )}
        <Badge variant="outline" className="shrink-0">
          v{template.version}
        </Badge>
        <span aria-hidden="true" className="text-gray-300">·</span>
        <span className="inline-flex items-center gap-1.5">
          <Calendar size={12} strokeWidth={1.5} className="text-gray-400" />
          {createdLabel}
        </span>
        <span aria-hidden="true" className="text-gray-300">·</span>
        <span className="inline-flex items-center gap-1.5">
          <FileText size={12} strokeWidth={1.5} className="text-gray-400" />
          {sections.length} {sections.length === 1 ? "section" : "sections"}
        </span>
        <span aria-hidden="true" className="text-gray-300">·</span>
        <span className="inline-flex items-center gap-1.5">
          {totalQuestions} {totalQuestions === 1 ? "question" : "questions"}
        </span>
        <span aria-hidden="true" className="text-gray-300">·</span>
        <span className="inline-flex items-center gap-1.5">
          <Layers size={12} strokeWidth={1.5} className="text-gray-400" />
          {template.designationIds.length === 0
            ? "All designations"
            : `${template.designationIds.length} ${template.designationIds.length === 1 ? "designation" : "designations"}`}
        </span>
      </div>

      {/* Routing axes panel — surfaces how sections, directions, and weights compose.
          Section visibility is direction-driven; role determines weight profile;
          level routes templates to subjects in cycle assignment. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Direction × Section map */}
        <Card padding="sm" className="p-0 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-200">
            <p className="text-[12px] font-medium uppercase tracking-caps text-gray-700">
              Section visibility by direction
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-gray-50/60 border-b border-gray-100">
                  <th className="text-left px-3 py-2 font-medium text-gray-500 uppercase tracking-caps sticky left-0 bg-gray-50/60">
                    Section
                  </th>
                  {DIRECTIONS.map((d) => (
                    <th
                      key={d.key}
                      className="px-2 py-2 font-medium text-gray-500 uppercase tracking-caps text-center"
                      title={d.description}
                    >
                      <span aria-hidden="true">{d.glyph}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sections.map((section, sIndex) => {
                  const dirs = section.directions ?? [];
                  const allDirs = dirs.length === 0;
                  return (
                    <tr key={section.id ?? sIndex} className="border-b border-gray-50">
                      <td className="px-3 py-2 text-gray-900 truncate max-w-[180px]">
                        {section.title || "Untitled"}
                      </td>
                      {DIRECTIONS.map((d) => {
                        const renders = allDirs || dirs.includes(d.key);
                        return (
                          <td key={d.key} className="px-2 py-2 text-center">
                            {renders ? (
                              <span className="text-gray-900">●</span>
                            ) : (
                              <span className="text-gray-200">·</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {sections.length === 0 && (
                  <tr>
                    <td colSpan={DIRECTIONS.length + 1} className="px-3 py-4 text-center text-gray-400">
                      No sections
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-gray-100 text-[11px] text-gray-500">
            <span className="text-gray-900 mr-1">●</span> renders for that direction · sections without direction tags appear in all
          </div>
        </Card>

        {/* Weights by role profile */}
        <Card padding="sm" className="p-0 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-200">
            <p className="text-[12px] font-medium uppercase tracking-caps text-gray-700">
              Weights by role profile
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {([
              { key: "member", label: "Member profile", weights: template.weightsMember },
              { key: "manager", label: "Manager profile", weights: template.weightsManager },
            ] as const).map((row) => (
              <div key={row.key} className="px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] font-medium text-gray-900">{row.label}</span>
                  {!row.weights && (
                    <span className="text-[11px] text-gray-400">Not set · equal averages</span>
                  )}
                </div>
                {row.weights && (() => {
                  const w = row.weights;
                  return (
                  <div className="grid grid-cols-5 gap-1">
                    {DIRECTIONS.map((d) => {
                      const value = w[d.key.toLowerCase() as keyof DirectionWeights];
                      return (
                        <div key={d.key} className="text-center">
                          <div className="text-[10px] text-gray-400 uppercase tracking-caps mb-0.5">
                            <span aria-hidden="true">{d.glyph}</span> {d.label}
                          </div>
                          <div className="text-[13px] font-semibold text-gray-900 tabular-nums">
                            {Math.round(value)}%
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  );
                })()}
              </div>
            ))}
          </div>
          <div className="px-4 py-2 border-t border-gray-100 text-[11px] text-gray-500">
            Profile is chosen by the subject&apos;s team role · weights blend per-direction averages
          </div>
        </Card>
      </div>

      {/* Two-column body: preview (main) + sections at a glance (sidebar) */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 items-start">
        {/* Main: form preview */}
        <Card padding="sm" className="overflow-hidden p-0">
          <div className="px-4 py-3 border-b border-gray-200 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <p className="text-[12px] font-medium uppercase tracking-caps text-gray-700">Form preview</p>
                <p className="text-[12px] text-gray-500 mt-0.5">
                  Pick the review flow you want to inspect.
                </p>
              </div>
              {showSubjectRoleToggle && (
                <div className="inline-flex items-center gap-0.5 bg-gray-100 p-0.5 ml-auto">
                  {(["MEMBER", "MANAGER"] as const).map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setPreviewSubjectRole(role)}
                      className={`px-2.5 py-1 text-[11px] font-medium uppercase tracking-caps ${
                        effectiveSubjectRole === role ? "bg-white text-gray-900" : "text-gray-500 hover:text-gray-900"
                      }`}
                    >
                      {role === "MEMBER" ? "For Member" : "For Manager"}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2">
              {PREVIEW_FLOW_OPTIONS.map((flow) => {
                const active = flow.direction === activeDirection;
                return (
                  <button
                    key={flow.direction}
                    type="button"
                    onClick={() => setActiveDirection(flow.direction)}
                    className={`border px-3 py-2 text-left ${
                      active
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-200 bg-white text-gray-700 hover:border-gray-400"
                    }`}
                  >
                    <div className="text-[12px] font-medium uppercase tracking-caps">
                      {flow.label}
                    </div>
                    <div className={`text-[11px] mt-1 ${active ? "text-gray-200" : "text-gray-500"}`}>
                      {flow.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-gray-50">
            <TemplatePreview
              name={template.name}
              description={template.description ?? ""}
              sections={previewSections}
              directionFilter={activeDirection}
            />
          </div>

          <div className="border-t border-gray-200 bg-white px-4 py-2 flex items-center gap-2.5 flex-wrap">
            <Badge variant="outline" className="shrink-0">
              {activeFlow.label}
            </Badge>
            <Badge variant="outline" className="shrink-0">
              {effectiveSubjectRole === "MANAGER" ? "Manager subject" : "Member subject"}
            </Badge>
            {activeWeight !== null ? (
              <span className="text-[12px] text-gray-600">
                This flow uses <span className="font-semibold text-gray-900">{Math.round(activeWeight)}%</span> of the {effectiveSubjectRole === "MANAGER" ? "manager" : "member"} profile.
              </span>
            ) : (
              <span className="text-[12px] text-gray-500">
                No weights configured for the {effectiveSubjectRole === "MANAGER" ? "manager" : "member"} profile.
              </span>
            )}
          </div>
        </Card>

        {/* Sidebar: sections at a glance + version history */}
        <aside className="lg:sticky lg:top-4 space-y-4">
          <Card padding="sm" className="p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200">
              <p className="text-[12px] font-medium uppercase tracking-caps text-gray-700">Sections</p>
            </div>
            <ol className="divide-y divide-gray-100">
              {sections.map((section, sIndex) => (
                <li key={section.id ?? sIndex} className="px-4 py-2.5">
                  <div className="flex items-start gap-2.5">
                    <span className="flex items-center justify-center w-5 h-5 mt-0.5 bg-gray-100 text-gray-700 text-[11px] font-semibold shrink-0">
                      {sIndex + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-gray-900 truncate">
                        {section.title || "Untitled section"}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {section.questions.length} {section.questions.length === 1 ? "question" : "questions"}
                      </p>
                      {section.directions && section.directions.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap mt-1.5">
                          {section.directions.map((d) => (
                            <span
                              key={d}
                              title={DIRECTION_LABELS[d]}
                              className="text-[11px] text-gray-500"
                            >
                              {DIRECTION_GLYPHS[d]}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
              {sections.length === 0 && (
                <li className="px-4 py-6 text-center text-[12px] text-gray-400">
                  No sections yet
                </li>
              )}
            </ol>
          </Card>

          <TemplateVersionHistory
            templateId={template.id}
            readOnly={template.isGlobal}
            onRestored={fetchTemplate}
          />
        </aside>
      </div>
    </div>
  );
}
