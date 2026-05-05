import { describe, it, expect, vi } from "vitest";

// Unmock email to test actual template functions
vi.unmock("@/lib/email");

const {
  getOTPEmail,
  getMagicLinkEmail,
  getSummaryInviteEmail,
  getSummaryReminderEmail,
  getEvaluationInviteEmail,
  getEvaluationReminderEmail,
  getUserInviteEmail,
  getDataExportEmail,
} = await import("@/lib/email");

describe("Email Templates", () => {
  describe("getOTPEmail", () => {
    it("returns html containing the OTP code", () => {
      const { html } = getOTPEmail("123456", "Alice");
      expect(html).toContain("123456");
    });

    it("returns text containing the OTP code", () => {
      const { text } = getOTPEmail("654321", "Bob");
      expect(text).toContain("654321");
    });

    it("includes recipient name", () => {
      const { html, text } = getOTPEmail("111111", "Charlie");
      expect(html).toContain("Charlie");
      expect(text).toContain("Charlie");
    });

    it("returns both html and text keys", () => {
      const result = getOTPEmail("000000", "Test");
      expect(result).toHaveProperty("html");
      expect(result).toHaveProperty("text");
      expect(typeof result.html).toBe("string");
      expect(typeof result.text).toBe("string");
    });

    it("escapes HTML in recipient name", () => {
      const { html } = getOTPEmail("123456", '<script>alert("xss")</script>');
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
    });
  });

  describe("getMagicLinkEmail", () => {
    it("includes the URL in both html and text", () => {
      const { html, text } = getMagicLinkEmail("https://example.com/login?token=abc");
      expect(html).toContain("https://example.com/login?token=abc");
      expect(text).toContain("https://example.com/login?token=abc");
    });

    it("returns both html and text keys", () => {
      const result = getMagicLinkEmail("https://example.com");
      expect(result).toHaveProperty("html");
      expect(result).toHaveProperty("text");
    });
  });

  describe("getSummaryInviteEmail", () => {
    const assignments = [
      { subjectName: "Alice", direction: "Peer" },
      { subjectName: "Bob", direction: "Manager" },
    ];

    it("includes all subject names", () => {
      const { html, text } = getSummaryInviteEmail("Reviewer", "Q1 2026", assignments, "https://example.com/review/tok");
      expect(html).toContain("Alice");
      expect(html).toContain("Bob");
      expect(text).toContain("Alice");
      expect(text).toContain("Bob");
    });

    it("includes cycle name and URL", () => {
      const { html, text } = getSummaryInviteEmail("Reviewer", "Q1 2026", assignments, "https://example.com/review/tok");
      expect(html).toContain("Q1 2026");
      expect(text).toContain("Q1 2026");
      expect(html).toContain("https://example.com/review/tok");
      expect(text).toContain("https://example.com/review/tok");
    });

    it("shows correct evaluation count", () => {
      const { html, text } = getSummaryInviteEmail("Reviewer", "Q1", assignments, "https://example.com");
      expect(html).toContain("2");
      expect(text).toContain("2 evaluations");
    });

    it("uses singular for single assignment", () => {
      const single = [{ subjectName: "Alice", direction: "Peer" }];
      const { text } = getSummaryInviteEmail("Reviewer", "Q1", single, "https://example.com");
      expect(text).toContain("1 evaluation ");
    });

    it("escapes HTML in subject names", () => {
      const xss = [{ subjectName: '<img src=x onerror=alert("xss")>', direction: "Peer" }];
      const { html } = getSummaryInviteEmail("Reviewer", "Q1", xss, "https://example.com");
      expect(html).not.toContain('<img src=x');
      expect(html).toContain("&lt;img");
    });
  });

  describe("getSummaryReminderEmail", () => {
    const assignments = [
      { subjectName: "Alice", direction: "Peer" },
    ];

    it("includes deadline", () => {
      const { html, text } = getSummaryReminderEmail("Reviewer", "Q1", "April 1, 2026", assignments, "https://example.com");
      expect(html).toContain("April 1, 2026");
      expect(text).toContain("April 1, 2026");
    });

    it("returns both html and text", () => {
      const result = getSummaryReminderEmail("Reviewer", "Q1", "Apr 1", assignments, "https://example.com");
      expect(result).toHaveProperty("html");
      expect(result).toHaveProperty("text");
    });
  });

  describe("getEvaluationInviteEmail", () => {
    it("includes subject name and cycle name", () => {
      const { html, text } = getEvaluationInviteEmail("Reviewer", "Subject", "Q1 2026", "https://example.com/eval/tok");
      expect(html).toContain("Subject");
      expect(html).toContain("Q1 2026");
      expect(text).toContain("Subject");
      expect(text).toContain("Q1 2026");
    });
  });

  describe("getEvaluationReminderEmail", () => {
    it("includes deadline and subject name", () => {
      const { html, text } = getEvaluationReminderEmail("Reviewer", "Alice", "Q1", "March 31, 2026", "https://example.com");
      expect(html).toContain("Alice");
      expect(html).toContain("March 31, 2026");
      expect(text).toContain("Alice");
      expect(text).toContain("March 31, 2026");
    });
  });

  describe("getUserInviteEmail", () => {
    it("includes company name", () => {
      const { html, text } = getUserInviteEmail("Alice", "Acme Corp", "https://example.com/login");
      expect(html).toContain("Acme Corp");
      expect(text).toContain("Acme Corp");
    });

    it("includes login URL", () => {
      const { html, text } = getUserInviteEmail("Alice", "Acme", "https://example.com/login");
      expect(html).toContain("https://example.com/login");
      expect(text).toContain("https://example.com/login");
    });
  });

  describe("getDataExportEmail", () => {
    it("includes company name and export date", () => {
      const { html, text } = getDataExportEmail("Acme Corp", "March 1, 2026");
      expect(html).toContain("Acme Corp");
      expect(html).toContain("March 1, 2026");
      expect(text).toContain("Acme Corp");
      expect(text).toContain("March 1, 2026");
    });
  });

  describe("all templates return html and text", () => {
    it("every template function returns both keys", () => {
      const templates = [
        getOTPEmail("123456", "User"),
        getMagicLinkEmail("https://example.com"),
        getEvaluationInviteEmail("R", "S", "C", "https://example.com"),
        getEvaluationReminderEmail("R", "S", "C", "D", "https://example.com"),
        getSummaryInviteEmail("R", "C", [{ subjectName: "S", direction: "P" }], "https://example.com"),
        getSummaryReminderEmail("R", "C", "D", [{ subjectName: "S", direction: "P" }], "https://example.com"),
        getUserInviteEmail("R", "C", "https://example.com"),
        getDataExportEmail("C", "D"),
      ];

      for (const t of templates) {
        expect(t).toHaveProperty("html");
        expect(t).toHaveProperty("text");
        expect(t.html.length).toBeGreaterThan(0);
        expect(t.text.length).toBeGreaterThan(0);
      }
    });
  });
});
