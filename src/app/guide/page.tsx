"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Users,
  ChevronDown,
  ChevronRight,
  Building2,
  UserCircle,
  Briefcase,
  ArrowRight,
  Lightbulb,
  CheckCircle2,
  Info,
  GitBranch,
  BarChart3,
  FileText,
  Mail,
  Star,
  MessageSquare,
  Shield,
  RefreshCcw,
  Radar,
  Layers,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Section definitions ───

const sections = [
  { id: "how-360-works", label: "How 360° Works", icon: Radar },
  { id: "roles", label: "Team Roles", icon: Users },
  { id: "example-org", label: "Example Org", icon: GitBranch },
  { id: "creating-teams", label: "Creating Teams", icon: CheckCircle2 },
  { id: "running-cycles", label: "Running Cycles", icon: RefreshCcw },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "org-patterns", label: "Org Patterns", icon: Lightbulb },
] as const;

type SectionId = (typeof sections)[number]["id"];

// ─── Hierarchy Node Component ───

interface OrgNode {
  title: string;
  role?: string;
  level?: string;
  badge?: { label: string; variant: "success" | "warning" | "info" | "default" | "outline" };
  children?: OrgNode[];
}

function OrgTree({ nodes, depth = 0 }: { nodes: OrgNode[]; depth?: number }) {
  return (
    <div className={cn("space-y-1", depth > 0 && "ml-3 sm:ml-6 border-l border-gray-100 pl-2 sm:pl-4")}>
      {nodes.map((node, i) => (
        <OrgNodeItem key={`${node.title}-${i}`} node={node} depth={depth} />
      ))}
    </div>
  );
}

function OrgNodeItem({ node, depth }: { node: OrgNode; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div>
      <button
        onClick={() => hasChildren && setExpanded(!expanded)}
        className={cn(
          "flex items-center gap-2 sm:gap-2.5 w-full text-left py-2 px-2 sm:px-3",
          hasChildren ? "hover:bg-gray-50 cursor-pointer" : "cursor-default",
          depth === 0 && "bg-gray-50"
        )}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown size={14} strokeWidth={1.5} className="text-gray-400 shrink-0" />
          ) : (
            <ChevronRight size={14} strokeWidth={1.5} className="text-gray-400 shrink-0" />
          )
        ) : (
          <div className="w-[14px] shrink-0 flex justify-center">
            <div className="w-1.5 h-1.5 bg-gray-300" />
          </div>
        )}
        <span className={cn(
          "text-[13px] sm:text-[14px] truncate",
          depth === 0 ? "font-semibold text-gray-900" : "font-medium text-gray-700"
        )}>
          {node.title}
        </span>
        {node.role && (
          <span className="text-[11px] sm:text-[12px] text-gray-400 hidden sm:inline">{node.role}</span>
        )}
        {node.level && (
          <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 bg-gray-100 px-1.5 py-0.5 font-medium shrink-0">
            <Layers size={10} strokeWidth={1.5} />
            {node.level}
          </span>
        )}
        {node.badge && (
          <Badge variant={node.badge.variant}>{node.badge.label}</Badge>
        )}
      </button>
      {hasChildren && expanded && (
        <OrgTree nodes={node.children!} depth={depth + 1} />
      )}
    </div>
  );
}

// ─── Step Card ───

function StepCard({
  step,
  title,
  description,
  children,
}: {
  step: number;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2.5 sm:gap-4">
      <div className="flex flex-col items-center">
        <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gray-900 text-white flex items-center justify-center text-[13px] sm:text-[14px] font-semibold shrink-0">
          {step}
        </div>
        <div className="w-px flex-1 bg-gray-200 mt-2" />
      </div>
      <div className="pb-6 sm:pb-8 flex-1 min-w-0">
        <h4 className="text-headline text-gray-900">{title}</h4>
        <p className="text-callout text-gray-500 mt-1 mb-3 sm:mb-4">{description}</p>
        {children}
      </div>
    </div>
  );
}

// ─── Tip Box ───

function TipBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 p-4 bg-gray-50 border border-gray-200">
      <Lightbulb size={18} strokeWidth={1.5} className="text-gray-500 shrink-0 mt-0.5" />
      <div className="text-[14px] text-gray-600 leading-relaxed">{children}</div>
    </div>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 p-4 bg-gray-50 border border-gray-200">
      <Info size={18} strokeWidth={1.5} className="text-gray-500 shrink-0 mt-0.5" />
      <div className="text-[14px] text-gray-600 leading-relaxed">{children}</div>
    </div>
  );
}

// ─── Example Hierarchy Data ───

