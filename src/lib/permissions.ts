import { UserRole } from "@prisma/client";

type Permission =
  | "cycles:create"
  | "cycles:manage"
  | "teams:create"
  | "teams:manage"
  | "templates:create"
  | "templates:manage"
  | "reports:view"
  | "reports:export"
  | "people:manage"
  | "settings:manage"
  | "encryption:manage";

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  ADMIN: [
    "cycles:create",
    "cycles:manage",
    "teams:create",
    "teams:manage",
    "templates:create",
    "templates:manage",
    "reports:view",
    "reports:export",
    "people:manage",
    "settings:manage",
    "encryption:manage",
  ],
  HR: [
    "cycles:create",
    "cycles:manage",
    "teams:create",
    "teams:manage",
    "templates:create",
    "templates:manage",
    "reports:view",
    "reports:export",
    "people:manage",
  ],
  MEMBER: [],
  EXTERNAL: [],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function canViewReports(role: UserRole): boolean {
  return role === "ADMIN" || role === "HR";
}

export function canManageCycles(role: UserRole): boolean {
  return role === "ADMIN" || role === "HR";
}

export function canManageTeams(role: UserRole): boolean {
  return role === "ADMIN" || role === "HR";
}

export function canManageTemplates(role: UserRole): boolean {
  return role === "ADMIN" || role === "HR";
}

export function canManagePeople(role: UserRole): boolean {
  return role === "ADMIN" || role === "HR";
}

export function canManageSettings(role: UserRole): boolean {
  return role === "ADMIN";
}

export function canManageEncryption(role: UserRole): boolean {
  return role === "ADMIN";
}

export function isAdminOrHR(role: UserRole): boolean {
  return role === "ADMIN" || role === "HR";
}
