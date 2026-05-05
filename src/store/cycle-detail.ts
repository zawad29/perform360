import { create } from "zustand";
import type { Direction } from "@/lib/directions";

// ─── Types ───

interface Assignment {
  id: string;
  subject: string;
  reviewer: string;
  direction: Direction;
  status: "SUBMITTED" | "IN_PROGRESS" | "PENDING";
}

interface IndividualSummary {
  id: string;
  name: string;
  avgScore: number;
  reviewCount: number;
  completedCount: number;
}

interface CycleData {
  id: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "CLOSED" | "ARCHIVED";
  template: string;
  startDate: string;
  endDate: string;
  totalAssignments: number;
  completedAssignments: number;
  pendingAssignments: number;
  inProgressAssignments: number;
  completionRate: number;
}

type ActiveTab = "assignments" | "reports";
type AssignmentFilter = "all" | "pending" | "completed";

interface CycleDetailState {
  cycle: CycleData | null;
  assignments: Assignment[];
  individuals: IndividualSummary[];
  activeTab: ActiveTab;
  assignmentFilter: AssignmentFilter;
  avgScore: number;
  isLoading: boolean;

  // Actions
  setCycle: (cycle: CycleData) => void;
  setAssignments: (assignments: Assignment[]) => void;
  setIndividuals: (individuals: IndividualSummary[]) => void;
  setActiveTab: (tab: ActiveTab) => void;
  setAssignmentFilter: (filter: AssignmentFilter) => void;
  setLoading: (loading: boolean) => void;
  filteredAssignments: () => Assignment[];
  reset: () => void;
}

// ─── Store ───

export const useCycleDetail = create<CycleDetailState>((set, get) => ({
  cycle: null,
  assignments: [],
  individuals: [],
  activeTab: "assignments",
  assignmentFilter: "all",
  avgScore: 0,
  isLoading: false,

  setCycle: (cycle) => set({ cycle }),

  setAssignments: (assignments) => set({ assignments }),

  setIndividuals: (individuals) => {
    const total = individuals.reduce((sum, i) => sum + i.avgScore, 0);
    const avg = individuals.length > 0 ? total / individuals.length : 0;
    set({ individuals, avgScore: parseFloat(avg.toFixed(2)) });
  },

  setActiveTab: (tab) => set({ activeTab: tab }),

  setAssignmentFilter: (filter) => set({ assignmentFilter: filter }),

  setLoading: (loading) => set({ isLoading: loading }),

  filteredAssignments: () => {
    const { assignments, assignmentFilter } = get();
    switch (assignmentFilter) {
      case "pending":
        return assignments.filter((a) => a.status === "PENDING" || a.status === "IN_PROGRESS");
      case "completed":
        return assignments.filter((a) => a.status === "SUBMITTED");
      default:
        return assignments;
    }
  },

  reset: () =>
    set({
      cycle: null,
      assignments: [],
      individuals: [],
      activeTab: "assignments",
      assignmentFilter: "all",
      avgScore: 0,
      isLoading: false,
    }),
}));
