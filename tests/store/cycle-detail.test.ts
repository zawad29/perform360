import { describe, it, expect, beforeEach } from "vitest";
import { useCycleDetail } from "@/store/cycle-detail";

describe("useCycleDetail store", () => {
  beforeEach(() => {
    useCycleDetail.getState().reset();
  });

  describe("initial state", () => {
    it("has correct default values", () => {
      const state = useCycleDetail.getState();
      expect(state.cycle).toBeNull();
      expect(state.assignments).toEqual([]);
      expect(state.individuals).toEqual([]);
      expect(state.activeTab).toBe("assignments");
      expect(state.assignmentFilter).toBe("all");
      expect(state.avgScore).toBe(0);
      expect(state.isLoading).toBe(false);
    });
  });

  describe("setCycle", () => {
    it("sets cycle data", () => {
      const cycle = {
        id: "c1",
        name: "Q1 Review",
        status: "ACTIVE" as const,
        template: "tpl-1",
        startDate: "2026-01-01",
        endDate: "2026-03-31",
        totalAssignments: 10,
        completedAssignments: 5,
        pendingAssignments: 3,
        inProgressAssignments: 2,
        completionRate: 50,
      };
      useCycleDetail.getState().setCycle(cycle);
      expect(useCycleDetail.getState().cycle).toEqual(cycle);
    });
  });

  describe("setAssignments", () => {
    it("sets assignments array", () => {
      const assignments = [
        { id: "a1", subject: "Alice", reviewer: "Bob", direction: "LATERAL" as const, status: "PENDING" as const },
        { id: "a2", subject: "Alice", reviewer: "Carol", direction: "DOWNWARD" as const, status: "SUBMITTED" as const },
      ];
      useCycleDetail.getState().setAssignments(assignments);
      expect(useCycleDetail.getState().assignments).toEqual(assignments);
    });
  });

  describe("setActiveTab", () => {
    it("sets active tab", () => {
      useCycleDetail.getState().setActiveTab("reports");
      expect(useCycleDetail.getState().activeTab).toBe("reports");
    });
  });

  describe("setLoading", () => {
    it("sets loading state", () => {
      useCycleDetail.getState().setLoading(true);
      expect(useCycleDetail.getState().isLoading).toBe(true);
    });
  });

  describe("setIndividuals", () => {
    it("computes avgScore correctly", () => {
      const individuals = [
        { id: "u1", name: "Alice", avgScore: 4.0, reviewCount: 5, completedCount: 3 },
        { id: "u2", name: "Bob", avgScore: 3.5, reviewCount: 4, completedCount: 4 },
        { id: "u3", name: "Carol", avgScore: 5.0, reviewCount: 3, completedCount: 3 },
      ];
      useCycleDetail.getState().setIndividuals(individuals);

      expect(useCycleDetail.getState().individuals).toEqual(individuals);
      // (4.0 + 3.5 + 5.0) / 3 = 4.166... → 4.17
      expect(useCycleDetail.getState().avgScore).toBe(4.17);
    });

    it("returns 0 for empty array", () => {
      useCycleDetail.getState().setIndividuals([]);
      expect(useCycleDetail.getState().avgScore).toBe(0);
      expect(useCycleDetail.getState().individuals).toEqual([]);
    });

    it("rounds to 2 decimal places", () => {
      const individuals = [
        { id: "u1", name: "Alice", avgScore: 3.333, reviewCount: 3, completedCount: 3 },
        { id: "u2", name: "Bob", avgScore: 3.333, reviewCount: 3, completedCount: 3 },
      ];
      useCycleDetail.getState().setIndividuals(individuals);
      // (3.333 + 3.333) / 2 = 3.333
      expect(useCycleDetail.getState().avgScore).toBe(3.33);
    });

    it("handles single individual", () => {
      const individuals = [
        { id: "u1", name: "Alice", avgScore: 4.75, reviewCount: 3, completedCount: 3 },
      ];
      useCycleDetail.getState().setIndividuals(individuals);
      expect(useCycleDetail.getState().avgScore).toBe(4.75);
    });
  });

  describe("filteredAssignments", () => {
    const assignments = [
      { id: "a1", subject: "Alice", reviewer: "Bob", direction: "LATERAL" as const, status: "PENDING" as const },
      { id: "a2", subject: "Alice", reviewer: "Carol", direction: "DOWNWARD" as const, status: "IN_PROGRESS" as const },
      { id: "a3", subject: "Bob", reviewer: "Alice", direction: "LATERAL" as const, status: "SUBMITTED" as const },
      { id: "a4", subject: "Carol", reviewer: "Alice", direction: "SELF" as const, status: "SUBMITTED" as const },
    ];

    beforeEach(() => {
      useCycleDetail.getState().setAssignments(assignments);
    });

    it("returns all assignments with filter 'all'", () => {
      useCycleDetail.getState().setAssignmentFilter("all");
      const filtered = useCycleDetail.getState().filteredAssignments();
      expect(filtered).toHaveLength(4);
    });

    it("returns PENDING and IN_PROGRESS with filter 'pending'", () => {
      useCycleDetail.getState().setAssignmentFilter("pending");
      const filtered = useCycleDetail.getState().filteredAssignments();
      expect(filtered).toHaveLength(2);
      expect(filtered.every((a) => a.status === "PENDING" || a.status === "IN_PROGRESS")).toBe(true);
    });

    it("returns only SUBMITTED with filter 'completed'", () => {
      useCycleDetail.getState().setAssignmentFilter("completed");
      const filtered = useCycleDetail.getState().filteredAssignments();
      expect(filtered).toHaveLength(2);
      expect(filtered.every((a) => a.status === "SUBMITTED")).toBe(true);
    });

    it("returns empty array when no assignments match filter", () => {
      useCycleDetail.getState().setAssignments([
        { id: "a1", subject: "Alice", reviewer: "Bob", direction: "LATERAL" as const, status: "SUBMITTED" as const },
      ]);
      useCycleDetail.getState().setAssignmentFilter("pending");
      const filtered = useCycleDetail.getState().filteredAssignments();
      expect(filtered).toHaveLength(0);
    });

    it("returns empty array when assignments is empty", () => {
      useCycleDetail.getState().setAssignments([]);
      useCycleDetail.getState().setAssignmentFilter("all");
      const filtered = useCycleDetail.getState().filteredAssignments();
      expect(filtered).toHaveLength(0);
    });
  });

  describe("reset", () => {
    it("restores all values to initial state", () => {
      const store = useCycleDetail.getState();
      store.setCycle({
        id: "c1", name: "Test", status: "ACTIVE",
        template: "t1", startDate: "2026-01-01", endDate: "2026-03-31",
        totalAssignments: 10, completedAssignments: 5,
        pendingAssignments: 3, inProgressAssignments: 2, completionRate: 50,
      });
      store.setAssignments([
        { id: "a1", subject: "Alice", reviewer: "Bob", direction: "LATERAL", status: "PENDING" },
      ]);
      store.setIndividuals([
        { id: "u1", name: "Alice", avgScore: 4.5, reviewCount: 3, completedCount: 3 },
      ]);
      store.setActiveTab("reports");
      store.setAssignmentFilter("completed");
      store.setLoading(true);

      store.reset();

      const state = useCycleDetail.getState();
      expect(state.cycle).toBeNull();
      expect(state.assignments).toEqual([]);
      expect(state.individuals).toEqual([]);
      expect(state.activeTab).toBe("assignments");
      expect(state.assignmentFilter).toBe("all");
      expect(state.avgScore).toBe(0);
      expect(state.isLoading).toBe(false);
    });
  });
});
