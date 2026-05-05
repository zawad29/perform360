"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { Pagination } from "@/components/ui/pagination";
import { useToast } from "@/components/ui/toast";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  FileText,
  Globe,
  Building2,
  Search,
  MoreHorizontal,
  Eye,
  Archive,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorCard } from "@/components/ui/error-card";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PaginationMeta } from "@/types/pagination";

interface TemplateSection {
  title: string;
  questions: { text: string; type: string; required: boolean }[];
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  isGlobal: boolean;
  sections: TemplateSection[];
  createdAt: string;
}

function TemplateCardSkeleton() {
  return (
    <Card>
      <div className="flex items-start justify-between mb-3">
        <Skeleton className="w-10 h-10" />
        <Skeleton className="h-5 w-16" />
      </div>
      <Skeleton className="h-5 w-44 mb-2" />
      <Skeleton className="h-4 w-64 mb-4" />
      <Skeleton className="h-3 w-48" />
    </Card>
  );
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const { addToast } = useToast();
  const router = useRouter();

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "12" });
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      const res = await fetch(`/api/templates?${params}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to load templates");
      setTemplates(json.data);
      setPagination(json.pagination);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load templates";
      setError(msg);
      addToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [addToast, page, searchQuery]);

  useEffect(() => {
    const timer = setTimeout(fetchTemplates, searchQuery ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchTemplates, searchQuery]);

  const handleArchive = async (template: Template) => {
    if (template.isGlobal) {
      addToast("Global templates cannot be archived here", "error");
      return;
    }
    try {
      const res = await fetch(`/api/templates/${template.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to archive template");
      addToast(`"${template.name}" archived`, "success");
      if (templates.length === 1 && page > 1) {
        setPage(page - 1);
      } else {
        fetchTemplates();
      }
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to archive template", "error");
    }
  };

  if (error && templates.length === 0) {
    return (
      <div>
        <PageHeader title="Templates" description="Manage evaluation form templates">
          <Link href="/templates/new">
            <Button><Plus size={16} strokeWidth={2} className="mr-1.5" />New Template</Button>
          </Link>
        </PageHeader>
        <ErrorCard message={error} hint="Check your connection and try again" onRetry={fetchTemplates} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Templates" description="Manage evaluation form templates">
        <Link href="/templates/new">
          <Button><Plus size={16} strokeWidth={2} className="mr-1.5" />New Template</Button>
        </Link>
      </PageHeader>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3 sm:gap-4 mb-4">
        <div className="relative w-full sm:max-w-xs">
          <Search size={16} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search templates..."
            aria-label="Search templates"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            className="w-full h-9 pl-9 pr-4 border border-gray-900 bg-white text-[14px] placeholder:text-gray-400 focus:outline-none focus:outline-2 focus:outline-accent focus:outline-offset-2"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <TemplateCardSkeleton key={i} />)}
        </div>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={searchQuery ? "No templates found" : "No templates yet"}
          description={!searchQuery ? "Create your first template to get started" : undefined}
        >
          {!searchQuery && (
            <Link href="/templates/new">
              <Button variant="secondary" size="sm">Create Template</Button>
            </Link>
          )}
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template) => {
              const sections = Array.isArray(template.sections) ? template.sections : [];
              const questionCount = sections.reduce(
                (acc: number, s: TemplateSection) => acc + (Array.isArray(s.questions) ? s.questions.length : 0),
                0
              );
              return (
                <Card key={template.id} className="group h-full flex flex-col">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <FileText size={20} strokeWidth={1.5} className="text-gray-900" />
                    </div>
                    <div className="flex items-center gap-2">
                      {template.isGlobal ? (
                        <Badge variant="info">
                          <Globe size={10} strokeWidth={2} className="mr-1" />
                          Global
                        </Badge>
                      ) : (
                        <Badge variant="outline">
                          <Building2 size={10} strokeWidth={2} className="mr-1" />
                          Company
                        </Badge>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="p-1.5 hover:bg-gray-50"
                            onClick={(e) => e.stopPropagation()}
                            aria-label="Template actions"
                          >
                            <MoreHorizontal size={16} strokeWidth={1.5} className="text-gray-400" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => router.push(`/templates/${template.id}`)}>
                            <Eye size={14} strokeWidth={1.5} className="mr-2" />
                            View
                          </DropdownMenuItem>
                          {!template.isGlobal && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => handleArchive(template)}
                              >
                                <Archive size={14} strokeWidth={1.5} className="mr-2" />
                                Archive
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <Link href={`/templates/${template.id}`} className="flex-1 flex flex-col">
                    <CardTitle>{template.name}</CardTitle>
                    <CardDescription>{template.description ?? "No description"}</CardDescription>
                    <div className="flex items-center gap-3 mt-auto pt-4 text-[12px] text-gray-400">
                      <span>{sections.length} sections</span>
                      <span>&middot;</span>
                      <span>{questionCount} questions</span>
                    </div>
                  </Link>
                </Card>
              );
            })}
          </div>
          {pagination && (
            <Pagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              total={pagination.total}
              showing={templates.length}
              noun="templates"
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </div>
  );
}
