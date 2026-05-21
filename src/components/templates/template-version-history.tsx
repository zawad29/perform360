"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TemplatePreview } from "@/components/templates/template-preview";
import { History, Eye, RotateCcw } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { Direction, DirectionWeights, WeightPreset } from "@/lib/directions";
import type { TemplateQuestion } from "@/types/evaluation";

interface VersionEntry {
  id: string;
  version: number;
  name: string;
  description: string | null;
  levelIds: string[];
  weightPreset: WeightPreset | null;
  weightsMember: DirectionWeights | null;
  weightsManager: DirectionWeights | null;
  sections: Array<{
    id?: string;
    title: string;
    description?: string;
    directions?: Direction[];
    questions: TemplateQuestion[];
  }>;
  createdBy: string;
  createdAt: string;
}

interface Props {
  templateId: string;
  readOnly?: boolean;
  onRestored?: () => void;
}

export function TemplateVersionHistory({ templateId, readOnly = false, onRestored }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<number | null>(null);
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [viewing, setViewing] = useState<VersionEntry | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  async function fetchVersions() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/templates/${templateId}/versions`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to load versions");
      setCurrentVersion(json.data.currentVersion);
      setVersions(json.data.versions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load versions");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetch(`/api/templates/${templateId}/versions`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.success) throw new Error(json.error || "Failed to load versions");
        setCurrentVersion(json.data.currentVersion);
        setVersions(json.data.versions);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load versions");
      })
      .finally(() => setLoading(false));
  }, [templateId]);

  async function handleRestore(version: VersionEntry) {
    if (!confirm(`Restore version ${version.version}? This becomes the new current version (a new history entry will be recorded).`)) {
      return;
    }
    setRestoring(version.id);
    try {
      const res = await fetch(`/api/templates/${templateId}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: version.id }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Restore failed");
      await fetchVersions();
      onRestored?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed");
    } finally {
      setRestoring(null);
    }
  }

  return (
    <Card padding="sm" className="p-0 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
        <History size={14} strokeWidth={1.5} className="text-gray-500 shrink-0" />
        <p className="text-[12px] font-medium uppercase tracking-caps text-gray-700">
          Version history
        </p>
      </div>

      {loading && (
        <div className="px-4 py-3 space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {error && !loading && (
        <p role="alert" className="px-4 py-3 text-[12px] text-[var(--color-error)]">{error}</p>
      )}

      {!loading && !error && versions.length === 0 && (
        <p className="px-4 py-4 text-[12px] text-gray-400">No saved versions yet.</p>
      )}

      {!loading && !error && versions.length > 0 && (
        <ol className="relative">
          {versions.map((v, idx) => {
            const isCurrent = v.version === currentVersion;
            const isLast = idx === versions.length - 1;
            return (
              <li key={v.id} className="relative flex gap-3 px-4 py-3 group">
                {/* Timeline spine */}
                {!isLast && (
                  <span className="absolute left-[26px] top-[36px] bottom-0 w-px bg-gray-100" aria-hidden="true" />
                )}

                {/* Version dot */}
                <div className="shrink-0 flex flex-col items-center mt-0.5">
                  <span
                    className={`flex items-center justify-center w-5 h-5 text-[10px] font-bold border ${
                      isCurrent
                        ? "bg-[#111111] border-[#111111] text-white"
                        : "bg-white border-gray-300 text-gray-500"
                    }`}
                  >
                    {v.version}
                  </span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[12px] font-semibold text-gray-900 truncate">
                      v{v.version}
                      {isCurrent && (
                        <span className="ml-1.5 text-[10px] font-medium text-[var(--color-accent)] uppercase tracking-caps">
                          current
                        </span>
                      )}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    {formatDate(v.createdAt)}
                  </p>

                  {/* Actions — visible on row hover */}
                  <div className="flex items-center gap-1.5 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setViewing(v)}
                      aria-label={`View version ${v.version}`}
                      className="h-6 px-2 text-[11px]"
                    >
                      <Eye size={11} strokeWidth={1.5} className="mr-1" />
                      Preview
                    </Button>
                    {!readOnly && !isCurrent && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRestore(v)}
                        disabled={restoring === v.id}
                        aria-label={`Restore version ${v.version}`}
                        className="h-6 px-2 text-[11px]"
                      >
                        <RotateCcw size={11} strokeWidth={1.5} className="mr-1" />
                        {restoring === v.id ? "Restoring…" : "Restore"}
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {viewing ? `${viewing.name} — v${viewing.version}` : "Version"}
            </DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="max-h-[70vh] overflow-y-auto">
              <TemplatePreview
                name={viewing.name}
                description={viewing.description ?? ""}
                sections={viewing.sections.map((s) => ({
                  id: s.id ?? s.title,
                  title: s.title,
                  description: s.description,
                  directions: s.directions,
                  questions: s.questions ?? [],
                }))}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
