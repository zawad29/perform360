"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { useToast } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { UserPlus, MoreHorizontal, Mail, Trash2, AlertCircle, ArrowDown, ArrowUp, ArrowLeftRight, RotateCcw, ArrowRight, Archive, ArchiveRestore, Layers, Search, Pencil } from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { DIRECTIONS, DIRECTION_LABELS, type Direction } from "@/lib/directions";

interface LevelOption {
  id: string;
  name: string;
}

interface TeamMember {
  id: string;
  userId: string;
  teamId: string;
  role: string;
  levelId: string | null;
  impersonatorDirections: Direction[];
  level: LevelOption | null;
  user: { id: string; name: string; email: string; avatar: string | null; role: string };
}

interface Team {
  id: string;
  name: string;
  description: string | null;
  archivedAt: string | null;
  members: TeamMember[];
}

const roleBadgeVariant: Record<string, "info" | "success" | "warning" | "default" | "error"> = {
  MANAGER: "info",
  MEMBER: "success",
  EXTERNAL: "warning",
  IMPERSONATOR: "error",
};

const roleLabels: Record<string, string> = {
  MANAGER: "Manager",
  MEMBER: "Member",
  EXTERNAL: "External",
  IMPERSONATOR: "Impersonator",
};

const IMPERSONATOR_DIRECTION_OPTIONS: { value: Direction; label: string }[] = DIRECTIONS
  .filter((d) => d.key !== "SELF")
  .map((d) => ({ value: d.key, label: d.label }));

