# Nav Reorder, Levels Page, SelectPerson Component — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorder the sidebar nav, move Levels into its own page/route, and create a reusable `SelectPerson` component used in the Add Team Member dialog.

**Architecture:** Three independent changes in dependency order — nav reorder is purely additive, Levels page extracts existing code verbatim, and SelectPerson wraps the existing `Combobox` without touching it.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, Lucide icons, existing `Combobox` and `Avatar` components

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/components/layout/nav-items.ts` | New nav order + Levels entry |
| Create | `src/app/(dashboard)/levels/page.tsx` | Levels page (grid, CRUD dialogs) |
| Modify | `src/app/(dashboard)/teams/page.tsx` | Remove Levels tab + tab bar |
| Create | `src/components/ui/select-person.tsx` | Thin Combobox wrapper for person selection |
| Modify | `src/app/(dashboard)/teams/[teamId]/page.tsx` | Use SelectPerson, remove inline option building |

---

## Task 1: Reorder nav and add Levels entry

**Files:**
- Modify: `src/components/layout/nav-items.ts`

- [ ] **Step 1: Update nav-items.ts**

Replace the entire file content:

```ts
import {
  LayoutDashboard,
  RefreshCcw,
  FileText,
  Users,
  UserCircle,
  Layers,
  Settings,
} from "lucide-react";

export const navigation = [
  { name: "Dashboard", href: "/overview", icon: LayoutDashboard },
  { name: "Cycles", href: "/cycles", icon: RefreshCcw },
  { name: "Templates", href: "/templates", icon: FileText },
  { name: "Teams", href: "/teams", icon: Users },
  { name: "People", href: "/people", icon: UserCircle },
  { name: "Levels", href: "/levels", icon: Layers },
] as const;

export const bottomNav = [
  { name: "Settings", href: "/settings", icon: Settings },
] as const;

export const externalNav = [] as const satisfies readonly {
  name: string;
  href: string;
  icon: typeof Settings;
}[];
```

- [ ] **Step 2: Verify sidebar renders**

Run the dev server (`npm run dev`) and visit any page. Confirm the sidebar shows:
Dashboard → Cycles → Templates → Teams → People → Levels (with the Layers icon).
Levels link goes to `/levels` (will 404 until Task 2 — that's fine).

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/nav-items.ts
git commit -m "feat: reorder nav and add Levels entry"
```

---

## Task 2: Create the Levels page

**Files:**
- Create: `src/app/(dashboard)/levels/page.tsx`

- [ ] **Step 1: Create the file**

```tsx
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
```

- [ ] **Step 2: Verify the page loads**

Visit `/levels` in the browser. Confirm:
- Level cards grid renders (or empty state if no levels exist)
- "New Level" button opens the Create Level dialog
- Create, edit, delete actions all work

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/levels/page.tsx
git commit -m "feat: add dedicated Levels page at /levels"
```

---

## Task 3: Remove Levels tab from Teams page

**Files:**
- Modify: `src/app/(dashboard)/teams/page.tsx`

- [ ] **Step 1: Remove Levels state**

In `src/app/(dashboard)/teams/page.tsx`, remove these lines from the state block (lines ~91–100):

```ts
// DELETE these lines:
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
```

Also remove the `activeTab` state and `Tab` type:

```ts
// DELETE these:
type Tab = "teams" | "levels";
// and:
const [activeTab, setActiveTab] = useState<Tab>("teams");
```

- [ ] **Step 2: Remove Levels functions**

Remove the `fetchLevels` function (~lines 105–116), the `useEffect` that calls it (~lines 118–124), `handleCreateLevel` (~lines 126–146), `handleEditLevel` (~lines 148–168), and `handleDeleteLevel` (~lines 170–185).

- [ ] **Step 3: Remove TAB_CONFIG and tab bar**

Remove the `TAB_CONFIG` array (~lines 266–269) and the entire tab bar JSX block (~lines 294–322):

```tsx
{/* DELETE: Tab bar */}
<div className="flex items-center gap-6 border-b border-gray-200 mb-6">
  {TAB_CONFIG.map(...)}
</div>
```

- [ ] **Step 4: Remove conditional tab rendering wrappers**

The teams content is currently wrapped in `{activeTab === "teams" && (...)}`. Remove the wrapper condition — keep the inner content but remove the outer conditional. Remove the entire Levels tab content block (`{activeTab === "levels" && (...)}`, ~lines 510–566).

- [ ] **Step 5: Fix PageHeader — remove conditional Levels button**

The PageHeader currently renders different buttons based on `activeTab`. Simplify it to always show the Teams buttons:

```tsx
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
```

- [ ] **Step 6: Remove Level-related imports and interface**

Remove the `Level` interface and any now-unused imports: `Layers`, `AlertTriangle` (if not used elsewhere).

- [ ] **Step 7: Remove the three Level dialogs**

Delete the Create Level Dialog, Edit Level Dialog, and Delete Level Dialog JSX blocks (~lines 610–689).

- [ ] **Step 8: Verify Teams page**

Visit `/teams`. Confirm:
- Page renders a flat teams grid with no tabs
- Search, archive/active toggle, edit, delete, archive actions all work
- No console errors

- [ ] **Step 9: Commit**

```bash
git add src/app/(dashboard)/teams/page.tsx
git commit -m "refactor: remove Levels tab from Teams page"
```

---

## Task 4: Create SelectPerson component

**Files:**
- Create: `src/components/ui/select-person.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { Combobox } from "@/components/ui/combobox";
import { Avatar } from "@/components/ui/avatar";

