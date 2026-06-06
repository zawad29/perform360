import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/hooks/use-current-user", () => ({
  useCurrentUser: vi.fn(),
}));

import { useCurrentUser } from "@/hooks/use-current-user";
import { usePermissions } from "@/hooks/use-permissions";

function mockRole(role: string | undefined) {
  vi.mocked(useCurrentUser).mockReturnValue({
    user: role ? ({ role } as Record<string, unknown>) : null,
    isLoading: false,
    isAuthenticated: !!role,
  } as ReturnType<typeof useCurrentUser>);
}

describe("usePermissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ADMIN has all permissions", () => {
    mockRole("ADMIN");
    const p = usePermissions();

    expect(p.role).toBe("ADMIN");
    expect(p.isAdmin).toBe(true);
    expect(p.isHR).toBe(false);
    expect(p.isAdminOrHR).toBe(true);
    expect(p.canViewReports).toBe(true);
    expect(p.canManageCycles).toBe(true);
    expect(p.canManageTeams).toBe(true);
    expect(p.canManageTemplates).toBe(true);
    expect(p.canManagePeople).toBe(true);
    expect(p.canManageSettings).toBe(true);
    expect(p.canManageEncryption).toBe(true);
  });

  it("HR has most permissions but not settings or encryption", () => {
    mockRole("HR");
    const p = usePermissions();

    expect(p.role).toBe("HR");
    expect(p.isHR).toBe(true);
    expect(p.isAdminOrHR).toBe(true);
    expect(p.canViewReports).toBe(true);
    expect(p.canManageCycles).toBe(true);
    expect(p.canManageTeams).toBe(true);
    expect(p.canManageTemplates).toBe(true);
    expect(p.canManagePeople).toBe(true);
    expect(p.canManageSettings).toBe(false);
    expect(p.canManageEncryption).toBe(false);
  });

  it("MEMBER has no management permissions", () => {
    mockRole("MEMBER");
    const p = usePermissions();

    expect(p.role).toBe("MEMBER");
    expect(p.isEmployee).toBe(true);
    expect(p.isAdminOrHR).toBe(false);
    expect(p.canViewReports).toBe(false);
    expect(p.canManageCycles).toBe(false);
    expect(p.canManageTeams).toBe(false);
    expect(p.canManageTemplates).toBe(false);
    expect(p.canManagePeople).toBe(false);
    expect(p.canManageSettings).toBe(false);
    expect(p.canManageEncryption).toBe(false);
  });

  it("EXTERNAL has no management permissions", () => {
    mockRole("EXTERNAL");
    const p = usePermissions();

    expect(p.role).toBe("EXTERNAL");
    expect(p.isExternal).toBe(true);
    expect(p.isAdminOrHR).toBe(false);
    expect(p.canViewReports).toBe(false);
    expect(p.canManageCycles).toBe(false);
    expect(p.canManageSettings).toBe(false);
  });

  it("no user returns undefined role and all permissions false", () => {
    mockRole(undefined);
    const p = usePermissions();

    expect(p.role).toBeUndefined();
    expect(p.isAdmin).toBe(false);
    expect(p.isHR).toBe(false);
    expect(p.isEmployee).toBe(false);
    expect(p.isExternal).toBe(false);
    expect(p.isAdminOrHR).toBe(false);
    expect(p.canViewReports).toBe(false);
    expect(p.canManageCycles).toBe(false);
    expect(p.canManageTeams).toBe(false);
    expect(p.canManageTemplates).toBe(false);
    expect(p.canManagePeople).toBe(false);
    expect(p.canManageSettings).toBe(false);
    expect(p.canManageEncryption).toBe(false);
  });
});
