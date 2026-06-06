"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Users, Plus, Search, MoreHorizontal, Eye, Trash2, Archive, ArchiveRestore, ArrowDown, ArrowUp, ArrowLeftRight, RotateCcw, ArrowRight, Upload, Pencil, AlertTriangle } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorCard } from "@/components/ui/error-card";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PaginationMeta } from "@/types/pagination";

interface TeamMember {
  id: string;
  userId: string;
  teamId: string;
  role: string;
  user: { id: string; name: string; email: string; avatar: string | null; role: string };
}

interface Team {
  id: string;
  name: string;
  description: string | null;
  archivedAt: string | null;
  members: TeamMember[];
  _count: { members: number };
}

function TeamCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <Skeleton className="w-10 h-10" />
        </div>
      </CardHeader>
      <Skeleton className="h-5 w-32 mb-2" />
      <Skeleton className="h-4 w-48 mb-4" />
      <div className="flex gap-2">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-24" />
      </div>
    </Card>
  );
}

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [editTeam, setEditTeam] = useState<Team | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  const { addToast } = useToast();
  const router = useRouter();

  const fetchTeams = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "12" });
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      if (showArchived) params.set("archived", "true");
      const res = await fetch(`/api/teams?${params}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to load teams");
      setTeams(json.data);
      setPagination(json.pagination);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load teams";
      setError(msg);
      addToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [addToast, page, searchQuery, showArchived]);

  useEffect(() => {
    const timer = setTimeout(fetchTeams, searchQuery ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchTeams, searchQuery]);

  const handleEditTeam = async () => {
    if (!editTeam || !editName.trim()) return;
    const nameUnchanged = editName.trim() === editTeam.name;
    const descUnchanged = editDescription.trim() === (editTeam.description ?? "");
    if (nameUnchanged && descUnchanged) { setEditTeam(null); return; }
    setEditLoading(true);
    try {
      const res = await fetch(`/api/teams/${editTeam.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), description: editDescription.trim() }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to update team");
      addToast("Team updated", "success");
      setEditTeam(null);
      fetchTeams();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to update team", "error");
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async (team: Team) => {
    try {
      const res = await fetch(`/api/teams/${team.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to delete team");
      addToast(`"${team.name}" deleted`, "success");
      setPage(1);
      fetchTeams();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to delete team", "error");
    }
  };

  const handleArchive = async (team: Team, archived: boolean) => {
    try {
      const res = await fetch(`/api/teams/${team.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to update team");
      addToast(`"${team.name}" ${archived ? "archived" : "restored"}`, "success");
      fetchTeams();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to update team", "error");
    }
  };

  return (
    <div>
      <PageHeader
        title="Teams"
        description="Manage your organization's teams"
      >
        <Link href="/teams/import">
          <Button variant="secondary"><Upload size={16} strokeWidth={1.5} className="mr-1.5" />Import CSV</Button>
        </Link>
        <Link href="/teams/new">
          <Button><Plus size={16} strokeWidth={2} className="mr-1.5" />New Team</Button>
        </Link>
      </PageHeader>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4">
        <div className="flex items-center gap-0">
          <button
            onClick={() => { setShowArchived(false); setPage(1); }}
            className={`px-3 py-1.5 text-[13px] font-medium uppercase tracking-caps ${!showArchived ? "text-gray-900 border-b-2 border-accent" : "text-gray-500 hover:text-gray-900"}`}
          >
            Active
          </button>
          <button
            onClick={() => { setShowArchived(true); setPage(1); }}
            className={`px-3 py-1.5 text-[13px] font-medium uppercase tracking-caps ${showArchived ? "text-gray-900 border-b-2 border-accent" : "text-gray-500 hover:text-gray-900"}`}
          >
            Archived
          </button>
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search size={16} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search teams..."
            aria-label="Search teams"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            className="w-full h-9 pl-9 pr-4 border border-gray-900 bg-white text-[14px] placeholder:text-gray-400 focus:outline-none focus:outline-2 focus:outline-accent focus:outline-offset-2"
          />
        </div>
      </div>

      {error && teams.length === 0 ? (
        <ErrorCard message={error} hint="Check your connection and try again" onRetry={fetchTeams} />
      ) : loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <TeamCardSkeleton key={i} />)}
        </div>
      ) : teams.length === 0 ? (
        <EmptyState
          icon={Users}
          title={searchQuery ? "No teams match your search" : showArchived ? "All teams are active" : "No teams yet"}
          description={!searchQuery && !showArchived ? "Create a team to organize your people for evaluations" : undefined}
        >
          {!searchQuery && !showArchived && (
            <Link href="/teams/new">
              <Button variant="secondary" size="sm">Create Team</Button>
            </Link>
          )}
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {teams.map((team) => {
              const managerCount = team.members.filter((m) => m.role === "MANAGER").length;
              const memberCount = team.members.filter((m) => m.role === "MEMBER").length;
              const externalCount = team.members.filter((m) => m.role === "EXTERNAL").length;
              const isIncomplete = managerCount < 1 || memberCount < 1;
              const hasDownward = managerCount > 0 && memberCount > 0;
              const hasUpward = managerCount > 0 && memberCount > 0;
              const hasLateral = memberCount >= 2 || managerCount >= 2;
              const totalMembers = managerCount + memberCount;
              const hasSelf = totalMembers > 0;
              const hasExternal = externalCount > 0 && (managerCount + memberCount) > 0;
              return (
                <Card key={team.id} className={`h-full flex flex-col group ${team.archivedAt ? "opacity-70" : ""}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-2.5">
                          <Users size={20} strokeWidth={1.5} className="text-gray-900" />
                        </div>
                        {isIncomplete && !team.archivedAt && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-caps border border-red-500 bg-red-50 text-red-600">
                            <AlertTriangle size={9} strokeWidth={2.5} />
                            Incomplete
                          </span>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="p-1.5 hover:bg-gray-50"
                            onClick={(e) => e.stopPropagation()}
                            aria-label="Team actions"
                          >
                            <MoreHorizontal size={16} strokeWidth={1.5} className="text-gray-400" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => router.push(`/teams/${team.id}`)}>
                            <Eye size={14} strokeWidth={1.5} className="mr-2" />
                            View
                          </DropdownMenuItem>
                          {!team.archivedAt && (
                            <DropdownMenuItem onClick={() => {
                              setEditTeam(team);
                              setEditName(team.name);
                              setEditDescription(team.description ?? "");
                            }}>
                              <Pencil size={14} strokeWidth={1.5} className="mr-2" />
                              Edit
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          {team.archivedAt ? (
                            <DropdownMenuItem onClick={() => handleArchive(team, false)}>
                              <ArchiveRestore size={14} strokeWidth={1.5} className="mr-2" />
                              Unarchive
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => handleArchive(team, true)}>
                              <Archive size={14} strokeWidth={1.5} className="mr-2" />
                              Archive
                            </DropdownMenuItem>
                          )}
                          {!team.archivedAt && (
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => handleDelete(team)}
                            >
                              <Trash2 size={14} strokeWidth={1.5} className="mr-2" />
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <Link href={`/teams/${team.id}`} className="flex-1 flex flex-col">
                    <CardTitle>{team.name}</CardTitle>
                    <CardDescription className="line-clamp-2">{team.description ?? "No description"}</CardDescription>
                    <div className="mt-auto pt-4 space-y-2">
                      <Badge variant="default">{team._count.members} members</Badge>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {hasDownward && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-900 border border-gray-900 px-2 py-0.5">
                            <ArrowDown size={11} strokeWidth={2} />
                            {managerCount * memberCount}
                          </span>
                        )}
                        {hasUpward && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-900 border border-gray-900 px-2 py-0.5">
                            <ArrowUp size={11} strokeWidth={2} />
                            {memberCount * managerCount}
                          </span>
                        )}
                        {hasLateral && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-900 border border-gray-900 px-2 py-0.5">
                            <ArrowLeftRight size={11} strokeWidth={2} />
                            {memberCount * (memberCount - 1) + managerCount * (managerCount - 1)}
                          </span>
                        )}
                        {hasSelf && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-900 border border-gray-900 px-2 py-0.5">
                            <RotateCcw size={11} strokeWidth={2} />
                            {totalMembers}
                          </span>
                        )}
                        {hasExternal && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-900 border border-gray-900 px-2 py-0.5">
                            <ArrowRight size={11} strokeWidth={2} />
                            {externalCount * (managerCount + memberCount)}
                          </span>
                        )}
                      </div>
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
              showing={teams.length}
              noun="teams"
              onPageChange={setPage}
            />
          )}
        </>
      )}

      {/* Edit Team Dialog */}
      <Dialog open={!!editTeam} onOpenChange={(open) => { if (!open) setEditTeam(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Team</DialogTitle>
            <DialogDescription>Update details for {editTeam?.name}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4 mt-4"
            onSubmit={(e) => { e.preventDefault(); handleEditTeam(); }}
          >
            <Input
              id="edit-team-name"
              label="Team Name"
              placeholder="Engineering"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              required
            />
            <div>
              <label htmlFor="edit-team-description" className="block text-[13px] font-medium text-gray-700 mb-1.5">
                Description
              </label>
              <textarea
                id="edit-team-description"
                placeholder="Brief description of this team..."
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
                className="w-full px-4 py-3 border border-gray-900 bg-white text-body placeholder:text-gray-400 focus:outline-none focus:outline-2 focus:outline-accent focus:outline-offset-2 resize-none"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setEditTeam(null)}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={editLoading || !editName.trim()}>
                {editLoading ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
