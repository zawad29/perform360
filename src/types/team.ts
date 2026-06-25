import type { Direction } from "@/lib/directions";

export interface TeamWithMembers {
  id: string;
  name: string;
  description: string | null;
  companyId: string;
  createdAt: Date;
  members: TeamMemberWithUser[];
  _count?: {
    members: number;
  };
}

export interface TeamMemberWithUser {
  id: string;
  userId: string;
  teamId: string;
  role: "MANAGER" | "MEMBER" | "EXTERNAL" | "IMPERSONATOR";
  designationId: string | null;
  impersonatorDirections: Direction[];
  designation: { id: string; name: string } | null;
  user: {
    id: string;
    email: string;
    name: string;
    avatar: string | null;
    role: "ADMIN" | "HR" | "MEMBER" | "EXTERNAL";
  };
}
