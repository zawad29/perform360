import type { Step } from "react-joyride";

const FLOATING = {
  floatingOptions: {
    shiftOptions: { padding: 20 },
    flipOptions: { padding: 20 },
  },
};

export const tourSteps: Record<string, Step[]> = {
  // ─── Template builder (new + edit) ───────────────────────────────────────
  "/templates/new": [
    {
      target: '[data-tour="template-name"]',
      title: "Name your template",
      content:
        "Give this form a descriptive name, e.g. 'Standard 360° Review'. This is what admins see when picking a template for a cycle.",
      skipBeacon: true,
      placement: "auto",
      ...FLOATING,
    },
    {
      target: '[data-tour="template-levels"]',
      title: "Levels (optional)",
      content:
        "Restrict this template to specific seniority levels, e.g. only Senior Engineers. Leave empty and the template applies to everyone regardless of level.",
      skipBeacon: true,
      placement: "auto",
      ...FLOATING,
    },
    {
      target: '[data-tour="template-weights"]',
      title: "Scoring weights (optional)",
      content:
        "Controls how much each reviewer type influences the final score. 'Equal weight' is the safe default — every reviewer type counts the same.",
      skipBeacon: true,
      placement: "auto",
      ...FLOATING,
    },
    {
      target: '[data-tour="direction-routing"]',
      title: "Filter sections by reviewer direction",
      content:
        "Turn this on only if some sections should only go to managers (Downward), peers (Lateral), or direct reports (Upward). Leave off to show all sections to all reviewers.",
      skipBeacon: true,
      placement: "auto",
      ...FLOATING,
    },
    {
      target: '[data-tour="add-section"]',
      title: "Add a section",
      content:
        "A section groups related questions. For example: 'Communication Skills' or 'Delivery & Execution'. Add one or more sections, then add questions inside each one.",
      skipBeacon: true,
      placement: "auto",
      ...FLOATING,
    },
    {
      target: '[data-tour="template-save"]',
      title: "Save when ready",
      content:
        "Save your template. You can always come back to edit it. A template can be reused across multiple evaluation cycles.",
      skipBeacon: true,
      placement: "auto",
      ...FLOATING,
    },
  ],

  // ─── Template view page ───────────────────────────────────────────────────
  "/templates/view": [
    {
      target: '[data-tour="template-meta"]',
      title: "Template overview",
      content:
        "Shows version number, creation date, how many sections and questions this template has, and which seniority levels it applies to.",
      skipBeacon: true,
      placement: "auto",
      ...FLOATING,
    },
    {
      target: '[data-tour="section-visibility-matrix"]',
      title: "Section visibility by direction",
      content:
        "Each row is a section; each column is a reviewer direction (Downward, Upward, Lateral, Self, External). A filled dot means that section is shown to reviewers in that direction.",
      skipBeacon: true,
      placement: "auto",
      ...FLOATING,
    },
    {
      target: '[data-tour="weights-by-role"]',
      title: "Scoring weights by role",
      content:
        "Shows how much each reviewer direction contributes to the final score, separately for Members and Managers. If not configured, all directions are averaged equally.",
      skipBeacon: true,
      placement: "auto",
      ...FLOATING,
    },
    {
      target: '[data-tour="form-preview"]',
      title: "Form preview",
      content:
        "Pick a review flow (Manager→Member, Peer, Self, etc.) to see exactly what questions reviewers will see for that direction. Use the Member/Manager toggle to switch the subject's role.",
      skipBeacon: true,
      placement: "auto",
      ...FLOATING,
    },
    {
      target: '[data-tour="sections-sidebar"]',
      title: "Sections at a glance",
      content:
        "A quick list of all sections with their question count and direction tags. Direction glyphs next to a section mean it only appears for those reviewer types.",
      skipBeacon: true,
      placement: "auto",
      ...FLOATING,
    },
  ],

  // ─── People ───────────────────────────────────────────────────────────────
  "/people": [
    {
      target: '[data-tour="invite-button"]',
      title: "Invite team members",
      content:
        "Click here to add someone to your organization. They'll receive a magic link by email — no password needed.",
      skipBeacon: true,
      placement: "auto",
      ...FLOATING,
    },
    {
      target: '[data-tour="role-filter-tabs"]',
      title: "Filter by role",
      content:
        "Use these tabs to quickly find admins, HR managers, or team members.",
      skipBeacon: true,
      placement: "auto",
      ...FLOATING,
    },
    {
      target: '[data-tour="people-list"]',
      title: "Your team",
      content:
        "Everyone in your organization. Use the ••• actions menu on each row to edit a person's name, change their role, or deactivate them.",
      skipBeacon: true,
      placement: "center",
    },
  ],

  // ─── Teams new ────────────────────────────────────────────────────────────
  "/teams/new": [
    {
      target: '[data-tour="team-name"]',
      title: "Name your team",
      content:
        "Teams group people who evaluate each other, e.g. 'Engineering' or 'Design'.",
      skipBeacon: true,
      placement: "auto",
      ...FLOATING,
    },
    {
      target: '[data-tour="team-create"]',
      title: "Create the team",
      content:
        "After creating the team, go to the team page to add members. You need at least one Manager and one Member for evaluations to be generated.",
      skipBeacon: true,
      placement: "auto",
      ...FLOATING,
    },
  ],

  // ─── Cycle creation step 0 ────────────────────────────────────────────────
  "/cycles/new/step-0": [
    {
      target: '[data-tour="cycle-name"]',
      title: "Name your cycle",
      content:
        "Give this review period a descriptive name, e.g. 'Q1 2026 Performance Review'.",
      skipBeacon: true,
      placement: "auto",
      ...FLOATING,
    },
    {
      target: '[data-tour="cycle-dates"]',
      title: "Set the review period",
      content:
        "Start date: when reviewers can begin submitting. End date: the system closes submissions automatically on this date.",
      skipBeacon: true,
      placement: "auto",
      ...FLOATING,
    },
  ],

  // ─── Cycle creation step 1 ────────────────────────────────────────────────
  "/cycles/new/step-1": [
    {
      target: '[data-tour="cycle-groups"]',
      title: "Assign teams and templates",
      content:
        "A group links teams to the evaluation form they'll use. If all your teams use the same template, one group is enough. Add more groups if different teams need different forms.",
      skipBeacon: true,
      placement: "center",
    },
    {
      target: '[data-tour="group-teams"]',
      title: "Pick participating teams",
      content:
        "Select the teams whose members will be reviewed in this cycle.",
      skipBeacon: true,
      placement: "auto",
      ...FLOATING,
    },
    {
      target: '[data-tour="group-templates"]',
      title: "Pick an evaluation template",
      content:
        "The template is the form reviewers fill out. Pick one that matches this team. A template with no level filter covers everyone regardless of seniority.",
      skipBeacon: true,
      placement: "auto",
      ...FLOATING,
    },
    {
      target: '[data-tour="routing-matrix"]',
      title: "Preview assignments",
      content:
        "This table shows which template each person on the team will receive, based on their level. It's a read-only preview — nothing to configure here.",
      skipBeacon: true,
      placement: "center",
    },
  ],
};

