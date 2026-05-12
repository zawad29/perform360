import { describe, expect, it } from "vitest";
import { isCycleSubjectRole, isReviewerOnlyRole } from "@/lib/cycle-subjects";

describe("cycle subject role helpers", () => {
  it("treats only managers and members as cycle subjects", () => {
    expect(isCycleSubjectRole("MANAGER")).toBe(true);
    expect(isCycleSubjectRole("MEMBER")).toBe(true);
    expect(isCycleSubjectRole("EXTERNAL")).toBe(false);
    expect(isCycleSubjectRole("IMPERSONATOR")).toBe(false);
  });

  it("treats externals and impersonators as reviewer-only roles", () => {
    expect(isReviewerOnlyRole("EXTERNAL")).toBe(true);
    expect(isReviewerOnlyRole("IMPERSONATOR")).toBe(true);
    expect(isReviewerOnlyRole("MANAGER")).toBe(false);
    expect(isReviewerOnlyRole("MEMBER")).toBe(false);
  });
});
