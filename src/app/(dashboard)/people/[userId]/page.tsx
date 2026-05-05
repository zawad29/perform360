"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  ClipboardCheck,
  FileEdit,
  ChevronRight,
  MoreHorizontal,
  Shield,
  Trash2,
  AlertCircle,
  Inbox,
  BarChart3,
} from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { DIRECTION_LABELS, type Direction } from "@/lib/directions";

interface TeamMembership {
  id: string;
  role: string;
  team: { id: string; name: string };
}

interface EvaluationEntry {
  id: string;
  cycleId: string;
  cycleName: string;
  cycleStatus: string;
  direction: Direction;
  status: string;
  reviewerName?: string;
  subjectName?: string;
}

interface PersonStats {
  totalTeams: number;
  totalEvaluationsReceiving: number;
  totalEvaluationsGiving: number;
  submittedReceiving: number;
  submittedGiving: number;
}

interface PersonDetail {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  role: string;
  createdAt: string;
  teamMemberships: TeamMembership[];
  receivingEvaluations: EvaluationEntry[];
  givingEvaluations: EvaluationEntry[];
  stats: PersonStats;
}

const roleBadgeMap: Record<string, { variant: "info" | "success" | "warning" | "default"; label: string }> = {
  ADMIN: { variant: "info", label: "Admin" },
  HR: { variant: "success", label: "HR" },
  EMPLOYEE: { variant: "default", label: "Employee" },
  EXTERNAL: { variant: "warning", label: "External" },
};

const teamRoleBadge: Record<string, { variant: "info" | "success" | "warning"; label: string }> = {
  MANAGER: { variant: "info", label: "Manager" },
  MEMBER: { variant: "success", label: "Member" },
  EXTERNAL: { variant: "warning", label: "External" },
};

const statusBadge: Record<string, { variant: "outline" | "warning" | "success"; label: string }> = {
  PENDING: { variant: "outline", label: "Pending" },
  IN_PROGRESS: { variant: "warning", label: "In Progress" },
  SUBMITTED: { variant: "success", label: "Submitted" },
};

function groupByCycle(evaluations: EvaluationEntry[]) {
  const groups = new Map<string, { cycleName: string; cycleStatus: string; cycleId: string; items: EvaluationEntry[] }>();
  for (const ev of evaluations) {
    const existing = groups.get(ev.cycleId);
    if (existing) {
      existing.items.push(ev);
    } else {
      groups.set(ev.cycleId, {
        cycleName: ev.cycleName,
        cycleStatus: ev.cycleStatus,
        cycleId: ev.cycleId,
        items: [ev],
      });
    }
  }
  return Array.from(groups.values());
}