const techCompanyHierarchy: OrgNode[] = [
  {
    title: "TechCorp Inc.",
    role: "Organization",
    badge: { label: "Example", variant: "outline" },
    children: [
      {
        title: "Executive / Leadership Team",
        role: "CTO evaluates all department heads",
        badge: { label: "Team", variant: "success" },
        children: [
          { title: "James Carter", role: "CTO / Director", badge: { label: "Manager", variant: "warning" } },
          { title: "Sarah Chen", role: "Engineering Manager", badge: { label: "Member", variant: "info" } },
          { title: "Robert Hayes", role: "Finance Director", badge: { label: "Member", variant: "info" } },
          { title: "Emily Tran", role: "Accounts Lead", badge: { label: "Member", variant: "info" } },
          { title: "Maria Santos", role: "HR Director", badge: { label: "Member", variant: "info" } },
          { title: "David Liu", role: "Office Manager", badge: { label: "Member", variant: "info" } },
          { title: "Board Advisor", role: "External Consultant", badge: { label: "External", variant: "outline" } },
        ],
      },
      {
        title: "Engineering",
        role: "Department",
        badge: { label: "4 Teams", variant: "info" },
        children: [
          {
            title: "Engineering Management",
            role: "EM evaluates all solution architects",
            badge: { label: "Team", variant: "success" },
            children: [
              { title: "Sarah Chen", role: "Engineering Manager", badge: { label: "Manager", variant: "warning" } },
              { title: "Alex Rivera", role: "Solution Architect — Platform", level: "SA L-3", badge: { label: "Member", variant: "info" } },
              { title: "Priya Sharma", role: "Solution Architect — Frontend", level: "SA L-3", badge: { label: "Member", variant: "info" } },
              { title: "Dan Kim", role: "Solution Architect - DevOps", level: "SA L-2", badge: { label: "Member", variant: "info" } },
            ],
          },
          {
            title: "Platform Team",
            role: "Lead: Alex Rivera",
            badge: { label: "Team", variant: "success" },
            children: [
              { title: "Alex Rivera", role: "Solution Architect", level: "SA L-3", badge: { label: "Manager", variant: "warning" } },
              { title: "Jordan Lee", role: "Senior Engineer", level: "SE L-2", badge: { label: "Member", variant: "info" } },
              { title: "Maya Patel", role: "Engineer", level: "SE L-1", badge: { label: "Member", variant: "info" } },
              { title: "Chris Wu", role: "Junior Engineer", level: "SE L-1", badge: { label: "Member", variant: "info" } },
              { title: "Lisa Park", role: "Client Stakeholder", badge: { label: "External", variant: "outline" } },
            ],
          },
          {
            title: "Frontend Team",
            role: "Lead: Priya Sharma",
            badge: { label: "Team", variant: "success" },
            children: [
              { title: "Priya Sharma", role: "Solution Architect", level: "SA L-3", badge: { label: "Manager", variant: "warning" } },
              { title: "Tom Zhang", role: "Senior Engineer", level: "SE L-2", badge: { label: "Member", variant: "info" } },
              { title: "Nina Costa", role: "Engineer", level: "SE L-1", badge: { label: "Member", variant: "info" } },
            ],
          },
          {
            title: "DevOps Team",
            role: "Lead: Dan Kim",
            badge: { label: "Team", variant: "success" },
            children: [
              { title: "Dan Kim", role: "Solution Architect", level: "SA L-2", badge: { label: "Manager", variant: "warning" } },
              { title: "Sam Ali", role: "DevOps Engineer", level: "SE L-1", badge: { label: "Member", variant: "info" } },
            ],
          },
        ],
      },
      {
        title: "Finance & Accounts",
        role: "Department",
        badge: { label: "2 Teams", variant: "info" },
        children: [
          {
            title: "Finance Team",
            role: "Lead: Robert Hayes",
            badge: { label: "Team", variant: "success" },
            children: [
              { title: "Robert Hayes", role: "Finance Director", badge: { label: "Manager", variant: "warning" } },
              { title: "Lisa Park", role: "Financial Analyst", badge: { label: "Member", variant: "info" } },
              { title: "Mark Jensen", role: "Budget Analyst", badge: { label: "Member", variant: "info" } },
            ],
          },
          {
            title: "Accounts Team",
            role: "Lead: Emily Tran",
            badge: { label: "Team", variant: "success" },
            children: [
              { title: "Emily Tran", role: "Accounts Lead", badge: { label: "Manager", variant: "warning" } },
              { title: "James Wong", role: "Accountant", badge: { label: "Member", variant: "info" } },
              { title: "Aisha Khan", role: "Accounts Payable", badge: { label: "Member", variant: "info" } },
            ],
          },
        ],
      },
      {
        title: "Human Resources",
        role: "Department",
        badge: { label: "1 Team", variant: "info" },
        children: [
          {
            title: "HR Team",
            role: "Lead: Maria Santos",
            badge: { label: "Team", variant: "success" },
            children: [
              { title: "Maria Santos", role: "HR Director", badge: { label: "Manager", variant: "warning" } },
              { title: "Kevin Brown", role: "HR Specialist", badge: { label: "Member", variant: "info" } },
              { title: "Rachel Adams", role: "Recruiter", badge: { label: "Member", variant: "info" } },
            ],
          },
        ],
      },
      {
        title: "Administration",
        role: "Department",
        badge: { label: "1 Team", variant: "info" },
        children: [
          {
            title: "Admin Team",
            role: "Lead: David Liu",
            badge: { label: "Team", variant: "success" },
            children: [
              { title: "David Liu", role: "Office Manager", badge: { label: "Manager", variant: "warning" } },
              { title: "Sophie Martin", role: "Executive Assistant", badge: { label: "Member", variant: "info" } },
              { title: "Omar Farooq", role: "Facilities Coordinator", badge: { label: "Member", variant: "info" } },
            ],
          },
        ],
      },
    ],
  },
];

// ─── Section Content Components ───

// ─── How 360° Works Section ───

