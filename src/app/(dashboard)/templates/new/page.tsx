"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { TemplateBuilder } from "@/components/templates/template-builder";
import { useTemplateBuilder } from "@/store/template-builder";

export default function NewTemplatePage() {
  const router = useRouter();
  const { name, sections, reset } = useTemplateBuilder();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    reset();
  }, [reset]);

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
      const {
        name: templateName,
        description,
        levelIds,
        weightPreset,
        weightsMember,
        weightsManager,
        sections: templateSections,
      } = useTemplateBuilder.getState();
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: templateName,
          description,
          levelIds,
          weightPreset,
          weightsMember,
          weightsManager,
          sections: templateSections,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || "Failed to save template");
        return;
      }
      reset();
      router.push("/templates");
    } catch {
      setError("Network error — please try again");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div>
      <PageHeader title="Create Template" description="Design an evaluation form template">
        <Button variant="secondary" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button data-tour="template-save" onClick={handleSave} disabled={isLoading || !name.trim()}>
          {isLoading ? "Saving..." : "Save Template"}
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
