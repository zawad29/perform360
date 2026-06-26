"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { useToast } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Layers, Users, Pencil, Trash2, Plus } from "lucide-react";

interface Designation {
  id: string;
  name: string;
  createdAt: string;
  _count: { teamMembers: number };
}

export default function DesignationsPage() {
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [designationsLoading, setDesignationsLoading] = useState(true);
  const [showCreateDesignation, setShowCreateDesignation] = useState(false);
  const [createDesignationName, setCreateDesignationName] = useState("");
  const [createDesignationLoading, setCreateDesignationLoading] = useState(false);
  const [editDesignationItem, setEditDesignationItem] = useState<Designation | null>(null);
  const [editDesignationName, setEditDesignationName] = useState("");
  const [editDesignationLoading, setEditDesignationLoading] = useState(false);
  const [deleteDesignationItem, setDeleteDesignationItem] = useState<Designation | null>(null);
  const [deleteDesignationLoading, setDeleteDesignationLoading] = useState(false);

  const { addToast } = useToast();

  async function fetchDesignations() {
    setDesignationsLoading(true);
    try {
      const res = await fetch("/api/designations");
      const json = await res.json();
      if (json.success) setDesignations(json.data);
    } catch {
      /* silently handle */
    } finally {
      setDesignationsLoading(false);
    }
  }

  useEffect(() => {
    async function load() {
      setDesignationsLoading(true);
      try {
        const res = await fetch("/api/designations");
        const json = await res.json();
        if (json.success) setDesignations(json.data);
      } catch {
        /* silently handle */
      } finally {
        setDesignationsLoading(false);
      }
    }
    load();
  }, []);

  const handleCreateDesignation = async () => {
    if (!createDesignationName.trim()) return;
    setCreateDesignationLoading(true);
    try {
      const res = await fetch("/api/designations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createDesignationName.trim() }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to create designation");
      addToast(`Designation "${json.data.name}" created`, "success");
      setShowCreateDesignation(false);
      setCreateDesignationName("");
      fetchDesignations();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to create designation", "error");
    } finally {
      setCreateDesignationLoading(false);
    }
  };

  const handleEditDesignation = async () => {
    if (!editDesignationItem || !editDesignationName.trim()) return;
    if (editDesignationName.trim() === editDesignationItem.name) { setEditDesignationItem(null); return; }
    setEditDesignationLoading(true);
    try {
      const res = await fetch(`/api/designations/${editDesignationItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editDesignationName.trim() }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to update designation");
      addToast("Designation updated", "success");
      setEditDesignationItem(null);
      fetchDesignations();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to update designation", "error");
    } finally {
      setEditDesignationLoading(false);
    }
  };

  const handleDeleteDesignation = async () => {
    if (!deleteDesignationItem) return;
    setDeleteDesignationLoading(true);
    try {
      const res = await fetch(`/api/designations/${deleteDesignationItem.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to delete designation");
      addToast(`Designation "${deleteDesignationItem.name}" deleted`, "success");
      setDeleteDesignationItem(null);
      fetchDesignations();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to delete designation", "error");
    } finally {
      setDeleteDesignationLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Designations"
        description="Manage designations for your organization"
      >
        <Button onClick={() => setShowCreateDesignation(true)}>
          <Plus size={16} strokeWidth={2} className="mr-1.5" />
          New Designation
        </Button>
      </PageHeader>

      {designationsLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-[72px] bg-gray-100" />
          ))}
        </div>
      ) : designations.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No designations yet"
          description="Create designations like SE L-1, SE L-2 to categorize team members by seniority"
        >
          <Button variant="secondary" size="sm" onClick={() => setShowCreateDesignation(true)}>
            Create Designation
          </Button>
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {designations.map((designation) => (
            <Card key={designation.id} className="flex items-center justify-between px-4 py-3 gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 shrink-0">
                  <Layers size={16} strokeWidth={1.5} className="text-gray-900" />
                </div>
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-gray-900 truncate">{designation.name}</p>
                  <p className="text-[12px] text-gray-500 flex items-center gap-1">
                    <Users size={11} strokeWidth={1.5} />
                    {designation._count.teamMembers} member{designation._count.teamMembers !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => { setEditDesignationItem(designation); setEditDesignationName(designation.name); }}
                  className="p-1.5 hover:bg-gray-100"
                  aria-label={`Edit ${designation.name}`}
                >
                  <Pencil size={14} strokeWidth={1.5} className="text-gray-400" />
                </button>
                <button
                  onClick={() => setDeleteDesignationItem(designation)}
                  className="p-1.5 hover:bg-gray-100"
                  aria-label={`Delete ${designation.name}`}
                >
                  <Trash2 size={14} strokeWidth={1.5} className="text-gray-400 hover:text-red-500" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Designation Dialog */}
      <Dialog open={showCreateDesignation} onOpenChange={(open) => { if (!open) { setShowCreateDesignation(false); setCreateDesignationName(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Designation</DialogTitle>
            <DialogDescription>Add a new designation for your organization</DialogDescription>
          </DialogHeader>
          <form className="space-y-4 mt-4" onSubmit={(e) => { e.preventDefault(); handleCreateDesignation(); }}>
            <Input
              id="designation-name"
              label="Designation Name"
              placeholder="e.g. SE L-1, Designer D-2"
              value={createDesignationName}
              onChange={(e) => setCreateDesignationName(e.target.value)}
              required
              autoFocus
            />
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => { setShowCreateDesignation(false); setCreateDesignationName(""); }}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={createDesignationLoading || !createDesignationName.trim()}>
                {createDesignationLoading ? "Creating..." : "Create Designation"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Designation Dialog */}
      <Dialog open={!!editDesignationItem} onOpenChange={(open) => { if (!open) setEditDesignationItem(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Designation</DialogTitle>
            <DialogDescription>Rename {editDesignationItem?.name}</DialogDescription>
          </DialogHeader>
          <form className="space-y-4 mt-4" onSubmit={(e) => { e.preventDefault(); handleEditDesignation(); }}>
            <Input
              id="edit-designation-name"
              label="Designation Name"
              placeholder="e.g. SE L-1"
              value={editDesignationName}
              onChange={(e) => setEditDesignationName(e.target.value)}
              required
            />
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setEditDesignationItem(null)}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={editDesignationLoading || !editDesignationName.trim()}>
                {editDesignationLoading ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Designation Dialog */}
      <Dialog open={!!deleteDesignationItem} onOpenChange={(open) => { if (!open) setDeleteDesignationItem(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Designation</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{deleteDesignationItem?.name}&rdquo;?
              {deleteDesignationItem && deleteDesignationItem._count.teamMembers > 0 && (
                <span className="block mt-2 text-amber-600">
                  This designation is assigned to {deleteDesignationItem._count.teamMembers} team member(s). You must unassign them first.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-4">
            <Button variant="secondary" onClick={() => setDeleteDesignationItem(null)}>Cancel</Button>
            <Button
              variant="danger"
              className="flex-1"
              disabled={deleteDesignationLoading || (deleteDesignationItem?._count.teamMembers ?? 0) > 0}
              onClick={handleDeleteDesignation}
            >
              {deleteDesignationLoading ? "Deleting..." : "Delete Designation"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
