"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { TemplateBuilder } from "@/components/templates/template-builder";
import { useTemplateBuilder } from "@/store/template-builder";
import { AlertCircle } from "lucide-react";

export default function EditTemplatePage() {
  const router = useRouter();
  const params = useParams<{ templateId: string }>();
  const { name, sections, loadTemplate, reset } = useTemplateBuilder();
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/templates/${params.templateId}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.success) throw new Error(json.error || "Failed to load template");
        if (json.data.isGlobal) {
          setFetchError("Global templates cannot be edited");
          return;
        }
        loadTemplate({
          name: json.data.name,
          description: json.data.description ?? "",
          levelIds: json.data.levelIds ?? [],
          weightPreset: json.data.weightPreset ?? null,
          weightsMember: json.data.weightsMember ?? null,
          weightsManager: json.data.weightsManager ?? null,
          sections: json.data.sections.map((s: { id?: string; title: string; description?: string; directions?: string[]; questions: Array<{ id?: string; text: string; type: string; required: boolean; options?: string[]; scaleMin?: number; scaleMax?: number; scaleLabels?: string[] }> }, i: number) => ({
            id: s.id ?? `section-${i}`,
            title: s.title,
            description: s.description,
            directions: (s.directions ?? []) as never,
            questions: s.questions.map((q, j: number) => ({
              id: q.id || `q-${i}-${j}`,
              text: q.text,
              type: q.type as "rating_scale" | "text" | "multiple_choice",
              required: q.required,
              options: q.options,
              scaleMin: q.scaleMin,
              scaleMax: q.scaleMax,
              scaleLabels: q.scaleLabels,
            })),
          })),
        });
      })
      .catch((err) => {
        setFetchError(err instanceof Error ? err.message : "Failed to load template");
      })
      .finally(() => setIsFetching(false));
    return () => reset();
  }, [params.templateId, loadTemplate, reset]);

  async function handleSave() {
    if (!name.trim()) {
      setError("Template name is required");
      return;
    }
    if (sections.length === 0) {
      setError("Add at least one section");
      return;
    }
    const emptySection = sections.find((s) => s.questions.length === 0);
    if (emptySection) {
      setError(`Section "${emptySection.title}" needs at least one question`);
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      const state = useTemplateBuilder.getState();
      const res = await fetch(`/api/templates/${params.templateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: state.name,
          description: state.description,
          levelIds: state.levelIds,
          weightPreset: state.weightPreset,
          weightsMember: state.weightsMember,
          weightsManager: state.weightsManager,
          sections: state.sections,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || "Failed to update template");
        return;
      }
      router.push(`/templates/${params.templateId}`);
    } catch {
      setError("Network error — please try again");
    } finally {
      setIsLoading(false);
    }
  }

  if (fetchError) {
    return (
      <div>
        <PageHeader title="Edit Template" description="" />
        <div className="max-w-lg mx-auto mt-12 bg-white border border-gray-900 p-8 text-center">
          <AlertCircle size={32} strokeWidth={1.5} className="text-gray-900 mx-auto mb-3" />
          <p className="text-[14px] text-gray-600 mb-4">{fetchError}</p>
          <Button variant="secondary" size="sm" onClick={() => router.back()}>
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  if (isFetching) {
    return (
      <div>
        <PageHeader title="" description="">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-32" />
        </PageHeader>
        <div className="space-y-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-60" />
          <Skeleton className="h-60" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Edit Template" description="Modify your evaluation form template">
        <Button variant="secondary" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={isLoading || !name.trim()}>
          {isLoading ? "Saving..." : "Save Changes"}
        </Button>
      </PageHeader>

      {error && (
        <div className="mb-4 px-4 py-3 border border-gray-900 text-[13px] text-gray-900">
          {error}
        </div>
      )}

      <TemplateBuilder />
    </div>
  );
}
