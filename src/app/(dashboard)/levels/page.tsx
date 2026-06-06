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

interface Level {
  id: string;
  name: string;
  createdAt: string;
  _count: { teamMembers: number };
}

export default function LevelsPage() {
  const [levels, setLevels] = useState<Level[]>([]);
  const [levelsLoading, setLevelsLoading] = useState(true);
  const [showCreateLevel, setShowCreateLevel] = useState(false);
  const [createLevelName, setCreateLevelName] = useState("");
  const [createLevelLoading, setCreateLevelLoading] = useState(false);
  const [editLevelItem, setEditLevelItem] = useState<Level | null>(null);
  const [editLevelName, setEditLevelName] = useState("");
  const [editLevelLoading, setEditLevelLoading] = useState(false);
  const [deleteLevelItem, setDeleteLevelItem] = useState<Level | null>(null);
  const [deleteLevelLoading, setDeleteLevelLoading] = useState(false);

  const { addToast } = useToast();

  async function fetchLevels() {
    setLevelsLoading(true);
    try {
      const res = await fetch("/api/levels");
      const json = await res.json();
      if (json.success) setLevels(json.data);
    } catch {
      /* silently handle */
    } finally {
      setLevelsLoading(false);
    }
  }

  useEffect(() => {
    fetchLevels();
  }, []);

  const handleCreateLevel = async () => {
    if (!createLevelName.trim()) return;
    setCreateLevelLoading(true);
    try {
      const res = await fetch("/api/levels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createLevelName.trim() }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to create level");
      addToast(`Level "${json.data.name}" created`, "success");
      setShowCreateLevel(false);
      setCreateLevelName("");
      fetchLevels();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to create level", "error");
    } finally {
      setCreateLevelLoading(false);
    }
  };

  const handleEditLevel = async () => {
    if (!editLevelItem || !editLevelName.trim()) return;
    if (editLevelName.trim() === editLevelItem.name) { setEditLevelItem(null); return; }
    setEditLevelLoading(true);
    try {
      const res = await fetch(`/api/levels/${editLevelItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editLevelName.trim() }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to update level");
      addToast("Level updated", "success");
      setEditLevelItem(null);
      fetchLevels();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to update level", "error");
    } finally {
      setEditLevelLoading(false);
    }
  };

  const handleDeleteLevel = async () => {
    if (!deleteLevelItem) return;
    setDeleteLevelLoading(true);
    try {
      const res = await fetch(`/api/levels/${deleteLevelItem.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to delete level");
      addToast(`Level "${deleteLevelItem.name}" deleted`, "success");
      setDeleteLevelItem(null);
      fetchLevels();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to delete level", "error");
    } finally {
      setDeleteLevelLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Levels"
        description="Manage seniority levels for your organization"
      >
        <Button onClick={() => setShowCreateLevel(true)}>
          <Plus size={16} strokeWidth={2} className="mr-1.5" />
          New Level
        </Button>
      </PageHeader>

      {levelsLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-[72px] bg-gray-100" />
          ))}
        </div>
      ) : levels.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No levels yet"
          description="Create levels like SE L-1, SE L-2 to categorize team members by seniority"
        >
          <Button variant="secondary" size="sm" onClick={() => setShowCreateLevel(true)}>
            Create Level
          </Button>
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {levels.map((level) => (
            <Card key={level.id} className="flex items-center justify-between px-4 py-3 gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 shrink-0">
                  <Layers size={16} strokeWidth={1.5} className="text-gray-900" />
                </div>
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-gray-900 truncate">{level.name}</p>
                  <p className="text-[12px] text-gray-500 flex items-center gap-1">
                    <Users size={11} strokeWidth={1.5} />
                    {level._count.teamMembers} member{level._count.teamMembers !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => { setEditLevelItem(level); setEditLevelName(level.name); }}
                  className="p-1.5 hover:bg-gray-100"
                  aria-label={`Edit ${level.name}`}
                >
                  <Pencil size={14} strokeWidth={1.5} className="text-gray-400" />
                </button>
                <button
                  onClick={() => setDeleteLevelItem(level)}
                  className="p-1.5 hover:bg-gray-100"
                  aria-label={`Delete ${level.name}`}
                >
                  <Trash2 size={14} strokeWidth={1.5} className="text-gray-400 hover:text-red-500" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Level Dialog */}
      <Dialog open={showCreateLevel} onOpenChange={(open) => { if (!open) { setShowCreateLevel(false); setCreateLevelName(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Level</DialogTitle>
            <DialogDescription>Add a new seniority level for your organization</DialogDescription>
          </DialogHeader>
          <form className="space-y-4 mt-4" onSubmit={(e) => { e.preventDefault(); handleCreateLevel(); }}>
            <Input
              id="level-name"
              label="Level Name"
              placeholder="e.g. SE L-1, Designer D-2"
              value={createLevelName}
              onChange={(e) => setCreateLevelName(e.target.value)}
              required
              autoFocus
            />
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => { setShowCreateLevel(false); setCreateLevelName(""); }}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={createLevelLoading || !createLevelName.trim()}>
                {createLevelLoading ? "Creating..." : "Create Level"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Level Dialog */}
      <Dialog open={!!editLevelItem} onOpenChange={(open) => { if (!open) setEditLevelItem(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Level</DialogTitle>
            <DialogDescription>Rename {editLevelItem?.name}</DialogDescription>
          </DialogHeader>
          <form className="space-y-4 mt-4" onSubmit={(e) => { e.preventDefault(); handleEditLevel(); }}>
            <Input
              id="edit-level-name"
              label="Level Name"
              placeholder="e.g. SE L-1"
              value={editLevelName}
              onChange={(e) => setEditLevelName(e.target.value)}
              required
            />
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setEditLevelItem(null)}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={editLevelLoading || !editLevelName.trim()}>
                {editLevelLoading ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Level Dialog */}
      <Dialog open={!!deleteLevelItem} onOpenChange={(open) => { if (!open) setDeleteLevelItem(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Level</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{deleteLevelItem?.name}&rdquo;?
              {deleteLevelItem && deleteLevelItem._count.teamMembers > 0 && (
                <span className="block mt-2 text-amber-600">
                  This level is assigned to {deleteLevelItem._count.teamMembers} team member(s). You must unassign them first.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-4">
            <Button variant="secondary" onClick={() => setDeleteLevelItem(null)}>Cancel</Button>
            <Button
              variant="danger"
              className="flex-1"
              disabled={deleteLevelLoading || (deleteLevelItem?._count.teamMembers ?? 0) > 0}
              onClick={handleDeleteLevel}
            >
              {deleteLevelLoading ? "Deleting..." : "Delete Level"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
