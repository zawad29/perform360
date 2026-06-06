# Template Configuration Wizard

**Date:** 2026-06-06  
**Status:** Approved for implementation

## Problem

The current template builder is a single long-scroll page with too much cognitive load:
- Basic info, designations, weights, direction routing, and sections/questions all compete for attention simultaneously
- Direction routing is a hidden checkbox mid-page that expands confusing directional jargon (Downward/Upward/Lateral) — users don't understand "which reviewer is reviewing which"
- The weights configuration requires managing dual profiles (member vs manager) with percentages that must sum to 100%, all in a collapsible strip
- No sense of progress or structure

## Solution

Replace the single-page builder with a **4-step wizard** (Content First approach). Direction routing becomes an optional Advanced panel with renamed labels and a positive visual model.

---

## Wizard Steps

### Step 1 · Basics

Fields:
- **Template Name** (required, text input)
- **Description** (optional, textarea)
- **Applies to** (designations): default "All designations" selected; option to pick specific designations inline via toggle buttons

No collapsible strips — everything is flat and visible.

Navigation: Continue → (disabled until name is filled)

---

### Step 2 · Sections & Questions

The existing drag-and-drop section/question editor, unchanged in capability, but given full-page focus with no competing UI.

- Sections are draggable (dnd-kit, as today)
- Questions within sections are draggable
- Questions can move between sections
- Question types: Rating Scale, Text, Multiple Choice (unchanged)
- Rating scale configuration (range, labels) unchanged

**Advanced panel — Section Visibility by Reviewer Type** (collapsed by default):

Located at the bottom of the step. Entry point is a small row:

```
Section visibility by reviewer type  [Optional]     [Configure ↓]
```

When expanded:
- Explanation text: "By default, all reviewers see all sections. Enable this to hide specific sections from certain reviewer types."
- Toggle to enable/disable
- When enabled: each section shows a row of reviewer-type pills (dark = visible, faded = hidden)
- Summary line per section: "Visible to: Manager review, Peer review"

Direction label rename (data model unchanged, only display labels change):

| Old label | New label |
|-----------|-----------|
| Downward  | Manager review |
| Lateral   | Peer review |
| Self      | Self review |
| Upward    | Upward review |
| External  | External review |

Semantics fix: selecting no pills means "visible to everyone" — shown explicitly as "Visible to: Everyone" rather than an empty array.

Disabling the toggle shows a confirmation: "This will make all sections visible to all reviewer types."

Navigation: ← Back · Continue →

---

### Step 3 · Scoring Setup

Weights configuration as 4 large selectable cards:

| Card | Description |
|------|-------------|
| No scoring weights | All feedback treated equally (default) |
| Equal weights | Each reviewer type contributes 20% |
| Supervisor focus | Manager review weighted higher |
| Custom | Set percentages manually |

When **Custom** is selected: inline number inputs appear for each reviewer type (must sum to 100%, live validation shown).

Optional toggle: **"Managers have different weights"** — when enabled, shows a second column of inputs for the manager-as-subject case. When disabled, member weights are mirrored to manager weights automatically on save.

Navigation: ← Back · Continue →

---

### Step 4 · Review & Save

Summary view before committing:

- Template name and designations
- Section count and total question count  
- Scoring preset (and reviewer type visibility if advanced was configured)
- "Edit" links per summary card that jump back to the relevant step

Save button triggers the same API call as today (POST `/api/templates` for new, PATCH `/api/templates/:id` for edit).

Navigation: ← Back · Save Template ✓

---

## Per-Step Validation

Each "Continue →" button validates the current step before advancing:

| Step | Required to proceed |
|------|---------------------|
| Step 1 | Template name is non-empty |
| Step 2 | At least one section; every section has at least one question |
| Step 3 | If Custom weights: member weights sum to 100%; if manager weights enabled, manager weights also sum to 100% |
| Step 4 | No additional validation — Save button always enabled |

Validation errors are shown inline (field-level) rather than as toasts, so the user sees exactly what needs fixing without scrolling to find it.

---

## Edit Flow

The same 4-step wizard is used for editing, pre-populated from the API. The step indicator shows all 4 steps as accessible (not locked), so the user can jump to any step.

Global templates (`isGlobal: true`) still show an error page and cannot be edited.

---

## What Does Not Change

- The section/question editor internals (drag handles, question type selector, scale config, multiple choice options)
- The underlying Prisma data model — `directions` still stores the enum array; display labels are a UI-only rename
- The template list page (`/templates`)
- Version history behavior (bump on save, `EvaluationTemplateVersion` table)
- API routes and request/response shapes

---

## Files Affected

**Pages (routing):**
- `src/app/(dashboard)/templates/new/page.tsx` — becomes wizard entry, manages step state
- `src/app/(dashboard)/templates/[templateId]/edit/page.tsx` — same wizard, pre-populated

**Components (new or modified):**
- `src/components/templates/template-builder.tsx` — refactor to render active step only
- `src/components/templates/template-meta-strips.tsx` — Designations strip moves into Step 1; Weights strip becomes Step 3 card layout; file likely removed or guttered
- New: `src/components/templates/wizard-steps/step-basics.tsx`
- New: `src/components/templates/wizard-steps/step-sections.tsx`
- New: `src/components/templates/wizard-steps/step-scoring.tsx`
- New: `src/components/templates/wizard-steps/step-review.tsx`
- New: `src/components/templates/section-visibility-panel.tsx` (the Advanced panel)

**Store:**
- `src/store/template-builder.ts` — add `currentStep: number` field; existing shape unchanged

---

## Out of Scope

- Changes to the template list page
- Changes to how templates are consumed in cycle configuration
- Any changes to question types or scoring logic
- Routing direction labels in other parts of the app (routing matrix, reports) — separate task
