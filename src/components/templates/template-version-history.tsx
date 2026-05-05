"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  /** Disables the Restore button (e.g. global templates can't be edited). */
  readOnly?: boolean;
  /** Called after a successful restore so the parent can refetch the live template. */
  onRestored?: () => void;
}

export function TemplateVersionHistory({ templateId, readOnly = false, onRestored }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<number | null>(null);
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [viewing, setViewing] = useState<VersionEntry | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  const fetchVersions = useCallback(async () => {
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
  }, [templateId]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

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
    <Card padding="md">
      <div className="flex items-center gap-2 mb-3">
        <History size={16} strokeWidth={1.5} className="text-gray-500" />
        <h3 className="text-[14px] font-medium uppercase tracking-caps text-gray-900">
          Version history
        </h3>
      </div>

      {loading && (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {error && !loading && (
        <p role="alert" className="text-[13px] text-gray-900">{error}</p>
      )}

      {!loading && !error && versions.length === 0 && (
        <p className="text-[13px] text-gray-400">No saved versions yet.</p>
      )}

      {!loading && !error && versions.length > 0 && (
        <ul className="divide-y divide-gray-100">
          {versions.map((v) => {
            const isCurrent = v.version === currentVersion;
            return (
              <li key={v.id} className="py-2 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-gray-900">
                      v{v.version}
                    </span>
                    {isCurrent && (
                      <Badge variant="outline" className="text-[10px]">Current</Badge>
                    )}
                  </div>
                  <p className="text-[12px] text-gray-500 truncate">
                    {formatDate(v.createdAt)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setViewing(v)}
                  aria-label={`View version ${v.version}`}
                >
                  <Eye size={14} strokeWidth={1.5} className="mr-1" />
                  View
                </Button>
                {!readOnly && !isCurrent && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRestore(v)}
                    disabled={restoring === v.id}
                    aria-label={`Restore version ${v.version}`}
                  >
                    <RotateCcw size={14} strokeWidth={1.5} className="mr-1" />
                    {restoring === v.id ? "Restoring…" : "Restore"}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
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
