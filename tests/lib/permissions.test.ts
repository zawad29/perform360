import { describe, it, expect } from "vitest";
import {
  hasPermission,
  canViewReports,
  canManageCycles,
  canManageTeams,
  canManageTemplates,
  canManagePeople,
  canManageSettings,
  canManageEncryption,
  isAdminOrHR,
} from "@/lib/permissions";

describe("permissions", () => {
  describe("hasPermission", () => {
    it("ADMIN has all permissions", () => {
      expect(hasPermission("ADMIN", "cycles:create")).toBe(true);
      expect(hasPermission("ADMIN", "settings:manage")).toBe(true);
      expect(hasPermission("ADMIN", "encryption:manage")).toBe(true);
      expect(hasPermission("ADMIN", "people:manage")).toBe(true);
    });

    it("HR has most permissions but not settings or encryption", () => {
      expect(hasPermission("HR", "cycles:create")).toBe(true);
      expect(hasPermission("HR", "people:manage")).toBe(true);
      expect(hasPermission("HR", "reports:view")).toBe(true);
      expect(hasPermission("HR", "settings:manage")).toBe(false);
      expect(hasPermission("HR", "encryption:manage")).toBe(false);
    });

    it("MEMBER has no permissions", () => {
      expect(hasPermission("MEMBER", "cycles:create")).toBe(false);
      expect(hasPermission("MEMBER", "teams:create")).toBe(false);
      expect(hasPermission("MEMBER", "reports:view")).toBe(false);
    });

    it("EXTERNAL has no permissions", () => {
      expect(hasPermission("EXTERNAL", "cycles:create")).toBe(false);
      expect(hasPermission("EXTERNAL", "teams:create")).toBe(false);
      expect(hasPermission("EXTERNAL", "reports:view")).toBe(false);
      expect(hasPermission("EXTERNAL", "settings:manage")).toBe(false);
      expect(hasPermission("EXTERNAL", "encryption:manage")).toBe(false);
    });
  });

  describe("role-specific helpers", () => {
    it("canViewReports: ADMIN and HR only", () => {
      expect(canViewReports("ADMIN")).toBe(true);
      expect(canViewReports("HR")).toBe(true);
      expect(canViewReports("MEMBER")).toBe(false);
    });

    it("canManageCycles: ADMIN and HR only", () => {
      expect(canManageCycles("ADMIN")).toBe(true);
      expect(canManageCycles("HR")).toBe(true);
      expect(canManageCycles("MEMBER")).toBe(false);
    });

    it("canManageTeams: ADMIN and HR only", () => {
      expect(canManageTeams("ADMIN")).toBe(true);
      expect(canManageTeams("HR")).toBe(true);
      expect(canManageTeams("MEMBER")).toBe(false);
    });

    it("canManageTemplates: ADMIN and HR only", () => {
      expect(canManageTemplates("ADMIN")).toBe(true);
      expect(canManageTemplates("HR")).toBe(true);
      expect(canManageTemplates("MEMBER")).toBe(false);
    });

    it("canManagePeople: ADMIN and HR only", () => {
      expect(canManagePeople("ADMIN")).toBe(true);
      expect(canManagePeople("HR")).toBe(true);
      expect(canManagePeople("MEMBER")).toBe(false);
    });

    it("canManageSettings: ADMIN only", () => {
      expect(canManageSettings("ADMIN")).toBe(true);
      expect(canManageSettings("HR")).toBe(false);
      expect(canManageSettings("MEMBER")).toBe(false);
    });

    it("canManageEncryption: ADMIN only", () => {
      expect(canManageEncryption("ADMIN")).toBe(true);
      expect(canManageEncryption("HR")).toBe(false);
      expect(canManageEncryption("MEMBER")).toBe(false);
    });

    it("isAdminOrHR: ADMIN and HR only", () => {
      expect(isAdminOrHR("ADMIN")).toBe(true);
      expect(isAdminOrHR("HR")).toBe(true);
      expect(isAdminOrHR("MEMBER")).toBe(false);
      expect(isAdminOrHR("EXTERNAL")).toBe(false);
    });
  });
});
