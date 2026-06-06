"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { Pagination } from "@/components/ui/pagination";
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
import { UserPlus, Search, MoreHorizontal, Shield, Trash2, Users, Pencil } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorCard } from "@/components/ui/error-card";
import type { PaginationMeta } from "@/types/pagination";

interface TeamMembership {
  id: string;
  team: { id: string; name: string };
}

interface User {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  role: string;
  teamMemberships: TeamMembership[];
}

const roleBadgeMap: Record<string, { variant: "info" | "success" | "warning" | "default"; label: string }> = {
  ADMIN: { variant: "info", label: "Admin" },
  HR: { variant: "success", label: "HR" },
  MEMBER: { variant: "default", label: "Member" },
};

const ROLE_FILTERS = [
  { value: "ALL", label: "All" },
  { value: "HR_ADMIN", label: "Admin & HR" },
  { value: "MEMBER", label: "Member" },
] as const;

export default function PeoplePage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [newRole, setNewRole] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("MEMBER");
  const [inviteLoading, setInviteLoading] = useState(false);
  const { addToast } = useToast();

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      if (roleFilter !== "ALL") params.set("role", roleFilter);
      const res = await fetch(`/api/users?${params}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to load users");
      setUsers(json.data);
      setPagination(json.pagination);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load users";
      setError(msg);
      addToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [addToast, page, searchQuery, roleFilter]);

  useEffect(() => {
    const timer = setTimeout(fetchUsers, searchQuery ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchUsers, searchQuery]);

  const handleInvite = async () => {
    if (!inviteName.trim() || !inviteEmail.trim()) return;
    setInviteLoading(true);
    try {
      const res = await fetch("/api/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: inviteName, email: inviteEmail, role: inviteRole }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to invite user");
      if (inviteRole === "ADMIN" || inviteRole === "HR") {
        if (json.emailSent) {
          addToast("User invited and email sent", "success");
        } else {
          addToast("User created but invitation email failed to send", "warning");
        }
      } else {
        addToast("User created", "success");
      }
      setShowInviteDialog(false);
      setInviteName("");
      setInviteEmail("");
      setInviteRole("MEMBER");
      setPage(1);
      fetchUsers();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to invite user", "error");
    } finally {
      setInviteLoading(false);
    }
  };

  const handleChangeRole = async () => {
    if (!selectedUser || !newRole) return;
    try {
      const res = await fetch(`/api/users/${selectedUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to update role");
      addToast(`${selectedUser.name} role updated to ${newRole}`, "success");
      setShowRoleDialog(false);
      setSelectedUser(null);
      setNewRole("");
      fetchUsers();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to update role", "error");
    }
  };

  const handleEditUser = async () => {
    if (!selectedUser || !editName.trim() || !editEmail.trim()) return;
    const nameUnchanged = editName.trim() === selectedUser.name;
    const emailUnchanged = editEmail.trim() === selectedUser.email;
    if (nameUnchanged && emailUnchanged) { setShowEditDialog(false); return; }
    setEditLoading(true);
    try {
      const res = await fetch(`/api/users/${selectedUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), email: editEmail.trim() }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to update user");
      addToast(`${editName.trim()} updated`, "success");
      setShowEditDialog(false);
      setSelectedUser(null);
      setEditName("");
      setEditEmail("");
      fetchUsers();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to update user", "error");
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeactivate = async (user: User) => {
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to deactivate user");
      addToast(`${user.name} deactivated`, "success");
      setPage(1);
      fetchUsers();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to deactivate user", "error");
    }
  };

  if (error && users.length === 0) {
    return (
      <div>
        <PageHeader title="People" description="Manage users in your organization">
          <Button onClick={() => setShowInviteDialog(true)}>
            <UserPlus size={16} strokeWidth={2} className="mr-1.5" />Invite User
          </Button>
        </PageHeader>
        <ErrorCard message={error} hint="Check your connection and try again" onRetry={fetchUsers} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="People" description="Manage users in your organization">
        <Button onClick={() => setShowInviteDialog(true)}>
          <UserPlus size={16} strokeWidth={2} className="mr-1.5" />
          Invite User
        </Button>
      </PageHeader>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex gap-1">
          {ROLE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => { setRoleFilter(f.value); setPage(1); }}
              className={`px-3 py-1.5 text-[13px] font-medium uppercase tracking-caps ${
                roleFilter === f.value
                  ? "text-gray-900 border-b-2 border-accent"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:max-w-xs ml-auto">
          <Search size={16} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search people..."
            aria-label="Search people"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            className="w-full h-9 pl-9 pr-4 bg-white border border-gray-900 text-[14px] placeholder:text-gray-400 focus:outline-none focus:outline-2 focus:outline-accent focus:outline-offset-2"
          />
        </div>
      </div>

      {/* Users Table */}
      {loading ? (
        <Card padding="sm">
          <div className="space-y-3 p-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="w-9 h-9" />
                <div>
                  <Skeleton className="h-4 w-32 mb-1" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : users.length === 0 ? (
        <EmptyState
          icon={Users}
          title={searchQuery ? "No users match your search" : "No users yet"}
          description={!searchQuery ? "Invite people to your organization to get started" : undefined}
        />
      ) : (
        <Card padding="sm">
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full min-w-[360px] sm:min-w-0">
              <thead>
                <tr className="border-b-2 border-accent">
                  <th className="text-left text-[12px] font-medium text-gray-400 uppercase tracking-caps px-4 py-3">User</th>
                  <th className="text-left text-[12px] font-medium text-gray-400 uppercase tracking-caps px-4 py-3">Role</th>
                  <th className="text-left text-[12px] font-medium text-gray-400 uppercase tracking-caps px-4 py-3 hidden sm:table-cell">Teams</th>
                  <th className="text-right text-[12px] font-medium text-gray-400 uppercase tracking-caps px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((user) => {
                  const badge = roleBadgeMap[user.role] ?? { variant: "default" as const, label: user.role };
                  return (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={user.name} src={user.avatar} size="sm" />
                          <div className="min-w-0">
                            <p className="text-[14px] font-medium text-gray-900 truncate">{user.name}</p>
                            <p className="text-[12px] text-gray-500 truncate">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="text-[14px] text-gray-600">
                          {user.teamMemberships.length} teams
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="p-1.5 hover:bg-gray-50" aria-label="User actions">
                              <MoreHorizontal size={16} strokeWidth={1.5} className="text-gray-400" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => {
                              setSelectedUser(user);
                              setEditName(user.name);
                              setEditEmail(user.email);
                              setShowEditDialog(true);
                            }}>
                              <Pencil size={14} strokeWidth={1.5} className="mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => {
                              setSelectedUser(user);
                              setNewRole(user.role);
                              setShowRoleDialog(true);
                            }}>
                              <Shield size={14} strokeWidth={1.5} className="mr-2" />
                              Change Role
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => handleDeactivate(user)}
                            >
                              <Trash2 size={14} strokeWidth={1.5} className="mr-2" />
                              Deactivate
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pagination && (
            <Pagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              total={pagination.total}
              showing={users.length}
              noun="people"
              onPageChange={setPage}
              className="px-4 pb-3 border-t border-gray-100"
            />
          )}
        </Card>
      )}

      {/* Invite Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite User</DialogTitle>
            <DialogDescription>Send an invitation to join your organization</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4 mt-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleInvite();
            }}
          >
            <Input
              id="invite-name"
              label="Full Name"
              placeholder="John Doe"
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              required
            />
            <Input
              id="invite-email"
              label="Email Address"
              type="email"
              placeholder="john@company.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
            />
            <div className="space-y-1.5">
              <label className="block text-[14px] font-medium uppercase tracking-caps text-gray-900">Role</label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="HR">HR</SelectItem>
                  <SelectItem value="MEMBER">Member</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowInviteDialog(false)}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={inviteLoading}>
                {inviteLoading ? "Sending..." : "Send Invitation"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update details for {selectedUser?.name}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4 mt-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleEditUser();
            }}
          >
            <Input
              id="edit-name"
              label="Full Name"
              placeholder="John Doe"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              required
            />
            <Input
              id="edit-email"
              label="Email"
              type="email"
              placeholder="john@example.com"
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
              required
            />
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowEditDialog(false)}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={editLoading || !editName.trim() || !editEmail.trim()}>
                {editLoading ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Change Role Dialog */}
      <Dialog open={showRoleDialog} onOpenChange={setShowRoleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Role</DialogTitle>
            <DialogDescription>
              Update the role for {selectedUser?.name}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4 mt-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleChangeRole();
            }}
          >
            <div className="space-y-1.5">
              <label className="block text-[14px] font-medium uppercase tracking-caps text-gray-900">Role</label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="HR">HR</SelectItem>
                  <SelectItem value="MEMBER">Member</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowRoleDialog(false)}>Cancel</Button>
              <Button type="submit" className="flex-1">Update Role</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
