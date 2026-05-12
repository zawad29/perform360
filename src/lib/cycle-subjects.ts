export type CycleParticipantRole =
  | "MANAGER"
  | "MEMBER"
  | "EXTERNAL"
  | "IMPERSONATOR";

export function isCycleSubjectRole(
  role: string
): role is Extract<CycleParticipantRole, "MANAGER" | "MEMBER"> {
  return role === "MANAGER" || role === "MEMBER";
}

export function isReviewerOnlyRole(
  role: string
): role is Extract<CycleParticipantRole, "EXTERNAL" | "IMPERSONATOR"> {
  return role === "EXTERNAL" || role === "IMPERSONATOR";
}
