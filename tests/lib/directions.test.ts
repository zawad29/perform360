import { describe, expect, it } from "vitest";
import {
  getDirectionMetaForTemplatePreview,
  getDirectionMetaForSubjectRole,
  getDirectionsForSubjectRole,
} from "@/lib/directions";

describe("direction helpers", () => {
  it("returns the expected feedback directions for member subjects", () => {
    expect(getDirectionsForSubjectRole("MEMBER")).toEqual([
      "DOWNWARD",
      "LATERAL",
      "SELF",
      "EXTERNAL",
    ]);
  });

  it("returns the expected feedback directions for manager subjects", () => {
    expect(getDirectionsForSubjectRole("MANAGER")).toEqual([
      "UPWARD",
      "LATERAL",
      "SELF",
      "EXTERNAL",
    ]);
  });

  it("keeps subject-role filtering when an availability subset is provided", () => {
    expect(
      getDirectionMetaForSubjectRole("MEMBER", [
        "DOWNWARD",
        "UPWARD",
        "SELF",
      ]).map((direction) => direction.key)
    ).toEqual(["DOWNWARD", "SELF"]);
  });

  it("returns only the external direction for external reviewer preview", () => {
    expect(
      getDirectionMetaForTemplatePreview("EXTERNAL_REVIEWER").map((direction) => direction.key)
    ).toEqual(["EXTERNAL"]);
  });
});