export function getStepsForPath(pathname: string): Step[] {
  if (tourSteps[pathname]) return tourSteps[pathname];

  // Cycle creation: pick steps based on current wizard step shown in DOM
  if (pathname === "/cycles/new") {
    if (typeof document !== "undefined") {
      const el = document.querySelector("[data-wizard-step]");
      const wizardStep = el?.getAttribute("data-wizard-step") ?? "0";
      return tourSteps[`/cycles/new/step-${wizardStep}`] ?? [];
    }
    return tourSteps["/cycles/new/step-0"] ?? [];
  }

  // Template editor (edit page reuses builder)
  if (/^\/templates\/[^/]+\/edit$/.test(pathname)) {
    return tourSteps["/templates/new"] ?? [];
  }

  // Template view page
  if (/^\/templates\/[^/]+$/.test(pathname)) {
    return tourSteps["/templates/view"] ?? [];
  }

  // Team detail page
  if (/^\/teams\/[^/]+$/.test(pathname)) {
    return getTeamDetailSteps();
  }

  return [];
}

function getTeamDetailSteps(): Step[] {
  return [
    {
      target: '[data-tour="add-member"]',
      title: "Add people to this team",
      content:
        "Opens the add member form. You can add: Manager (evaluates direct reports), Member (evaluated by peers & manager), External (outside reviewer), or Impersonator (submits on someone else's behalf). Add at least one Manager and one Member to generate evaluations.",
      skipBeacon: true,
      placement: "auto",
      ...FLOATING,
    },
    {
      target: '[data-tour="members-list"]',
      title: "Team members",
      content:
        "Everyone listed here will take part in evaluation cycles. The direction counts at the top (Downward, Upward, Lateral, Self) update automatically as you add or remove people.",
      skipBeacon: true,
      placement: "center",
    },
  ];
}