export default function PersonDetailPage() {
  const params = useParams<{ userId: string }>();
  const router = useRouter();
  const [person, setPerson] = useState<PersonDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [evalTab, setEvalTab] = useState<"receiving" | "giving">("receiving");
  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [newRole, setNewRole] = useState("");
  const { addToast } = useToast();

  const fetchPerson = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${params.userId}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to load person");
      setPerson(json.data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load person";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [params.userId]);

  useEffect(() => {
    fetchPerson();
  }, [fetchPerson]);

  const handleChangeRole = async () => {
    if (!person || !newRole) return;
    try {
      const res = await fetch(`/api/users/${person.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to update role");
      addToast(`${person.name} role updated to ${newRole}`, "success");
      setShowRoleDialog(false);
      setNewRole("");
      fetchPerson();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to update role", "error");
    }
  };



  const handleDeactivate = async () => {
    if (!person) return;
    try {
      const res = await fetch(`/api/users/${person.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to deactivate user");
      addToast(`${person.name} deactivated`, "success");
      router.push("/people");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to deactivate user", "error");
    }
  };

  if (error) {
    return (
      <div>
        <PageHeader title="Person" description="" />
        <Card className="max-w-lg mx-auto mt-12 text-center">
          <div className="flex flex-col items-center gap-3 py-4">
            <AlertCircle size={32} strokeWidth={1.5} className="text-gray-900" />
            <p className="text-[14px] text-gray-600">{error}</p>
            <Button variant="secondary" size="sm" onClick={fetchPerson}>Retry</Button>
          </div>
        </Card>
      </div>
    );
  }

  if (loading || !person) {
    return (
      <div>
        <PageHeader title="" description="">
          <Skeleton className="h-9 w-32" />
        </PageHeader>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6 max-w-xl">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 " />)}
        </div>
        <Card className="mb-6">
          <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
          {[1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 py-3 px-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-5 w-16 " />
            </div>
          ))}
        </Card>
        <Card>
          <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 py-3 px-4">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-5 w-20 " />
            </div>
          ))}
        </Card>
      </div>
    );
  }

  const badge = roleBadgeMap[person.role] ?? { variant: "default" as const, label: person.role };
  const receivingGroups = groupByCycle(person.receivingEvaluations);
  const givingGroups = groupByCycle(person.givingEvaluations);

  return (
    <div>
      <Breadcrumb items={[{ label: "People", href: "/people" }, { label: person.name }]} />
      <PageHeader title={person.name} description={person.email}>
        <Link href={`/people/${person.id}/performance`}>
          <Button size="sm" variant="secondary">
            <BarChart3 size={16} strokeWidth={1.5} className="mr-1.5" />
            View Performance
          </Button>
        </Link>
        <Badge variant={badge.variant}>{badge.label}</Badge>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-2 hover:bg-gray-100 " aria-label="User actions">
              <MoreHorizontal size={18} strokeWidth={1.5} className="text-gray-500" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => { setNewRole(person.role); setShowRoleDialog(true); }}>
              <Shield size={14} strokeWidth={1.5} className="mr-2" />
              Change Role
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-gray-900" onClick={handleDeactivate}>
              <Trash2 size={14} strokeWidth={1.5} className="mr-2" />
              Deactivate
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </PageHeader>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6 max-w-xl">
        <div className="flex items-center gap-3 border border-gray-900 bg-white px-4 py-3">
          <div className="p-2 bg-gray-100">
            <Users size={18} strokeWidth={1.5} className="text-gray-900" />
          </div>
          <div>
            <p className="text-title-small text-gray-900">{person.stats.totalTeams}</p>
            <p className="text-[12px] font-medium text-gray-500">Teams</p>
          </div>
        </div>
        <div className="flex items-center gap-3 border border-gray-900 bg-white px-4 py-3">
          <div className="p-2 bg-gray-100">
            <ClipboardCheck size={18} strokeWidth={1.5} className="text-gray-900" />
          </div>
          <div>
            <p className="text-title-small text-gray-900">
              {person.stats.submittedReceiving}/{person.stats.totalEvaluationsReceiving}
            </p>
            <p className="text-[12px] font-medium text-gray-500">Receiving</p>
          </div>
        </div>
        <div className="flex items-center gap-3 border border-gray-900 bg-white px-4 py-3">
          <div className="p-2 bg-gray-100">
            <FileEdit size={18} strokeWidth={1.5} className="text-gray-900" />
          </div>
          <div>
            <p className="text-title-small text-gray-900">
              {person.stats.submittedGiving}/{person.stats.totalEvaluationsGiving}
            </p>
            <p className="text-[12px] font-medium text-gray-500">Giving</p>
          </div>
        </div>
      </div>

      {/* Team Memberships */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Team Memberships</CardTitle>
        </CardHeader>
        {person.teamMemberships.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6">
            <Inbox size={24} strokeWidth={1.5} className="text-gray-300" />
            <p className="text-[14px] text-gray-400">Not assigned to any teams</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {person.teamMemberships.map((tm) => {
              const trb = teamRoleBadge[tm.role] ?? { variant: "default" as const, label: tm.role };
              return (
                <Link key={tm.id} href={`/teams/${tm.team.id}`}>
                  <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50/50  cursor-pointer group">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gray-100 flex items-center justify-center">
                        <Users size={14} strokeWidth={1.5} className="text-gray-500" />
                      </div>
                      <p className="text-[14px] font-medium text-gray-900">{tm.team.name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={trb.variant}>{trb.label}</Badge>
                      <ChevronRight
                        size={16}
                        strokeWidth={1.5}
                        className="text-gray-300 group-hover:text-gray-500 "
                      />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </Card>

      {/* Evaluations */}
      <Card>
        <CardHeader>
          <CardTitle>Evaluations</CardTitle>
        </CardHeader>
        <div className="px-4 pb-4">
          <Tabs value={evalTab} onValueChange={(v) => setEvalTab(v as "receiving" | "giving")}>
            <TabsList>
              <TabsTrigger value="receiving">
                <ClipboardCheck size={15} strokeWidth={1.5} className="mr-1.5" />
                Receiving
                <span className="ml-1.5 text-[11px] font-normal bg-gray-200/80 text-gray-600  px-1.5 py-0.5 min-w-[20px] text-center">
                  {person.receivingEvaluations.length}
                </span>
              </TabsTrigger>
              <TabsTrigger value="giving">
                <FileEdit size={15} strokeWidth={1.5} className="mr-1.5" />
                Giving
                <span className="ml-1.5 text-[11px] font-normal bg-gray-200/80 text-gray-600  px-1.5 py-0.5 min-w-[20px] text-center">
                  {person.givingEvaluations.length}
                </span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="receiving">
              {receivingGroups.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8">
                  <Inbox size={24} strokeWidth={1.5} className="text-gray-300" />
                  <p className="text-[14px] text-gray-400">No evaluations received yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {receivingGroups.map((group) => (
                    <div key={group.cycleId}>
                      <Link href={`/cycles/${group.cycleId}`}>
                        <p className="text-[13px] font-medium text-gray-500 mb-2 hover:text-gray-700 ">
                          {group.cycleName}
                        </p>
                      </Link>
                      <div className="border border-gray-100 divide-y divide-gray-50">
                        {group.items.map((ev) => {
                          const sb = statusBadge[ev.status] ?? { variant: "outline" as const, label: ev.status };
                          return (
                            <div key={ev.id} className="flex items-center justify-between px-3 py-2.5 gap-2">
                              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                <span className="text-[14px] text-gray-900 truncate">{ev.reviewerName}</span>
                                <Badge variant="outline">{DIRECTION_LABELS[ev.direction] ?? ev.direction}</Badge>
                              </div>
                              <Badge variant={sb.variant} className="shrink-0">{sb.label}</Badge>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="giving">
              {givingGroups.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8">
                  <Inbox size={24} strokeWidth={1.5} className="text-gray-300" />
                  <p className="text-[14px] text-gray-400">No evaluations given yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {givingGroups.map((group) => (
                    <div key={group.cycleId}>
                      <Link href={`/cycles/${group.cycleId}`}>
                        <p className="text-[13px] font-medium text-gray-500 mb-2 hover:text-gray-700 ">
                          {group.cycleName}
                        </p>
                      </Link>
                      <div className="border border-gray-100 divide-y divide-gray-50">
                        {group.items.map((ev) => {
                          const sb = statusBadge[ev.status] ?? { variant: "outline" as const, label: ev.status };
                          return (
                            <div key={ev.id} className="flex items-center justify-between px-3 py-2.5 gap-2">
                              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                <span className="text-[14px] text-gray-900 truncate">{ev.subjectName}</span>
                                <Badge variant="outline">{DIRECTION_LABELS[ev.direction] ?? ev.direction}</Badge>
                              </div>
                              <Badge variant={sb.variant} className="shrink-0">{sb.label}</Badge>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </Card>

      {/* Change Role Dialog */}
      <Dialog open={showRoleDialog} onOpenChange={setShowRoleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Role</DialogTitle>
            <DialogDescription>Update the role for {person.name}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4 mt-4"
            onSubmit={(e) => { e.preventDefault(); handleChangeRole(); }}
          >
            <div className="space-y-1.5">
              <label className="block text-[13px] font-medium text-gray-700">Role</label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="HR">HR</SelectItem>
                  <SelectItem value="EMPLOYEE">Employee</SelectItem>
                  <SelectItem value="EXTERNAL">External</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="submit">Update Role</Button>
              <Button type="button" variant="ghost" onClick={() => setShowRoleDialog(false)}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