function How360WorksSection({ onNavigate }: { onNavigate?: (id: SectionId) => void }) {
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Concept overview */}
      <Card>
        <div className="flex gap-3 sm:gap-4">
          <div className="p-3 bg-gray-100 h-fit shrink-0">
            <Radar size={24} strokeWidth={1.5} className="text-gray-900" />
          </div>
          <div className="min-w-0">
            <h2 className="text-title-small text-gray-900">What is 360° Feedback?</h2>
            <p className="text-body text-gray-500 mt-2 leading-relaxed">
              Traditional reviews are top-down &mdash; a manager evaluates their team. <strong>360° feedback</strong> collects
              input from <em>every direction</em>: managers, members, peers, and even a self-assessment. This gives a complete,
              well-rounded picture of each employee&apos;s performance, strengths, and growth areas.
            </p>
          </div>
        </div>
      </Card>

      {/* Three directions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <Card padding="sm">
          <div className="flex items-center gap-3 mb-2 sm:mb-3">
            <div className="w-8 h-8 bg-gray-100 flex items-center justify-center text-[16px]">
              &darr;
            </div>
            <h3 className="text-headline text-gray-900">Downward</h3>
          </div>
          <p className="text-callout text-gray-500">
            <strong>Manager &rarr; Member.</strong> The traditional review &mdash;
            managers evaluate the people they supervise.
          </p>
        </Card>

        <Card padding="sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-gray-100 flex items-center justify-center text-[16px]">
              &uarr;
            </div>
            <h3 className="text-headline text-gray-900">Upward</h3>
          </div>
          <p className="text-callout text-gray-500">
            <strong>Member &rarr; Manager.</strong> Team members give feedback
            on their manager&apos;s leadership, communication, and support.
          </p>
        </Card>

        <Card padding="sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-gray-100 flex items-center justify-center text-[16px]">
              &harr;
            </div>
            <h3 className="text-headline text-gray-900">Lateral</h3>
          </div>
          <p className="text-callout text-gray-500">
            <strong>Member &rarr; Member.</strong> Colleagues at the same level evaluate
            each other on collaboration, reliability, and teamwork.
          </p>
        </Card>

        <Card padding="sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-gray-100 flex items-center justify-center text-[16px]">
              &#8635;
            </div>
            <h3 className="text-headline text-gray-900">Self</h3>
          </div>
          <p className="text-callout text-gray-500">
            <strong>Self-assessment.</strong> Each person evaluates their own performance,
            providing insight into self-awareness and personal growth areas.
          </p>
        </Card>

        <Card padding="sm" className="sm:col-span-2">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-gray-100 flex items-center justify-center text-[16px]">
              &#8594;
            </div>
            <h3 className="text-headline text-gray-900">External</h3>
          </div>
          <p className="text-callout text-gray-500">
            <strong>External &rarr; Everyone.</strong> Outside evaluators (clients, board members, consultants) provide
            one-way feedback on all managers and members. Nobody evaluates them back.
          </p>
        </Card>
      </div>

      {/* How evaluations are generated */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gray-100">
              <Users size={20} strokeWidth={1.5} className="text-gray-900" />
            </div>
            <div>
              <CardTitle>How Evaluations Are Generated</CardTitle>
              <CardDescription>
                The system automatically creates every evaluation pair based on team roles
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <div className="mt-4 space-y-4">
          <p className="text-callout text-gray-500">
            When you launch a cycle, the platform looks at each team&apos;s roster and generates all
            evaluation assignments automatically. For a team with <strong>1 manager</strong>, <strong>3 members</strong>,
            and <strong>1 external</strong> evaluator, the math works out to:
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { count: "3", label: "Downward", desc: "Manager → each Member" },
              { count: "3", label: "Upward", desc: "Each Member → Manager" },
              { count: "6", label: "Peer", desc: "Members evaluate each other" },
              { count: "4", label: "Self", desc: "Everyone assesses themselves" },
              { count: "4", label: "External", desc: "External → all internal" },
              { count: "20", label: "Total", desc: "From just 5 people" },
            ].map((item) => (
              <div key={item.label} className={cn(
                "p-3 text-center",
                item.label === "Total" ? "bg-gray-900 text-white" : "bg-gray-50 border border-gray-200"
              )}>
                <p className={cn("text-[20px] font-bold", item.label === "Total" ? "text-white" : "text-gray-900")}>{item.count}</p>
                <p className={cn("text-[13px] font-medium", item.label === "Total" ? "text-gray-300" : "text-gray-900")}>{item.label}</p>
                <p className={cn("text-[11px] mt-0.5", item.label === "Total" ? "text-gray-400" : "text-gray-400")}>{item.desc}</p>
              </div>
            ))}
          </div>

          <InfoBox>
            Every team member both gives and receives feedback from multiple directions &mdash; that&apos;s the power of 360°.
            See the{" "}
            <button onClick={() => onNavigate?.("creating-teams")} className="text-gray-900 underline font-medium">
              Creating Teams
            </button>{" "}
            section for a full walkthrough with the Platform Team example.
          </InfoBox>
        </div>
      </Card>

      {/* Cross-team concept */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gray-100">
              <UserCircle size={20} strokeWidth={1.5} className="text-gray-900" />
            </div>
            <div>
              <CardTitle>Cross-Team Feedback</CardTitle>
              <CardDescription>
                People belong to multiple teams &mdash; their 360° report combines feedback from all of them
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <div className="mt-4 space-y-4">
          <p className="text-callout text-gray-500">
            A person can hold different roles across teams. For example, someone might be a <strong>Manager</strong> in
            one team and a <strong>Member</strong> in another. The 360° report aggregates evaluations from every team they
            belong to, broken down by direction (downward, upward, lateral, self, external).
          </p>

          <div className="border border-gray-200 bg-gray-50 p-3 sm:p-4">
            <p className="text-[13px] font-medium text-gray-900 mb-2">Example: a person in two teams</p>
            <div className="space-y-1.5">
              {[
                { role: "Manager", team: "Team A", feedback: "Receives upward feedback from members, gives downward reviews" },
                { role: "Member", team: "Team B", feedback: "Receives downward feedback from their manager, gives peer + upward reviews" },
              ].map((item) => (
                <div key={item.team} className="flex flex-wrap sm:flex-nowrap items-start gap-2 py-2 px-3 bg-white text-[13px]">
                  <Badge variant={item.role === "Manager" ? "warning" : "info"} className="shrink-0 mt-0.5">{item.role}</Badge>
                  <span className="text-gray-500">in {item.team} &mdash; {item.feedback}</span>
                </div>
              ))}
            </div>
          </div>

          <TipBox>
            The final report shows scores broken down by direction, revealing blind spots that
            a single manager review would miss. Explore the{" "}
            <button onClick={() => onNavigate?.("example-org")} className="text-gray-900 underline font-medium">
              Example Org
            </button>{" "}
            to see how people fit across multiple teams, and the{" "}
            <button onClick={() => onNavigate?.("reports")} className="text-gray-900 underline font-medium">
              Reports
            </button>{" "}
            section for how these scores are presented.
          </TipBox>
        </div>
      </Card>

      {/* Why 360° matters */}
      <Card padding="sm">
        <div className="p-2">
          <h3 className="text-headline text-gray-900 mb-3">Why 360° feedback matters</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { title: "Reduces bias", desc: "One manager's opinion is just one data point. 360° feedback balances multiple perspectives." },
              { title: "Surfaces blind spots", desc: "Peers and members see behaviors that managers don't. Upward feedback improves leadership." },
              { title: "Builds accountability", desc: "When feedback comes from all directions, everyone is accountable to everyone they work with." },
              { title: "Drives growth", desc: "Employees get specific, actionable feedback from the people who interact with them daily." },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 ">
                <CheckCircle2 size={16} strokeWidth={1.5} className="text-gray-900 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[13px] font-medium text-gray-900">{item.title}</p>
                  <p className="text-[12px] text-gray-500 mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

function RolesSection() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <div className="flex gap-3 sm:gap-4">
          <div className="p-3 bg-gray-100 h-fit shrink-0">
            <Building2 size={24} strokeWidth={1.5} className="text-gray-900" />
          </div>
          <div className="min-w-0">
            <h2 className="text-title-small text-gray-900">Understanding Team Structure</h2>
            <p className="text-body text-gray-500 mt-2 leading-relaxed">
              In Performs360, <strong>teams</strong>{' '}are the building blocks of your evaluation cycles.
              Each team represents a functional group within your organization. Team members are assigned
              one of three roles &mdash; <strong>Manager</strong>, <strong>Member</strong>, or <strong>External</strong> &mdash;
              which determines the evaluation directions during review cycles. Lateral feedback is
              automatically derived &mdash; all Members in the same team evaluate each other laterally.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card padding="sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2  bg-gray-100">
              <Briefcase size={18} strokeWidth={1.5} className="text-gray-900" />
            </div>
            <h3 className="text-headline text-gray-900">Manager</h3>
          </div>
          <p className="text-callout text-gray-500">
            Team leads, engineering managers, directors. They evaluate their members (downward)
            and receive upward feedback from them.
          </p>
        </Card>

        <Card padding="sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2  bg-gray-100">
              <UserCircle size={18} strokeWidth={1.5} className="text-gray-900" />
            </div>
            <h3 className="text-headline text-gray-900">Member</h3>
          </div>
          <p className="text-callout text-gray-500">
            Team members who report to a manager. They receive evaluations from their manager,
            give upward feedback, and automatically evaluate each other as peers.
          </p>
        </Card>

        <Card padding="sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2  bg-gray-100">
              <Shield size={18} strokeWidth={1.5} className="text-gray-900" />
            </div>
            <h3 className="text-headline text-gray-900">External</h3>
          </div>
          <p className="text-callout text-gray-500">
            Outside evaluators like clients, board members, or consultants. They provide one-way feedback
            on all managers and members &mdash; nobody evaluates them back.
          </p>
        </Card>
      </div>

      <InfoBox>
        Three roles to pick from when adding someone to a team: <strong>Manager</strong>, <strong>Member</strong>, or <strong>External</strong>.
        The system automatically generates all feedback directions (downward, upward, lateral, self, and external) from these roles.
      </InfoBox>

      {/* Levels */}
      <Card>
        <div className="flex gap-3 sm:gap-4">
          <div className="p-3  bg-gray-100 h-fit shrink-0">
            <Layers size={24} strokeWidth={1.5} className="text-gray-900" />
          </div>
          <div className="min-w-0">
            <h2 className="text-title-small text-gray-900">Seniority Levels (Optional)</h2>
            <p className="text-body text-gray-500 mt-2 leading-relaxed">
              In addition to roles, you can assign <strong>seniority levels</strong>{' '}to team members &mdash;
              for example, &ldquo;SE L-1&rdquo;, &ldquo;SE L-2&rdquo;, &ldquo;Designer D-1&rdquo;. Levels are
              defined globally per company and can be assigned to any team member regardless of role.
            </p>
            <p className="text-body text-gray-500 mt-2 leading-relaxed">
              Levels are <strong>completely optional</strong>. The default flow works without them. When levels are assigned,
              admins can attach multiple templates to a team &mdash; each template can declare which levels it covers and
              which directions its sections apply to. So a junior engineer can get a different evaluation form than a
              senior architect, with the right form auto-routed by the subject&rsquo;s level.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {["SE L-1", "SE L-2", "SA L-2", "SA L-3"].map((lvl) => (
            <div key={lvl} className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-gray-100/50 border border-gray-200 ">
              <Layers size={12} strokeWidth={1.5} className="text-gray-900" />
              <span className="text-[13px] font-medium text-gray-600">{lvl}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function ExampleOrgSection() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2.5  bg-gray-100">
            <GitBranch size={20} strokeWidth={1.5} className="text-gray-900" />
          </div>
          <div>
            <CardTitle>Example: TechCorp Inc. Hierarchy</CardTitle>
            <CardDescription>
              A typical mid-size company with Engineering, Finance, HR, and Admin departments.
              Click to expand each level.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <div className="mt-2">
        <OrgTree nodes={techCompanyHierarchy} />
      </div>
    </Card>
  );
}

function CreatingTeamsSection() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2.5  bg-gray-100">
            <CheckCircle2 size={20} strokeWidth={1.5} className="text-gray-900" />
          </div>
          <div>
            <CardTitle>Creating Teams</CardTitle>
            <CardDescription>
              Identify your working groups and assign roles to each member
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <div className="mt-4">
        <StepCard
          step={1}
          title="Identify Your Teams"
          description="Each functional group that works together becomes a team. Don't create teams for departments — create them for actual working groups."
        >
          <Card padding="sm" className="bg-gray-50 border-gray-100">
            <div className="text-[14px] text-gray-600 space-y-2">
              <p className="font-medium text-gray-900">For TechCorp, you would create 9 teams:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                {[
                  "Leadership Team",
                  "Engineering Management",
                  "Platform Team",
                  "Frontend Team",
                  "DevOps Team",
                  "Finance Team",
                  "Accounts Team",
                  "HR Team",
                  "Admin Team",
                ].map((team) => (
                  <div key={team} className="flex items-center gap-2">
                    <CheckCircle2 size={14} strokeWidth={1.5} className="text-gray-900 shrink-0" />
                    <span>{team}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </StepCard>

        <StepCard
          step={2}
          title="Add Members with Roles"
          description="For each team, add members and assign their role based on the reporting relationship within that team."
        >
          <Card padding="sm" className="bg-gray-50 border-gray-100">
            <div className="text-[14px] text-gray-600">
              <p className="font-medium text-gray-900 mb-3">Example: Platform Team</p>
              <div className="space-y-2">
                {[
                  { name: "Alex Rivera", title: "Solution Architect", level: "SA L-3", role: "Manager" as const, variant: "warning" as const },
                  { name: "Jordan Lee", title: "Senior Engineer", level: "SE L-2", role: "Member" as const, variant: "info" as const },
                  { name: "Maya Patel", title: "Engineer", level: "SE L-1", role: "Member" as const, variant: "info" as const },
                  { name: "Chris Wu", title: "Junior Engineer", level: "SE L-1", role: "Member" as const, variant: "info" as const },
                ].map((m) => (
                  <div key={m.name} className="flex flex-wrap sm:flex-nowrap items-center justify-between py-1.5 px-3 bg-white  gap-1 sm:gap-2 min-w-0">
                    <span className="truncate text-[13px] sm:text-[14px]">{m.name} <span className="text-gray-400 hidden sm:inline">({m.title})</span></span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5  font-medium">
                        <Layers size={9} strokeWidth={1.5} />{m.level}
                      </span>
                      <Badge variant={m.variant}>{m.role}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
          <div className="mt-3">
            <TipBox>
              A person can be a <strong>Manager</strong> in one team and a <strong>Member</strong> in
              another. For example, Sarah Chen is a Member in the Leadership Team (evaluated by the CTO),
              while Alex Rivera is a Manager of the Platform Team. This is how directors evaluate their department heads.
            </TipBox>
          </div>
        </StepCard>

        <StepCard
          step={3}
          title="Assign Seniority Levels (Optional)"
          description="If your company uses seniority levels, go to Levels in the sidebar to create them, then assign a level to each team member."
        >
          <Card padding="sm" className="bg-gray-50 border-gray-100">
            <div className="text-[14px] text-gray-600">
              <p className="font-medium text-gray-900 mb-3">How levels work:</p>
              <div className="space-y-2">
                {[
                  { step: "1", text: "Admin/HR creates levels globally (e.g., SE L-1, SE L-2, SA L-3) from the Levels page in the sidebar" },
                  { step: "2", text: "When adding or editing team members, optionally pick a level for each person" },
                  { step: "3", text: "During cycle creation, toggle Advanced Mode to assign different evaluation templates per level" },
                ].map((s) => (
                  <div key={s.step} className="flex items-start gap-3 py-2 px-3 bg-white ">
                    <span className="w-5 h-5  bg-gray-200 text-gray-600 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">{s.step}</span>
                    <span className="text-gray-600 text-[13px]">{s.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
          <div className="mt-3">
            <InfoBox>
              Levels are <strong>optional</strong> and don&apos;t change the default flow. If you don&apos;t assign levels,
              all team members use the same evaluation template per team &mdash; exactly like before.
            </InfoBox>
          </div>
        </StepCard>
      </div>
    </Card>
  );
}

function RunningCyclesSection() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2.5  bg-gray-100">
            <RefreshCcw size={20} strokeWidth={1.5} className="text-gray-900" />
          </div>
          <div>
            <CardTitle>Running Evaluation Cycles</CardTitle>
            <CardDescription>
              Create a cycle, activate it, and let reviewers complete their evaluations
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <div className="mt-4">
        <StepCard
          step={4}
          title="Create an Evaluation Cycle"
          description="Once your teams are set up, create a cycle and select which teams to include. Assignments are generated automatically."
        >
          <Card padding="sm" className="bg-gray-50 border-gray-100">
            <div className="text-[14px] text-gray-600 space-y-3">
              <p className="font-medium text-gray-900">Auto-generated assignments for Platform Team:</p>
              <div className="space-y-1.5">
                {[
                  { reviewer: "Alex Rivera", subject: "Jordan Lee", rel: "Mgr \u2192 Mbr" },
                  { reviewer: "Alex Rivera", subject: "Maya Patel", rel: "Mgr \u2192 Mbr" },
                  { reviewer: "Alex Rivera", subject: "Chris Wu", rel: "Mgr \u2192 Mbr" },
                  { reviewer: "Jordan Lee", subject: "Alex Rivera", rel: "Mbr \u2192 Mgr" },
                  { reviewer: "Maya Patel", subject: "Alex Rivera", rel: "Mbr \u2192 Mgr" },
                  { reviewer: "Jordan Lee", subject: "Maya Patel", rel: "Peer" },
                  { reviewer: "Alex Rivera", subject: "Alex Rivera", rel: "Self" },
                  { reviewer: "Jordan Lee", subject: "Jordan Lee", rel: "Self" },
                ].map((a, i) => (
                  <div key={i} className="flex items-center gap-1.5 sm:gap-2 py-1.5 px-2 sm:px-3 bg-white  text-[12px] sm:text-[13px] min-w-0">
                    <span className="text-gray-900 font-medium truncate">{a.reviewer}</span>
                    <ArrowRight size={11} strokeWidth={1.5} className="text-gray-400 shrink-0" />
                    <span className="text-gray-900 font-medium truncate">{a.subject}</span>
                    <span className="text-gray-400 ml-auto whitespace-nowrap text-[10px] sm:text-[12px] shrink-0">{a.rel}</span>
                  </div>
                ))}
              </div>
              <p className="text-[12px] text-gray-400">
                ... and more assignments based on all team directions
              </p>
            </div>
          </Card>
          {/* Multi-template tip */}
          <div className="mt-3">
            <Card padding="sm" className="border-gray-200 bg-gray-100/30">
              <div className="flex items-start gap-3">
                <div className="p-1.5  bg-gray-200 shrink-0 mt-0.5">
                  <Layers size={14} strokeWidth={1.5} className="text-gray-500" />
                </div>
                <div>
                  <p className="text-[13px] font-medium text-gray-900">Multi-Template Teams: Level-Resolved Routing</p>
                  <p className="text-[12px] text-gray-600/80 mt-1 leading-relaxed">
                    Attach more than one template to a team and the system auto-routes each subject to the
                    most-specific template that covers their level. For example, an SE L-1 member can be routed
                    to a &ldquo;Junior Engineer Review&rdquo; while an SA L-3 architect on the same team gets a
                    &ldquo;Senior Technical Review&rdquo;. A template with no level filter acts as a wildcard for
                    everyone else.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </StepCard>

        <StepCard
          step={5}
          title="Activate & Send Invitations"
          description="When you activate the cycle, each reviewer receives a unique evaluation link via email. No accounts needed — they verify via OTP."
        >
          <InfoBox>
            Reviewers don&apos;t need a Performs360 account. They receive a secure link,
            verify their identity with a one-time code sent to their email, and complete
            the evaluation form directly.
          </InfoBox>
        </StepCard>

        <StepCard
          step={6}
          title="Each Reviewer Completes Their Evaluations"
          description="Every team member receives email invitations for each person they need to evaluate. Here's what it looks like for the Platform Team:"
        >
          <Card padding="sm" className="bg-gray-50 border-gray-100">
            <div className="text-[14px] text-gray-600 space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Mail size={14} strokeWidth={1.5} className="text-gray-900" />
                  <p className="font-medium text-gray-900">Alex Rivera (Manager) receives 4 evaluation links:</p>
                </div>
                <div className="space-y-1.5 ml-0 sm:ml-5">
                  {[
                    { subject: "Jordan Lee", note: "Evaluates as their Manager" },
                    { subject: "Maya Patel", note: "Evaluates as their Manager" },
                    { subject: "Chris Wu", note: "Evaluates as their Manager" },
                    { subject: "Alex Rivera", note: "Self-assessment" },
                  ].map((a, i) => (
                    <div key={i} className="flex items-center gap-2 py-1.5 px-3 bg-white  text-[13px] min-w-0">
                      <span className="text-gray-500 shrink-0">Evaluate</span>
                      <span className="text-gray-900 font-medium truncate">{a.subject}</span>
                      <span className="text-gray-400 ml-auto text-[11px] sm:text-[12px] shrink-0 hidden sm:inline">{a.note}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Mail size={14} strokeWidth={1.5} className="text-gray-900" />
                  <p className="font-medium text-gray-900">Jordan Lee (Member) receives 4 evaluation links:</p>
                </div>
                <div className="space-y-1.5 ml-0 sm:ml-5">
                  {[
                    { subject: "Alex Rivera", note: "Evaluates their Manager (upward feedback)" },
                    { subject: "Maya Patel", note: "Evaluates a fellow Member (peer feedback)" },
                    { subject: "Chris Wu", note: "Evaluates a fellow Member (peer feedback)" },
                    { subject: "Jordan Lee", note: "Self-assessment" },
                  ].map((a, i) => (
                    <div key={i} className="flex items-center gap-2 py-1.5 px-3 bg-white  text-[13px] min-w-0">
                      <span className="text-gray-500 shrink-0">Evaluate</span>
                      <span className="text-gray-900 font-medium truncate">{a.subject}</span>
                      <span className="text-gray-400 ml-auto text-[11px] sm:text-[12px] shrink-0 hidden sm:inline">{a.note}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Mail size={14} strokeWidth={1.5} className="text-gray-900" />
                  <p className="font-medium text-gray-900">Maya Patel & Chris Wu each receive similar links for their peers and manager.</p>
                </div>
              </div>
            </div>
          </Card>

          <div className="mt-3">
            <TipBox>
              Each evaluation link is <strong>unique and secure</strong>. The reviewer opens the link,
              verifies with a one-time code, and fills out the evaluation form. They can only see
              their own form — never anyone else&apos;s responses.
            </TipBox>
          </div>
        </StepCard>
      </div>
    </Card>
  );
}

function ReportsSection() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2.5  bg-gray-100">
            <BarChart3 size={20} strokeWidth={1.5} className="text-gray-900" />
          </div>
          <div>
            <CardTitle>Reports & Results</CardTitle>
            <CardDescription>
              How feedback is collected and turned into actionable reports
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <div className="mt-4">
        <StepCard
          step={7}
          title="Responses Collected from All Directions"
          description="As reviewers submit their forms, the system collects feedback from every direction — manager, peers, and members. Here's what this looks like for one employee:"
        >
          <Card padding="sm" className="bg-gray-50 border-gray-100">
            <div className="text-[14px] text-gray-600 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <UserCircle size={16} strokeWidth={1.5} className="text-gray-900" />
                <p className="font-semibold text-gray-900 text-[15px]">
                  Report for: Alex Rivera (Solution Architect)
                </p>
              </div>
              <p className="text-[12px] sm:text-[13px] text-gray-500 -mt-2 ml-0 sm:ml-6">
                The system gathers all evaluations where Alex is the <strong>subject</strong>:
              </p>

              {/* Manager feedback */}
              <div className="border border-gray-200 bg-gray-50  p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Briefcase size={14} strokeWidth={1.5} className="text-gray-600" />
                  <span className="font-medium text-gray-900 text-[13px]">Manager Feedback</span>
                  <span className="text-[12px] text-gray-600/60 ml-auto hidden sm:inline">from Engineering Management team</span>
                </div>
                <div className="py-1.5 px-2 sm:px-3 bg-white  text-[12px] sm:text-[13px] flex items-center justify-between min-w-0">
                  <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                    <span className="text-gray-900 font-medium truncate">Sarah Chen</span>
                    <ArrowRight size={11} strokeWidth={1.5} className="text-gray-400 shrink-0" />
                    <span className="text-gray-500 hidden sm:inline shrink-0">evaluated Alex</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Star size={12} strokeWidth={1.5} className="text-gray-400 fill-gray-400" />
                    <span className="text-gray-600 font-medium text-[12px] sm:text-[13px]">4.5</span>
                  </div>
                </div>
              </div>

              {/* Upward feedback from members */}
              <div className="border border-gray-200 bg-gray-50  p-3">
                <div className="flex items-center gap-2 mb-2">
                  <UserCircle size={14} strokeWidth={1.5} className="text-gray-600" />
                  <span className="font-medium text-gray-900 text-[13px]">Upward Feedback (from Members)</span>
                  <span className="text-[12px] text-gray-600/60 ml-auto hidden sm:inline">from Platform Team</span>
                </div>
                <div className="space-y-1.5">
                  {[
                    { name: "Jordan Lee", score: "4.3" },
                    { name: "Maya Patel", score: "4.1" },
                    { name: "Chris Wu", score: "4.6" },
                  ].map((p, i) => (
                    <div key={i} className="py-1.5 px-2 sm:px-3 bg-white  text-[12px] sm:text-[13px] flex items-center justify-between min-w-0">
                      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                        <span className="text-gray-900 font-medium truncate">{p.name}</span>
                        <ArrowRight size={11} strokeWidth={1.5} className="text-gray-400 shrink-0" />
                        <span className="text-gray-500 hidden sm:inline shrink-0">evaluated Alex</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Star size={12} strokeWidth={1.5} className="text-gray-400 fill-gray-400" />
                        <span className="text-gray-600 font-medium text-[12px] sm:text-[13px]">{p.score}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Peer feedback */}
              <div className="border border-gray-200 bg-gray-50  p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Users size={14} strokeWidth={1.5} className="text-gray-600" />
                  <span className="font-medium text-gray-900 text-[13px]">Peer Feedback</span>
                  <span className="text-[12px] text-gray-600/60 ml-auto hidden sm:inline">from Engineering Management team</span>
                </div>
                <div className="space-y-1.5">
                  {[
                    { name: "Priya Sharma", score: "4.0" },
                    { name: "Dan Kim", score: "4.2" },
                  ].map((p, i) => (
                    <div key={i} className="py-1.5 px-2 sm:px-3 bg-white  text-[12px] sm:text-[13px] flex items-center justify-between min-w-0">
                      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                        <span className="text-gray-900 font-medium truncate">{p.name}</span>
                        <ArrowRight size={11} strokeWidth={1.5} className="text-gray-400 shrink-0" />
                        <span className="text-gray-500 hidden sm:inline shrink-0">evaluated Alex</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Star size={12} strokeWidth={1.5} className="text-gray-400 fill-gray-400" />
                        <span className="text-gray-600 font-medium text-[12px] sm:text-[13px]">{p.score}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary */}
              <div className="border border-gray-200 bg-gray-50  p-3">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 size={14} strokeWidth={1.5} className="text-gray-600" />
                  <span className="font-medium text-gray-900 text-[13px]">Alex&apos;s Report Summary</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 sm:gap-2">
                  {[
                    { label: "Manager", value: "4.5", color: "text-gray-600" },
                    { label: "Member", value: "4.3", color: "text-gray-600" },
                    { label: "Peer", value: "4.1", color: "text-gray-600" },
                    { label: "Self", value: "4.0", color: "text-gray-600" },
                    { label: "Overall", value: "4.3", color: "text-gray-900" },
                  ].map((s) => (
                    <div key={s.label} className="text-center py-2 px-1.5 sm:px-2 bg-white ">
                      <p className="text-[10px] sm:text-[11px] text-gray-400 mb-0.5">{s.label}</p>
                      <p className={cn("text-[15px] sm:text-[16px] font-semibold", s.color)}>{s.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <div className="mt-3">
            <InfoBox>
              Each employee gets a comprehensive report showing scores from <strong>every direction</strong> —
              downward feedback from managers, lateral peer feedback, upward feedback from reports, and their own
              self-assessment. Open-text comments are grouped by direction and kept <strong>anonymous</strong> so
              reviewers can be candid. Self-assessment scores are shown separately to highlight self-awareness gaps.
            </InfoBox>
          </div>
        </StepCard>

        <StepCard
          step={8}
          title="Admin / HR Reviews & Shares Reports"
          description="Once the cycle closes, Admin or HR can view individual reports for every employee, export them as PDFs, and share findings."
        >
          <Card padding="sm" className="bg-gray-50 border-gray-100">
            <div className="text-[14px] text-gray-600 space-y-4">
              <p className="font-medium text-gray-900">What the individual report includes:</p>
              <div className="space-y-2">
                {[
                  { icon: BarChart3, label: "Radar chart", desc: "Visual breakdown across all competency areas (communication, technical skills, leadership, etc.)" },
                  { icon: Star, label: "Score breakdown by direction", desc: "See how downward, upward, lateral, self, and external scores compare separately" },
                  { icon: MessageSquare, label: "Anonymized comments", desc: "Open-text feedback grouped by direction — reviewers stay anonymous" },
                  { icon: FileText, label: "Per-question detail", desc: "Score distribution for every question in the evaluation template" },
                  { icon: BarChart3, label: "Trend comparison", desc: "Compare against previous cycles to track growth over time" },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2 sm:gap-3 py-2 px-2 sm:px-3 bg-white ">
                    <item.icon size={16} strokeWidth={1.5} className="text-gray-900 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <span className="font-medium text-gray-900 text-[13px] sm:text-[14px]">{item.label}</span>
                      <span className="text-gray-400 hidden sm:inline"> — </span>
                      <span className="text-gray-500 text-[12px] sm:text-[14px] block sm:inline mt-0.5 sm:mt-0">{item.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <div className="mt-3 space-y-3">
            <Card padding="sm" className="bg-gray-50 border-gray-100">
              <div className="text-[14px] text-gray-600">
                <div className="flex items-center gap-2 mb-3">
                  <Shield size={14} strokeWidth={1.5} className="text-gray-900" />
                  <p className="font-medium text-gray-900">Who can see what?</p>
                </div>
                <div className="space-y-1.5">
                  {[
                    { role: "Admin / HR", access: "Full access to all individual and cycle reports", variant: "success" as const },
                    { role: "Managers", access: "Cannot view reports — only Admin/HR can access and share", variant: "warning" as const },
                    { role: "Employees", access: "Cannot view their own report — Admin/HR decides what to share", variant: "info" as const },
                    { role: "Platform Owner", access: "Zero access to evaluation data — encrypted at rest", variant: "default" as const },
                  ].map((r, i) => (
                    <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 py-2 sm:py-1.5 px-3 bg-white  text-[13px] min-w-0">
                      <Badge variant={r.variant}>{r.role}</Badge>
                      <span className="text-gray-500 text-[12px] sm:text-[13px]">{r.access}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <TipBox>
              Reports can be exported as <strong>PDFs</strong> for sharing during one-on-one reviews.
              Admin/HR controls exactly who sees what — the platform never automatically shares reports
              with the employee or their manager.
            </TipBox>
          </div>
        </StepCard>
      </div>
    </Card>
  );
}

function OrgPatternsSection() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2.5  bg-gray-100">
            <Lightbulb size={20} strokeWidth={1.5} className="text-gray-900" />
          </div>
          <div>
            <CardTitle>Common Organizational Patterns</CardTitle>
            <CardDescription>
              How different company structures map to Performs360 teams
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <div className="mt-4 space-y-4">
        <div className="p-3 sm:p-4 border border-gray-100 ">
          <h4 className="text-headline text-gray-900 mb-1">Flat Organization</h4>
          <p className="text-callout text-gray-500 mb-3">
            Small startups with minimal hierarchy. One founder/CEO manages everyone.
          </p>
          <div className="font-mono text-[11px] sm:text-[13px] text-gray-600 bg-gray-50  p-2.5 sm:p-4 leading-relaxed whitespace-pre overflow-x-auto">{`CEO / Founder
├── Engineer 1      (Member)
├── Engineer 2      (Member)
├── Designer        (Member)
└── Marketing Lead  (Member)`}</div>
          <p className="text-caption mt-3">
            Create a single team. CEO is Manager, everyone else is Member.
          </p>
        </div>

        <div className="p-3 sm:p-4 border border-gray-100 ">
          <h4 className="text-headline text-gray-900 mb-1">Matrix Organization</h4>
          <p className="text-callout text-gray-500 mb-3">
            Employees report to both a functional manager and a project lead.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="font-mono text-[11px] sm:text-[13px] text-gray-600 bg-gray-50  p-2.5 sm:p-4 leading-relaxed whitespace-pre overflow-x-auto">{`Team: "Project Alpha"
├── Project Lead  (Manager)
├── Engineer A    (Member)
├── Designer B    (Member)
└── QA Tester C   (Member)`}</div>
            <div className="font-mono text-[11px] sm:text-[13px] text-gray-600 bg-gray-50  p-2.5 sm:p-4 leading-relaxed whitespace-pre overflow-x-auto">{`Team: "Engineering Dept"
├── VP Engineering (Manager)
├── Engineer A     (Member)
├── Engineer C     (Member)
└── Engineer D     (Member)`}</div>
          </div>
          <p className="text-caption mt-3">
            Create separate teams for each reporting line. Engineer A appears in both teams
            with different managers, getting feedback from both perspectives.
          </p>
        </div>

        <div className="p-3 sm:p-4 border border-gray-100 ">
          <h4 className="text-headline text-gray-900 mb-1">Co-Managed Team</h4>
          <p className="text-callout text-gray-500 mb-3">
            Two managers share responsibility for the same team (common in agencies and large enterprises).
          </p>
          <div className="font-mono text-[11px] sm:text-[13px] text-gray-600 bg-gray-50  p-2.5 sm:p-4 leading-relaxed whitespace-pre overflow-x-auto">{`Team: "Design Studio"
├── Creative Director   (Manager)
├── Art Director        (Manager)
├── Senior Designer 1   (Member)  [D-2]
├── Senior Designer 2   (Member)  [D-2]
├── Junior Designer 1   (Member)  [D-1]
└── Junior Designer 2   (Member)  [D-1]`}</div>
          <p className="text-caption mt-3">
            Performs360 supports multiple managers per team. Both managers evaluate all members,
            and reports show aggregated scores from each manager. With <strong>levels</strong> assigned
            (D-1, D-2), admins can use advanced mode to give junior and senior designers different
            evaluation templates.
          </p>
        </div>

        <div className="p-3 sm:p-4 border border-gray-100 ">
          <h4 className="text-headline text-gray-900 mb-1">Cross-Functional Squad</h4>
          <p className="text-callout text-gray-500 mb-3">
            Members from different departments working on the same product. All non-managers are Members and automatically evaluate each other as peers.
          </p>
          <div className="font-mono text-[11px] sm:text-[13px] text-gray-600 bg-gray-50  p-2.5 sm:p-4 leading-relaxed whitespace-pre overflow-x-auto">{`Team: "Growth Squad"
├── Product Manager     (Manager)
├── Backend Engineer    (Member)
├── Frontend Engineer   (Member)
├── Designer            (Member)
├── Data Analyst        (Member)
└── Marketing Specialist(Member)`}</div>
          <p className="text-caption mt-3">
            All Members automatically evaluate each other as peers. The Product Manager evaluates
            everyone (downward), and everyone evaluates the Product Manager (upward).
          </p>
        </div>

        <div className="p-3 sm:p-4 border border-gray-200 ">
          <h4 className="text-headline text-gray-900 mb-1">External Evaluator</h4>
          <p className="text-callout text-gray-500 mb-3">
            Clients, board members, or consultants who provide one-way feedback on team members without being evaluated back.
          </p>
          <div className="font-mono text-[11px] sm:text-[13px] text-gray-600 bg-gray-50  p-2.5 sm:p-4 leading-relaxed whitespace-pre overflow-x-auto">{`Team: "Platform Team"
├── Tech Lead          (Manager)  [SA L-3]
├── Senior Engineer    (Member)   [SE L-2]
├── Engineer           (Member)   [SE L-1]
├── Junior Engineer    (Member)   [SE L-1]
└── Client Stakeholder (External)`}</div>
          <p className="text-caption mt-3">
            The External evaluator provides feedback on all Managers and Members. Nobody evaluates
            the External back &mdash; no peer reviews, no upward feedback, no self-assessment.
            This is ideal for getting outside perspectives without adding evaluation burden.
          </p>
        </div>
      </div>
    </Card>
  );
}

// ─── Section Content Map ───

const sectionComponents: Record<SectionId, (props: { onNavigate?: (id: SectionId) => void }) => React.JSX.Element> = {
  "how-360-works": How360WorksSection,
  "roles": RolesSection,
  "example-org": ExampleOrgSection,
  "creating-teams": CreatingTeamsSection,
  "running-cycles": RunningCyclesSection,
  "reports": ReportsSection,
  "org-patterns": OrgPatternsSection,
};

// ─── Page ───

export default function GuidePage() {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<SectionId>("how-360-works");

  const ActiveContent = sectionComponents[activeSection];
  const contentRef = useRef<HTMLDivElement>(null);
  const handleNavigate = (id: SectionId) => {
    setActiveSection(id);
    contentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-white">

      {/* Header */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-900 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto h-14 flex items-center">
          <button
            onClick={() => window.history.length > 1 ? router.back() : router.push("/overview")}
            className="flex items-center gap-2 text-[14px] font-medium uppercase tracking-caps text-gray-500 hover:text-gray-900"
          >
            <ArrowLeft size={18} strokeWidth={1.5} />
            <span>Back</span>
          </button>
        </div>
      </div>

      {/* Mobile Tab Bar */}
      <div className="md:hidden sticky top-14 z-40 bg-white border-b border-gray-100 px-3 sm:px-4 py-2">
        <div className="flex gap-1 overflow-x-auto no-scrollbar -mx-1 px-1 snap-x snap-mandatory">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <button
                key={section.id}
                onClick={() => handleNavigate(section.id)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-[12px] sm:text-[13px] font-medium whitespace-nowrap snap-start shrink-0",
                  activeSection === section.id
                    ? "bg-white text-gray-900 border-b-2 border-gray-900"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                <Icon size={14} strokeWidth={1.5} />
                {section.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Layout */}
      <div className="max-w-6xl mx-auto px-3 sm:px-6 pb-16 sm:pb-20">
        <div className="flex gap-8 items-start">
          {/* Sidebar — desktop only */}
          <nav className="hidden md:block w-48 shrink-0 pt-12">
            <div className="sticky top-24 space-y-1">
              {sections.map((section) => {
                const Icon = section.icon;
                return (
                  <button
                    key={section.id}
                    onClick={() => handleNavigate(section.id)}
                    className={cn(
                      "flex items-center gap-3 w-full px-3 py-2.5 text-[14px] font-medium text-left",
                      activeSection === section.id
                        ? "bg-white text-gray-900 border-l-2 border-gray-900"
                        : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                    )}
                  >
                    <Icon size={18} strokeWidth={1.5} />
                    {section.label}
                  </button>
                );
              })}

              <div className="border-t border-gray-100 mt-4 pt-4">
                <Button variant="primary" size="sm" className="w-full" asChild>
                  <Link href="/login">Get Started</Link>
                </Button>
              </div>
            </div>
          </nav>

          {/* Content Area */}
          <div className="flex-1 min-w-0">
            {/* Hero Header */}
            <div ref={contentRef} className="pt-4 md:pt-12 pb-4 md:pb-8 scroll-mt-20">
              <h1 className="text-display-small text-gray-900">Setup Guide</h1>
              <div className="w-12 h-[2px] bg-accent-500 mt-4" />
              <p className="text-body text-gray-500 mt-4 sm:mt-4 max-w-2xl">
                Learn how to structure your organization and set up teams for 360° evaluations.
                Follow along with our TechCorp example to see exactly how it works.
              </p>
            </div>

            <ActiveContent onNavigate={handleNavigate} />
          </div>
        </div>
      </div>

    </div>
  );
}
