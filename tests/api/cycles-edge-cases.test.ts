import { describe, it } from "vitest";

// Weights now live on EvaluationTemplate (validated by directionWeightsSchema
// in src/lib/template-schema.ts), not on cycles. The weight-validation tests
// in this file no longer apply; equivalent coverage belongs at the
// template POST/PATCH level (tracked separately).
describe.skip("cycles weight-validation — moved to template schema", () => {
  it("placeholder", () => {});
});
