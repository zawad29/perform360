"use client";

import { useCurrentUser } from "./use-current-user";
import type { UserRole } from "@prisma/client";

export function usePermissions() {
  const { user } = useCurrentUser();

  // Default role from session - in a real app this would come from the user's company role
  const role = (user as Record<string, unknown> | null)?.role as UserRole | undefined;

  const isAdmin = role === "ADMIN";
  const isHR = role === "HR";
  const isEmployee = role === "MEMBER";
  const isExternal = role === "EXTERNAL";
  const isAdminOrHR = isAdmin || isHR;

  return {
    role,
    isAdmin,
    isHR,
    isEmployee,
    isExternal,
    isAdminOrHR,
    canViewReports: isAdminOrHR,
    canManageCycles: isAdminOrHR,
    canManageTeams: isAdminOrHR,
    canManageTemplates: isAdminOrHR,
    canManagePeople: isAdminOrHR,
    canManageSettings: isAdmin,
    canManageEncryption: isAdmin,
  };
}
