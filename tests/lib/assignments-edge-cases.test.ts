import { describe, it, expect, vi } from "vitest";
import { generateAssignmentsFromTeams } from "@/lib/assignments";
import { buildTemplatesMap } from "../helpers/template-meta";

vi.mock("@/lib/tokens", () => {
  let counter = 0;
  return {
    generateToken: () => `tok-edge-${counter++}`,
  };
});

const cycleId = "cycle-edge-1";

describe("generateAssignmentsFromTeams — edge cases", () => {
  it("team with only managers, no members", () => {
    const teams = [{
      id: "t1",
      members: [
        { userId: "mgr-1", role: "MANAGER" as const, designationId: null },
        { userId: "mgr-2", role: "MANAGER" as const, designationId: null },
      ],
    }];
    const templateMap = buildTemplatesMap({ "t1": "tpl-1" });
    const assignments = generateAssignmentsFromTeams(cycleId, teams, templateMap);

    // Manager-to-manager peer assignments: 2 managers * 1 other = 2
    const peers = assignments.filter((a) => a.direction === "LATERAL");
    expect(peers).toHaveLength(2);

    // No manager->member assignments (no members to evaluate)
    const managerEvals = assignments.filter((a) => a.direction === "DOWNWARD");
    expect(managerEvals).toHaveLength(0);

    // No direct_report assignments (no members to evaluate managers)
    const directReports = assignments.filter((a) => a.direction === "UPWARD");
    expect(directReports).toHaveLength(0);

    // Self-evaluations for both managers
    const selfEvals = assignments.filter((a) => a.direction === "SELF");
    expect(selfEvals).toHaveLength(2);
  });

  it("team with only members, no manager", () => {
    const teams = [{
      id: "t1",
      members: [
        { userId: "mem-1", role: "MEMBER" as const, designationId: null },
        { userId: "mem-2", role: "MEMBER" as const, designationId: null },
        { userId: "mem-3", role: "MEMBER" as const, designationId: null },
      ],
    }];
    const templateMap = buildTemplatesMap({ "t1": "tpl-1" });
    const assignments = generateAssignmentsFromTeams(cycleId, teams, templateMap);

    // Peer assignments: 3 * 2 = 6
    const peers = assignments.filter((a) => a.direction === "LATERAL");
    expect(peers).toHaveLength(6);

    // No manager/direct_report assignments
    expect(assignments.filter((a) => a.direction === "DOWNWARD")).toHaveLength(0);
    expect(assignments.filter((a) => a.direction === "UPWARD")).toHaveLength(0);

    // Self-evaluations for all 3
    expect(assignments.filter((a) => a.direction === "SELF")).toHaveLength(3);
  });

  it("team with only externals", () => {
    const teams = [{
      id: "t1",
      members: [
        { userId: "ext-1", role: "EXTERNAL" as const, designationId: null },
        { userId: "ext-2", role: "EXTERNAL" as const, designationId: null },
      ],
    }];
    const templateMap = buildTemplatesMap({ "t1": "tpl-1" });
    const assignments = generateAssignmentsFromTeams(cycleId, teams, templateMap);

    // External evaluates members+managers only — there are none
    // No self-evals for externals
    // No peer evals between externals
    expect(assignments).toHaveLength(0);
  });

  it("single-member team: no peer assignments, only self-eval", () => {
    const teams = [{
      id: "t1",
      members: [
        { userId: "mem-1", role: "MEMBER" as const, designationId: null },
      ],
    }];
    const templateMap = buildTemplatesMap({ "t1": "tpl-1" });
    const assignments = generateAssignmentsFromTeams(cycleId, teams, templateMap);

    expect(assignments.filter((a) => a.direction === "LATERAL")).toHaveLength(0);
    expect(assignments.filter((a) => a.direction === "SELF")).toHaveLength(1);
    expect(assignments).toHaveLength(1);
  });

  it("multiple managers evaluating same member pool", () => {
    const teams = [{
      id: "t1",
      members: [
        { userId: "mgr-1", role: "MANAGER" as const, designationId: null },
        { userId: "mgr-2", role: "MANAGER" as const, designationId: null },
        { userId: "mgr-3", role: "MANAGER" as const, designationId: null },
        { userId: "mem-1", role: "MEMBER" as const, designationId: null },
        { userId: "mem-2", role: "MEMBER" as const, designationId: null },
      ],
    }];
    const templateMap = buildTemplatesMap({ "t1": "tpl-1" });
    const assignments = generateAssignmentsFromTeams(cycleId, teams, templateMap);

    // Manager evaluates each member: 3 managers * 2 members = 6
    const managerEvals = assignments.filter((a) => a.direction === "DOWNWARD");
    expect(managerEvals).toHaveLength(6);

    // Member evaluates each manager: 2 members * 3 managers = 6
    const directReports = assignments.filter((a) => a.direction === "UPWARD");
    expect(directReports).toHaveLength(6);

    // Self-evals: 3 managers + 2 members = 5
    const selfEvals = assignments.filter((a) => a.direction === "SELF");
    expect(selfEvals).toHaveLength(5);
  });

  it("user in 3+ teams with different templates (no dedup)", () => {
    const teams = [
      { id: "t1", members: [{ userId: "user-1", role: "MEMBER" as const, designationId: null }, { userId: "user-2", role: "MEMBER" as const, designationId: null }] },
      { id: "t2", members: [{ userId: "user-1", role: "MEMBER" as const, designationId: null }, { userId: "user-3", role: "MEMBER" as const, designationId: null }] },
      { id: "t3", members: [{ userId: "user-1", role: "MEMBER" as const, designationId: null }, { userId: "user-4", role: "MEMBER" as const, designationId: null }] },
    ];
    const templateMap = buildTemplatesMap({
      t1: "tpl-1",
      t2: "tpl-2",
      t3: "tpl-3",
    });
    const assignments = generateAssignmentsFromTeams(cycleId, teams, templateMap);

    // user-1 gets self-eval per template: 3
    const user1Self = assignments.filter((a) => a.direction === "SELF" && a.subjectId === "user-1");
    expect(user1Self).toHaveLength(3);

    // Peer assignments involving user-1: user-1->user-2(tpl1), user-2->user-1(tpl1),
    // user-1->user-3(tpl2), user-3->user-1(tpl2), user-1->user-4(tpl3), user-4->user-1(tpl3) = 6
    const user1Peers = assignments.filter(
      (a) => a.direction === "LATERAL" && (a.reviewerId === "user-1" || a.subjectId === "user-1")
    );
    expect(user1Peers).toHaveLength(6);
  });

  it("user in 3+ teams with same template (dedup)", () => {
    const teams = [
      { id: "t1", members: [{ userId: "user-1", role: "MEMBER" as const, designationId: null }, { userId: "user-2", role: "MEMBER" as const, designationId: null }] },
      { id: "t2", members: [{ userId: "user-1", role: "MEMBER" as const, designationId: null }, { userId: "user-2", role: "MEMBER" as const, designationId: null }] },
      { id: "t3", members: [{ userId: "user-1", role: "MEMBER" as const, designationId: null }, { userId: "user-2", role: "MEMBER" as const, designationId: null }] },
    ];
    const templateMap = buildTemplatesMap({
      t1: "tpl-1",
      t2: "tpl-1",
      t3: "tpl-1",
    });
    const assignments = generateAssignmentsFromTeams(cycleId, teams, templateMap);

    // Only 2 peer assignments (deduped)
    const peers = assignments.filter((a) => a.direction === "LATERAL");
    expect(peers).toHaveLength(2);

    // Only 2 self-evals (deduped)
    const selfEvals = assignments.filter((a) => a.direction === "SELF");
    expect(selfEvals).toHaveLength(2);
  });

  it("large team: n*(n-1) peer assignments for n members", () => {
    const n = 10;
    const members = Array.from({ length: n }, (_, i) => ({
      userId: `mem-${i}`,
      role: "MEMBER" as const,
      designationId: null,
    }));
    const teams = [{ id: "t1", members }];
    const templateMap = buildTemplatesMap({ "t1": "tpl-1" });
    const assignments = generateAssignmentsFromTeams(cycleId, teams, templateMap);

    const peers = assignments.filter((a) => a.direction === "LATERAL");
    expect(peers).toHaveLength(n * (n - 1)); // 90

    const selfEvals = assignments.filter((a) => a.direction === "SELF");
    expect(selfEvals).toHaveLength(n);
  });

  // ── Issue 4: Manager-to-manager peer reviews ──

  it("manager-to-manager peer assignments: 3 managers = 6 peers", () => {
    const teams = [{
      id: "t1",
      members: [
        { userId: "mgr-1", role: "MANAGER" as const, designationId: null },
        { userId: "mgr-2", role: "MANAGER" as const, designationId: null },
        { userId: "mgr-3", role: "MANAGER" as const, designationId: null },
        { userId: "mem-1", role: "MEMBER" as const, designationId: null },
      ],
    }];
    const templateMap = buildTemplatesMap({ "t1": "tpl-1" });
    const assignments = generateAssignmentsFromTeams(cycleId, teams, templateMap);

    // Manager-to-manager: 3 * 2 = 6
    const mgrPeers = assignments.filter(
      (a) => a.direction === "LATERAL" &&
        ["mgr-1", "mgr-2", "mgr-3"].includes(a.reviewerId) &&
        ["mgr-1", "mgr-2", "mgr-3"].includes(a.subjectId)
    );
    expect(mgrPeers).toHaveLength(6);

    // No manager-member cross-peer (members only peer members, managers only peer managers)
    const crossPeers = assignments.filter(
      (a) => a.direction === "LATERAL" &&
        (["mgr-1", "mgr-2", "mgr-3"].includes(a.reviewerId) && a.subjectId === "mem-1" ||
         a.reviewerId === "mem-1" && ["mgr-1", "mgr-2", "mgr-3"].includes(a.subjectId))
    );
    expect(crossPeers).toHaveLength(0);
  });

  // ── Issue 3: Impersonator self is always ignored ──

  it("impersonator with only self: all normal assignments generate", () => {
    const teams = [{
      id: "t1",
      members: [
        { userId: "mgr-1", role: "MANAGER" as const, designationId: null },
        { userId: "mem-1", role: "MEMBER" as const, designationId: null },
        { userId: "mem-2", role: "MEMBER" as const, designationId: null },
        { userId: "imp-1", role: "IMPERSONATOR" as const, designationId: null, impersonatorDirections: ["SELF"] },
      ],
    }];
    const templateMap = buildTemplatesMap({ "t1": "tpl-1" });
    const assignments = generateAssignmentsFromTeams(cycleId, teams, templateMap);

    // All normal relationships generate (self is ignored for impersonator)
    expect(assignments.filter((a) => a.direction === "DOWNWARD")).toHaveLength(2);
    expect(assignments.filter((a) => a.direction === "UPWARD")).toHaveLength(2);
    expect(assignments.filter((a) => a.direction === "LATERAL")).toHaveLength(2);
    expect(assignments.filter((a) => a.direction === "SELF")).toHaveLength(3);

    // No impersonator assignments at all
    const impAssignments = assignments.filter((a) => a.reviewerId === "imp-1");
    expect(impAssignments).toHaveLength(0);
  });

  it("team with all roles: managers, members, and externals", () => {
    const teams = [{
      id: "t1",
      members: [
        { userId: "mgr-1", role: "MANAGER" as const, designationId: null },
        { userId: "mem-1", role: "MEMBER" as const, designationId: null },
        { userId: "mem-2", role: "MEMBER" as const, designationId: null },
        { userId: "ext-1", role: "EXTERNAL" as const, designationId: null },
        { userId: "ext-2", role: "EXTERNAL" as const, designationId: null },
      ],
    }];
    const templateMap = buildTemplatesMap({ "t1": "tpl-1" });
    const assignments = generateAssignmentsFromTeams(cycleId, teams, templateMap);

    // Manager->member: 1*2 = 2
    expect(assignments.filter((a) => a.direction === "DOWNWARD")).toHaveLength(2);
    // Member->manager: 2*1 = 2
    expect(assignments.filter((a) => a.direction === "UPWARD")).toHaveLength(2);
    // Peer: 2*1 = 2 (only members peer each other)
    expect(assignments.filter((a) => a.direction === "LATERAL")).toHaveLength(2);
    // External->members+managers: 2 externals * (2 members + 1 manager) = 6
    expect(assignments.filter((a) => a.direction === "EXTERNAL")).toHaveLength(6);
    // Self: 1 manager + 2 members = 3 (externals don't self-evaluate)
    expect(assignments.filter((a) => a.direction === "SELF")).toHaveLength(3);

    // No one evaluates externals as subjects
    const externalSubjects = assignments.filter((a) => a.subjectId === "ext-1" || a.subjectId === "ext-2");
    expect(externalSubjects).toHaveLength(0);
  });
});
