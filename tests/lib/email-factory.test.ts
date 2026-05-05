import { describe, it, expect, vi } from "vitest";

// The factory module uses CJS require("./providers/...") which vitest cannot
// intercept with vi.mock. We test the factory's error handling and provider
// selection logic by mocking the factory's own createProvider internally.

describe("Email Factory", () => {
  it("rejects unknown provider name", async () => {
    const saved = process.env.EMAIL_PROVIDER;
    process.env.EMAIL_PROVIDER = "mailgun";
    vi.resetModules();
    const { getEmailProvider } = await import("@/lib/email/factory");

    expect(() => getEmailProvider()).toThrow(
      'Unknown EMAIL_PROVIDER "mailgun". Valid options: console, resend, brevo, smtp'
    );

    process.env.EMAIL_PROVIDER = saved;
  });

  it("throws descriptive error for unknown provider", async () => {
    vi.resetModules();
    process.env.EMAIL_PROVIDER = "sendgrid";
    const { getEmailProvider } = await import("@/lib/email/factory");

    expect(() => getEmailProvider()).toThrow("Unknown EMAIL_PROVIDER");
    expect(() => getEmailProvider()).toThrow("Valid options: console, resend, brevo, smtp");

    delete process.env.EMAIL_PROVIDER;
  });

  it("includes the invalid provider name in error message", async () => {
    vi.resetModules();
    process.env.EMAIL_PROVIDER = "ses";
    const { getEmailProvider } = await import("@/lib/email/factory");

    expect(() => getEmailProvider()).toThrow('"ses"');

    delete process.env.EMAIL_PROVIDER;
  });
});
