export interface TeamMemberOption {
  id: string;
  userId: string;
  designationId: string | null;
  designation: { id: string; name: string } | null;
  user: { id: string; name: string };
  role: "MANAGER" | "MEMBER" | "EXTERNAL" | "IMPERSONATOR";
}

export interface TeamOption {
  id: string;
  name: string;
  members: TeamMemberOption[];
}

import type { Direction, DirectionWeights } from "@/lib/directions";
import type { TemplateApplicableRole } from "@/lib/template-routing";

export interface TemplateOptionSection {
  id: string;
  title: string;
  description?: string;
  directions?: Direction[];
  questions: unknown[];
}

export interface TemplateOption {
  id: string;
  name: string;
  description?: string | null;
  isGlobal: boolean;
  designationIds: string[];
  // Which team-role this template serves; drives role-aware routing/coverage.
  appliesToRole: TemplateApplicableRole;
  // Surfaced from /api/templates so the wizard can render the routing matrix
  // and full preview without an extra fetch round-trip.
  sections: TemplateOptionSection[];
  weightsMember: DirectionWeights | null;
  weightsManager: DirectionWeights | null;
}

export interface AssignmentGroup {
  teamIds: string[];
  templateIds: string[];
}

export interface CoverageGapMember {
  userId: string;
  name: string;
  designationName: string | null;
}

export interface CoverageGapTeam {
  teamId: string;
  teamName: string;
  members: CoverageGapMember[];
}