function AddLevelPicker({
  levels,
  selectedId,
  onSelect,
}: {
  levels: LevelOption[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = search
    ? levels.filter((l) => l.name.toLowerCase().includes(search.toLowerCase()))
    : levels;

  const selectedName = levels.find((l) => l.id === selectedId)?.name;

  return (
    <div className="space-y-1.5">
      <label className="block text-[13px] font-medium text-gray-700">Level (optional)</label>
      <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(""); }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between border border-gray-200 bg-white px-3 py-2 text-[13px] text-left hover:border-gray-300"
          >
            <span className={selectedName ? "text-gray-900" : "text-gray-400"}>
              {selectedName ?? "No level"}
            </span>
            <Layers size={14} strokeWidth={1.5} className="text-gray-400 shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
          {levels.length > 5 && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
              <Search size={14} strokeWidth={1.5} className="text-gray-400 shrink-0" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search levels..."
                className="flex-1 text-[13px] bg-transparent outline-none placeholder:text-gray-400"
                autoFocus
              />
            </div>
          )}
          <div className="max-h-48 overflow-y-auto py-1">
            <button
              onClick={() => { onSelect(""); setOpen(false); setSearch(""); }}
              className={`w-full text-left px-3 py-1.5 text-[13px] hover:bg-gray-50 ${
                !selectedId ? "text-gray-900 font-medium" : "text-gray-400"
              }`}
            >
              No level
            </button>
            {filtered.length === 0 ? (
              <p className="text-[12px] text-gray-400 text-center py-3">No levels found</p>
            ) : (
              filtered.map((lvl) => (
                <button
                  key={lvl.id}
                  onClick={() => { onSelect(lvl.id); setOpen(false); setSearch(""); }}
                  className={`w-full text-left px-3 py-1.5 text-[13px] hover:bg-gray-50 ${
                    lvl.id === selectedId ? "text-gray-900 font-medium" : "text-gray-700"
                  }`}
                >
                  {lvl.name}
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default function TeamDetailPage() {
  const params = useParams<{ teamId: string }>();
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [userOptions, setUserOptions] = useState<ComboboxOption[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [addRole, setAddRole] = useState("MEMBER");
  const [addLevelId, setAddLevelId] = useState<string>("");
  const [addImpersonatorDirs, setAddImpersonatorDirs] = useState<Direction[]>([]);
  const [addLoading, setAddLoading] = useState(false);
  const [levels, setLevels] = useState<LevelOption[]>([]);
  // Edit member state
  const [editMember, setEditMember] = useState<TeamMember | null>(null);
  const [editRole, setEditRole] = useState("MEMBER");
  const [editLevelId, setEditLevelId] = useState<string>("");
  const [editImpersonatorDirs, setEditImpersonatorDirs] = useState<Direction[]>([]);
  const [editLoading, setEditLoading] = useState(false);
  const { addToast } = useToast();

  async function fetchTeam() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/teams/${params.teamId}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to load team");
      setTeam(json.data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load team";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetch(`/api/teams/${params.teamId}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.success) throw new Error(json.error || "Failed to load team");
        setTeam(json.data);
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "Failed to load team";
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [params.teamId]);

  // Fetch company levels
  useEffect(() => {
    fetch("/api/levels")
      .then((r) => r.json())
      .then((json) => { if (json.success) setLevels(json.data); })
      .catch(() => {});
  }, []);

  // Fetch users for combobox when dialog is open
  useEffect(() => {
    if (!showAddDialog) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setUsersLoading(true);
      try {
        const params = new URLSearchParams({ limit: "20" });
        if (userSearchQuery.trim()) params.set("search", userSearchQuery.trim());
        const res = await fetch(`/api/users?${params}`, { signal: controller.signal });
        const json = await res.json();
        if (json.success) {
          const existingIds = new Set(team?.members.map((m) => m.user.id) ?? []);
          setUserOptions(
            json.data.map((u: { id: string; name: string; email: string; avatar: string | null }) => ({
              value: u.id,
              label: u.name,
              sublabel: u.email,
              disabled: existingIds.has(u.id),
              disabledReason: "Already in team",
              icon: <Avatar name={u.name} src={u.avatar} size="sm" />,
            }))
          );
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          /* silently handle */
        }
      } finally {
        setUsersLoading(false);
      }
    }, userSearchQuery ? 300 : 0);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [showAddDialog, userSearchQuery, team?.members]);

  const handleAddMember = async () => {
    if (!selectedUserId) return;
    setAddLoading(true);
    try {
      const res = await fetch(`/api/teams/${params.teamId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUserId,
          role: addRole,
          levelId: addLevelId && addLevelId !== "none" ? addLevelId : null,
          ...(addRole === "IMPERSONATOR" ? { impersonatorDirections: addImpersonatorDirs } : {}),
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to add member");

      addToast("Member added", "success");
      setShowAddDialog(false);
      setSelectedUserId(null);
      setUserSearchQuery("");
      setAddRole("MEMBER");
      setAddLevelId("");
      setAddImpersonatorDirs([]);
      fetchTeam();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to add member", "error");
    } finally {
      setAddLoading(false);
    }
  };


  const handleArchive = async (archived: boolean) => {
    try {
      const res = await fetch(`/api/teams/${params.teamId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to update team");
      addToast(`Team ${archived ? "archived" : "restored"}`, "success");
      fetchTeam();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to update team", "error");
    }
  };

  const openEditDialog = (member: TeamMember) => {
    setEditMember(member);
    setEditRole(member.role);
    setEditLevelId(member.levelId ?? "");
    setEditImpersonatorDirs(member.impersonatorDirections ?? []);
  };

  const handleEditMember = async () => {
    if (!editMember) return;
    setEditLoading(true);
    try {
      const body: Record<string, unknown> = { role: editRole };
      if (editRole !== "IMPERSONATOR" && editRole !== "EXTERNAL") {
        body.levelId = editLevelId || null;
      }
      if (editRole === "IMPERSONATOR") {
        body.impersonatorDirections = editImpersonatorDirs;
      }
      const res = await fetch(`/api/teams/${params.teamId}/members/${editMember.user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to update member");
      addToast("Member updated", "success");
      setEditMember(null);
      fetchTeam();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to update member", "error");
    } finally {
      setEditLoading(false);
    }
  };

  const handleRemoveMember = async (userId: string, name: string) => {
    try {
      const res = await fetch(`/api/teams/${params.teamId}/members/${userId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to remove member");
      addToast(`${name} removed from team`, "success");
      fetchTeam();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to remove member", "error");
    }
  };

  if (error) {
    return (
      <div>
        <PageHeader title="Team" description="" />
        <Card className="max-w-lg mx-auto mt-12 text-center">
          <div className="flex flex-col items-center gap-3 py-4">
            <AlertCircle size={32} strokeWidth={1.5} className="text-gray-900" />
            <p className="text-[14px] text-gray-600">{error}</p>
            <Button variant="secondary" size="sm" onClick={fetchTeam}>Retry</Button>
          </div>
        </Card>
      </div>
    );
  }

  if (loading || !team) {
    return (
      <div>
        <PageHeader title="" description="">
          <Skeleton className="h-9 w-32" />
        </PageHeader>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6 max-w-lg">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}
        </div>
        <Card>
          <CardHeader><Skeleton className="h-5 w-24" /></CardHeader>
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 py-3 px-1">
              <Skeleton className="w-10 h-10" />
              <div>
                <Skeleton className="h-4 w-32 mb-1" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
          ))}
        </Card>
      </div>
    );
  }

  const managers = team.members.filter((m) => m.role === "MANAGER");
  const members = team.members.filter((m) => m.role === "MEMBER");
  const externals = team.members.filter((m) => m.role === "EXTERNAL");
  const impersonators = team.members.filter((m) => m.role === "IMPERSONATOR");

  // Collect all impersonator-handled directions
  const handledDirs = new Set<Direction>();
  for (const imp of impersonators) {
    for (const dir of imp.impersonatorDirections ?? []) {
      handledDirs.add(dir);
    }
  }

  const evaluableCount = managers.length + members.length;

  // Downward: Manager → Member (each manager evaluates each member)
  const downwardCount = handledDirs.has("DOWNWARD")
    ? impersonators.filter((i) => i.impersonatorDirections?.includes("DOWNWARD")).length * members.length
    : managers.length * members.length;
  // Upward: Member → Manager (each member evaluates each manager)
  const upwardCount = handledDirs.has("UPWARD")
    ? impersonators.filter((i) => i.impersonatorDirections?.includes("UPWARD")).length * managers.length
    : members.length * managers.length;
  // Lateral: Member↔Member + Manager↔Manager peer reviews
  const lateralCount = handledDirs.has("LATERAL")
    ? impersonators.filter((i) => i.impersonatorDirections?.includes("LATERAL")).length * (members.length + managers.length)
    : members.length * (members.length - 1) + managers.length * (managers.length - 1);
  // Self: Everyone evaluates themselves (except External & Impersonator) — never delegated
  const selfCount = managers.length + members.length;
  // External: Each external evaluates all managers + members
  const externalCount = handledDirs.has("EXTERNAL")
    ? impersonators.filter((i) => i.impersonatorDirections?.includes("EXTERNAL")).length * evaluableCount
    : externals.length * (managers.length + members.length);

  return (
    <div>
      <Breadcrumb items={[{ label: "Teams", href: "/teams" }, { label: team.name }]} />
      <PageHeader title={team.name} description={team.description ?? ""}>
        {team.archivedAt ? (
          <Button variant="secondary" onClick={() => handleArchive(false)}>
            <ArchiveRestore size={16} strokeWidth={1.5} className="mr-1.5" />
            Unarchive
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={() => handleArchive(true)}>
              <Archive size={16} strokeWidth={1.5} className="mr-1.5" />
              Archive
            </Button>
            <Button data-tour="add-member" onClick={() => setShowAddDialog(true)}>
              <UserPlus size={16} strokeWidth={1.5} className="mr-1.5" />
              Add Member
            </Button>
          </>
        )}
      </PageHeader>

      {team.archivedAt && (
        <div className="flex items-center gap-2 border border-gray-900 px-4 py-3 mb-6">
          <Archive size={16} strokeWidth={1.5} className="text-gray-900 shrink-0" />
          <p className="text-[13px] text-gray-900">This team is archived and hidden from the active teams list.</p>
        </div>
      )}

      {/* Evaluation Direction Stats */}
      <div className={`grid gap-3 mb-6 grid-cols-2 ${externalCount > 0 || impersonators.length > 0 ? "sm:grid-cols-3 lg:grid-cols-5" : "sm:grid-cols-4"}`}>
        <div className="flex items-center gap-3 border border-gray-900 bg-white px-4 py-3">
          <div className="p-2 bg-gray-100">
            <ArrowDown size={18} strokeWidth={1.5} className="text-gray-900" />
          </div>
          <div>
            <p className="text-title-small text-gray-900">{downwardCount}</p>
            <p className="text-[12px] font-medium text-gray-500">Downward</p>
          </div>
        </div>
        <div className="flex items-center gap-3 border border-gray-900 bg-white px-4 py-3">
          <div className="p-2 bg-gray-100">
            <ArrowUp size={18} strokeWidth={1.5} className="text-gray-900" />
          </div>
          <div>
            <p className="text-title-small text-gray-900">{upwardCount}</p>
            <p className="text-[12px] font-medium text-gray-500">Upward</p>
          </div>
        </div>
        <div className="flex items-center gap-3 border border-gray-900 bg-white px-4 py-3">
          <div className="p-2 bg-gray-100">
            <ArrowLeftRight size={18} strokeWidth={1.5} className="text-gray-900" />
          </div>
          <div>
            <p className="text-title-small text-gray-900">{lateralCount}</p>
            <p className="text-[12px] font-medium text-gray-500">Lateral</p>
          </div>
        </div>
        <div className="flex items-center gap-3 border border-gray-900 bg-white px-4 py-3">
          <div className="p-2 bg-gray-100">
            <RotateCcw size={18} strokeWidth={1.5} className="text-gray-900" />
          </div>
          <div>
            <p className="text-title-small text-gray-900">{selfCount}</p>
            <p className="text-[12px] font-medium text-gray-500">Self</p>
          </div>
        </div>
        {externalCount > 0 && (
          <div className="flex items-center gap-3 border border-gray-900 bg-white px-4 py-3">
            <div className="p-2 bg-gray-100">
              <ArrowRight size={18} strokeWidth={1.5} className="text-gray-900" />
            </div>
            <div>
              <p className="text-title-small text-gray-900">{externalCount}</p>
              <p className="text-[12px] font-medium text-gray-500">External</p>
            </div>
          </div>
        )}
      </div>

      {/* Members List */}
      <Card data-tour="members-list">
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        {team.members.length === 0 ? (
          <p className="text-center text-[14px] text-gray-400 py-6">No members yet</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {team.members.map((member) => (
              <div key={member.id} className="flex flex-col sm:flex-row sm:items-center justify-between py-3 px-1 gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar name={member.user.name} src={member.user.avatar} size="md" />
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium text-gray-900 truncate">{member.user.name}</p>
                    <p className="text-[12px] text-gray-500 flex items-center gap-1 truncate">
                      <Mail size={12} strokeWidth={1.5} className="shrink-0" />
                      <span className="truncate">{member.user.email}</span>
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0 pl-13 sm:pl-0">
                  {member.level && member.role !== "IMPERSONATOR" && member.role !== "EXTERNAL" && (
                    <span className="inline-flex items-center gap-1 border border-gray-200 px-2.5 py-0.5 text-[12px] font-medium text-gray-500">
                      <Layers size={12} strokeWidth={1.5} className="shrink-0" />
                      {member.level.name}
                    </span>
                  )}
                  {roleLabels[member.role] && (
                    <Badge variant={roleBadgeVariant[member.role]}>
                      {roleLabels[member.role]}
                    </Badge>
                  )}
                  {member.role === "IMPERSONATOR" && member.impersonatorDirections?.length > 0 && (
                    <span className="flex gap-1">
                      {member.impersonatorDirections.map((dir) => (
                        <Badge key={dir} variant="default" className="text-[10px] px-1.5 py-0">
                          {DIRECTION_LABELS[dir] ?? dir}
                        </Badge>
                      ))}
                    </span>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-1.5 hover:bg-gray-100" aria-label="Member actions">
                        <MoreHorizontal size={16} strokeWidth={1.5} className="text-gray-400" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditDialog(member)}>
                        <Pencil size={14} strokeWidth={1.5} className="mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-red-600"
                        onClick={() => handleRemoveMember(member.user.id, member.user.name)}
                      >
                        <Trash2 size={14} strokeWidth={1.5} className="mr-2" />
                        Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Edit Member Dialog */}
      <Dialog open={!!editMember} onOpenChange={(open) => { if (!open) setEditMember(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Member</DialogTitle>
            <DialogDescription>{editMember?.user.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-1.5">
              <label className="block text-[13px] font-medium text-gray-700">Team Role</label>
              <Select
                value={editRole}
                onValueChange={(v) => {
                  setEditRole(v);
                  if (v !== "IMPERSONATOR") setEditImpersonatorDirs([]);
                  if (v === "IMPERSONATOR" || v === "EXTERNAL") setEditLevelId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MANAGER">Manager</SelectItem>
                  <SelectItem value="MEMBER">Member</SelectItem>
                  <SelectItem value="EXTERNAL">External</SelectItem>
                  <SelectItem value="IMPERSONATOR">Impersonator</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {editRole === "IMPERSONATOR" && (
              <div className="space-y-1.5">
                <label className="block text-[13px] font-medium text-gray-700">Directions to Cover</label>
                <p className="text-[12px] text-gray-500 -mt-0.5 mb-1">
                  Replaces all managers/members for these directions — not a specific person
                </p>
                <div className="flex flex-wrap gap-2">
                  {IMPERSONATOR_DIRECTION_OPTIONS.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-1.5 text-[13px] text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editImpersonatorDirs.includes(opt.value)}
                        onChange={(e) => {
                          setEditImpersonatorDirs((prev) =>
                            e.target.checked ? [...prev, opt.value] : prev.filter((r) => r !== opt.value)
                          );
                        }}
                        className="border-gray-300"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
                {editImpersonatorDirs.length === 0 && (
                  <p role="alert" className="text-[12px] text-gray-900">Select at least one direction</p>
                )}
              </div>
            )}

            {levels.length > 0 && editRole !== "IMPERSONATOR" && editRole !== "EXTERNAL" && (
              <AddLevelPicker
                levels={levels}
                selectedId={editLevelId}
                onSelect={setEditLevelId}
              />
            )}

            <div className="flex gap-3 pt-2">
              <Button
                disabled={editLoading || (editRole === "IMPERSONATOR" && editImpersonatorDirs.length === 0)}
                onClick={handleEditMember}
              >
                {editLoading ? "Saving..." : "Save Changes"}
              </Button>
              <Button variant="ghost" onClick={() => setEditMember(null)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Member Dialog */}
      <Dialog
        open={showAddDialog}
        onOpenChange={(open) => {
          setShowAddDialog(open);
          if (!open) {
            setSelectedUserId(null);
            setUserSearchQuery("");
            setAddRole("MEMBER");
            setAddLevelId("");
            setAddImpersonatorDirs([]);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
            <DialogDescription>Add an existing user to this team</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div data-tour="member-search">
              <Combobox
                id="member-select"
                label="Select Person"
                placeholder="Search by name or email..."
                value={selectedUserId}
                onChange={setSelectedUserId}
                options={userOptions}
                onSearchChange={setUserSearchQuery}
                loading={usersLoading}
                emptyMessage="No matching users found"
              />
            </div>
            <div className="space-y-1.5" data-tour="member-role">
              <label className="block text-[13px] font-medium text-gray-700">Team Role</label>
              <Select value={addRole} onValueChange={(v) => { setAddRole(v); if (v !== "IMPERSONATOR") setAddImpersonatorDirs([]); if (v === "IMPERSONATOR" || v === "EXTERNAL") setAddLevelId(""); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MANAGER">Manager</SelectItem>
                  <SelectItem value="MEMBER">Member</SelectItem>
                  <SelectItem value="EXTERNAL">External</SelectItem>
                  <SelectItem value="IMPERSONATOR">Impersonator</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {addRole === "IMPERSONATOR" && (
              <div className="space-y-1.5" data-tour="impersonator-directions">
                <label className="block text-[13px] font-medium text-gray-700">Directions to Cover</label>
                <p className="text-[12px] text-gray-500 -mt-0.5 mb-1">
                  Replaces all managers/members for these directions — not a specific person
                </p>
                <div className="flex flex-wrap gap-2">
                  {IMPERSONATOR_DIRECTION_OPTIONS.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-1.5 text-[13px] text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={addImpersonatorDirs.includes(opt.value)}
                        onChange={(e) => {
                          setAddImpersonatorDirs((prev) =>
                            e.target.checked ? [...prev, opt.value] : prev.filter((r) => r !== opt.value)
                          );
                        }}
                        className="border-gray-300"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
                {addImpersonatorDirs.length === 0 && (
                  <p role="alert" className="text-[12px] text-gray-900">Select at least one direction</p>
                )}
              </div>
            )}
            {levels.length > 0 && addRole !== "IMPERSONATOR" && addRole !== "EXTERNAL" && (
              <div data-tour="member-level">
                <AddLevelPicker
                  levels={levels}
                  selectedId={addLevelId}
                  onSelect={setAddLevelId}
                />
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <Button disabled={addLoading || !selectedUserId || (addRole === "IMPERSONATOR" && addImpersonatorDirs.length === 0)} onClick={handleAddMember}>
                {addLoading ? "Adding..." : "Add Member"}
              </Button>
              <Button variant="ghost" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
