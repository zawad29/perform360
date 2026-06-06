# Design: Nav Reorder, Levels Page, SelectPerson Component

**Date:** 2026-06-06

## Overview

Three related changes to improve navigation structure and component reuse:

1. Reorder nav items by usage frequency (daily use first, setup last)
2. Extract Levels out of the Teams page into its own `/levels` route and nav item
3. Create a reusable `SelectPerson` component used in Add Team Member

---

## 1. Nav Reorder

**File:** `src/components/layout/nav-items.ts`

Update the `navItems` array to this order:

| # | Label | Route | Icon |
|---|-------|-------|------|
| 1 | Dashboard | `/overview` | LayoutDashboard |
| 2 | Cycles | `/cycles` | RefreshCcw |
| 3 | Templates | `/templates` | FileText |
| 4 | Teams | `/teams` | Users |
| 5 | People | `/people` | UserCircle |
| 6 | Levels | `/levels` | Layers (new) |

Bottom nav (unchanged):
- Settings → `/settings`

Rationale: daily-use items (Dashboard, Cycles) appear first; configuration items (Templates, Teams, People, Levels) come after in setup dependency order.

---

## 2. Levels Page

### New page

**File:** `src/app/(dashboard)/levels/page.tsx`

Moves all Levels tab content from `src/app/(dashboard)/teams/page.tsx` into a dedicated page. Content includes:

- Page title: "Levels"
- Grid of level cards (level name + member count)
- Create Level button → Create Level dialog
  - Input: level name (max 50 chars, placeholder "e.g. SE L-1, Designer D-2")
  - POST `/api/levels`
- Per-card actions:
  - Edit → Edit Level dialog (PATCH `/api/levels/[id]`)
  - Delete → Delete Level confirmation dialog (DELETE `/api/levels/[id]`)
    - Disabled + warning if members are assigned to the level
- All existing state, dialogs, and API call logic migrated verbatim from teams/page.tsx

### Teams page cleanup

**File:** `src/app/(dashboard)/teams/page.tsx`

- Remove the Tabs UI (`<Tabs>`, `<TabsList>`, `<TabsTrigger>`, `<TabsContent>`)
- Remove the entire Levels tab content block
- The Teams list becomes the flat page content (no tab wrapper)
- Remove any Levels-related state, handlers, and dialog components

---

## 3. SelectPerson Component

### New component

**File:** `src/components/ui/select-person.tsx`

```ts
interface SelectPersonProps {
  label?: string
  placeholder?: string
  value: string | null
  onChange: (value: string | null) => void
  users: { id: string; name: string; email: string; avatar?: string }[]
  disabledIds?: Set<string>
  disabledReason?: string        // defaults to "Already in team"
  onSearchChange?: (query: string) => void
  loading?: boolean
  emptyMessage?: string
}
```

- Builds `ComboboxOption[]` from `users`:
  - `value` → `user.id`
  - `label` → `user.name`
  - `sublabel` → `user.email`
  - `icon` → `<Avatar name={user.name} src={user.avatar} size="sm" />`
  - `disabled` → `disabledIds?.has(user.id)`
  - `disabledReason` → prop value (default: `"Already in team"`)
- Renders `<Combobox>` with the built options and forwarded props

### Usage in Add Team Member dialog

**File:** `src/app/(dashboard)/teams/[teamId]/page.tsx`

Replace the inline `<Combobox>` + manual option-building in the Add Team Member dialog with:

```tsx
<SelectPerson
  label="Select Person"
  placeholder="Search by name or email..."
  value={selectedUserId}
  onChange={setSelectedUserId}
  users={users}
  disabledIds={existingMemberIds}
  onSearchChange={setUserSearchQuery}
  loading={usersLoading}
  emptyMessage="No matching users found"
/>
```

Remove the inline `userOptions` memo and the manual `ComboboxOption` construction — that logic moves into `SelectPerson`.

---

## Files Changed

| Action | File |
|--------|------|
| Edit | `src/components/layout/nav-items.ts` |
| Create | `src/app/(dashboard)/levels/page.tsx` |
| Edit | `src/app/(dashboard)/teams/page.tsx` |
| Create | `src/components/ui/select-person.tsx` |
| Edit | `src/app/(dashboard)/teams/[teamId]/page.tsx` |

## Files Unchanged

- `src/components/ui/combobox.tsx` — no changes to the generic component
- All `/api/levels` routes — no changes needed
- Sidebar and top-nav layout files — only `nav-items.ts` changes