interface SelectPersonUser {
  id: string;
  name: string;
  email: string;
  avatar?: string | null;
}

interface SelectPersonProps {
  label?: string;
  placeholder?: string;
  value: string | null;
  onChange: (value: string | null) => void;
  users: SelectPersonUser[];
  disabledIds?: Set<string>;
  disabledReason?: string;
  onSearchChange?: (query: string) => void;
  loading?: boolean;
  emptyMessage?: string;
}

export function SelectPerson({
  label = "Select Person",
  placeholder = "Search by name or email...",
  value,
  onChange,
  users,
  disabledIds,
  disabledReason = "Already in team",
  onSearchChange,
  loading,
  emptyMessage = "No matching users found",
}: SelectPersonProps) {
  const options = users.map((u) => ({
    value: u.id,
    label: u.name,
    sublabel: u.email,
    disabled: disabledIds?.has(u.id) ?? false,
    disabledReason: disabledIds?.has(u.id) ? disabledReason : undefined,
    icon: <Avatar name={u.name} src={u.avatar ?? undefined} size="sm" />,
  }));

  return (
    <Combobox
      label={label}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      options={options}
      onSearchChange={onSearchChange}
      loading={loading}
      emptyMessage={emptyMessage}
    />
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run `npx tsc --noEmit` and confirm no type errors in the new file.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/select-person.tsx
git commit -m "feat: add SelectPerson component"
```

---

## Task 5: Use SelectPerson in Add Team Member dialog

**Files:**
- Modify: `src/app/(dashboard)/teams/[teamId]/page.tsx`

- [ ] **Step 1: Add import**

At the top of `src/app/(dashboard)/teams/[teamId]/page.tsx`, add:

```tsx
import { SelectPerson } from "@/components/ui/select-person";
```

- [ ] **Step 2: Replace userOptions state with users state**

Find the state declaration:

```ts
const [userOptions, setUserOptions] = useState<ComboboxOption[]>([]);
```

Replace it with:

```ts
const [users, setUsers] = useState<{ id: string; name: string; email: string; avatar: string | null }[]>([]);
```

- [ ] **Step 3: Update the fetch effect to store raw users**

Find the `useEffect` that builds `userOptions` (~lines 220–258). Replace the `setUserOptions(...)` call:

```ts
// BEFORE:
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

// AFTER:
setUsers(json.data);
```

Also remove the `existingIds` set construction that was used for building options:

```ts
// DELETE this line:
const existingIds = new Set(team?.members.map((m) => m.user.id) ?? []);
```

- [ ] **Step 4: Replace Combobox with SelectPerson in the dialog**

Find the Add Member dialog's `<Combobox>` block (~lines 680–692):

```tsx
// BEFORE:
<div>
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

// AFTER:
<div>
  <SelectPerson
    value={selectedUserId}
    onChange={setSelectedUserId}
    users={users}
    disabledIds={new Set(team?.members.map((m) => m.user.id) ?? [])}
    onSearchChange={setUserSearchQuery}
    loading={usersLoading}
  />
</div>
```

- [ ] **Step 5: Remove unused imports**

If `Combobox` and `ComboboxOption` are no longer referenced anywhere else in this file, remove their imports:

```ts
// DELETE if no longer used:
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
```

Also remove the `Avatar` import if it is no longer used directly in this file (it's now used inside `SelectPerson`).

- [ ] **Step 6: Verify**

Run `npx tsc --noEmit`. Then visit a team detail page, click "Add Team Member", and confirm:
- The person combobox renders with avatar, name, and email
- Existing team members appear disabled with "Already in team" reason
- Search works with debounce
- Selecting a person and submitting adds them to the team

- [ ] **Step 7: Commit**

```bash
git add src/app/(dashboard)/teams/[teamId]/page.tsx
git commit -m "refactor: use SelectPerson in Add Team Member dialog"
```

---

## Final Check

- [ ] Run `npx tsc --noEmit` — zero errors
- [ ] Run `npm run build` — builds cleanly
- [ ] Visit `/levels` — grid, create, edit, delete all work
- [ ] Visit `/teams` — flat page, no tabs, teams CRUD works
- [ ] Visit a team detail page → Add Team Member — SelectPerson renders correctly
- [ ] Sidebar order: Dashboard → Cycles → Templates → Teams → People → Levels
