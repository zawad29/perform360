import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.unmock("@/lib/email");

// Mock the mailgun.js SDK: `new Mailgun(FormData).client({...})` returns a
// client exposing `messages.create(domain, data)`.
const mockCreate = vi.fn();

class MockMailgun {
  client() {
    return { messages: { create: mockCreate } };
  }
}

vi.mock("mailgun.js", () => ({ default: MockMailgun }));
vi.mock("form-data", () => ({ default: class {} }));

describe("Mailgun Email Provider", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.MAILGUN_API_KEY = "test-mailgun-key";
    process.env.MAILGUN_DOMAIN = "mg.example.com";
    process.env.EMAIL_FROM = "Test <test@example.com>";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  async function getProvider() {
    vi.doMock("mailgun.js", () => ({ default: MockMailgun }));
    vi.doMock("form-data", () => ({ default: class {} }));
    const { mailgunProvider } = await import("@/lib/email/providers/mailgun");
    return mailgunProvider;
  }

  describe("send", () => {
    it("sends email with correct parameters", async () => {
      mockCreate.mockResolvedValue({ id: "<msg@mg.example.com>" });
      const provider = await getProvider();

      await provider.send({
        to: "user@test.com",
        subject: "Hello",
        html: "<p>Hi</p>",
        text: "Hi",
      });

      expect(mockCreate).toHaveBeenCalledWith("mg.example.com", {
        from: "Test <test@example.com>",
        to: ["user@test.com"],
        subject: "Hello",
        html: "<p>Hi</p>",
        text: "Hi",
      });
    });

    it("omits text when not provided", async () => {
      mockCreate.mockResolvedValue({ id: "x" });
      const provider = await getProvider();

      await provider.send({
        to: "user@test.com",
        subject: "Hello",
        html: "<p>Hi</p>",
      });

      const call = mockCreate.mock.calls[0][1];
      expect(call.text).toBeUndefined();
    });

    it("throws on Mailgun error", async () => {
      mockCreate.mockRejectedValue(new Error("Rate limit exceeded"));
      const provider = await getProvider();

      await expect(
        provider.send({
          to: "user@test.com",
          subject: "Test",
          html: "<p>Test</p>",
        })
      ).rejects.toThrow("Mailgun: failed to send email: Rate limit exceeded");
    });

    it("throws when MAILGUN_API_KEY is missing", async () => {
      delete process.env.MAILGUN_API_KEY;
      const provider = await getProvider();

      await expect(
        provider.send({
          to: "user@test.com",
          subject: "Test",
          html: "<p>Test</p>",
        })
      ).rejects.toThrow("MAILGUN_API_KEY env var is required");
    });

    it("throws when MAILGUN_DOMAIN is missing", async () => {
      delete process.env.MAILGUN_DOMAIN;
      const provider = await getProvider();

      await expect(
        provider.send({
          to: "user@test.com",
          subject: "Test",
          html: "<p>Test</p>",
        })
      ).rejects.toThrow("MAILGUN_DOMAIN env var is required");
    });
  });

  describe("sendWithAttachments", () => {
    it("converts string content to Buffer", async () => {
      mockCreate.mockResolvedValue({ id: "x" });
      const provider = await getProvider();

      await provider.sendWithAttachments({
        to: "user@test.com",
        subject: "Report",
        html: "<p>Attached</p>",
        attachments: [
          {
            filename: "report.pdf",
            content: "base64content",
            contentType: "application/pdf",
          },
        ],
      });

      const call = mockCreate.mock.calls[0][1];
      expect(call.attachment[0].filename).toBe("report.pdf");
      expect(Buffer.isBuffer(call.attachment[0].data)).toBe(true);
      expect(call.attachment[0].contentType).toBe("application/pdf");
    });

    it("passes Buffer content directly", async () => {
      mockCreate.mockResolvedValue({ id: "x" });
      const provider = await getProvider();
      const buffer = Buffer.from("hello");

      await provider.sendWithAttachments({
        to: "user@test.com",
        subject: "Report",
        html: "<p>Attached</p>",
        attachments: [
          {
            filename: "data.bin",
            content: buffer,
            contentType: "application/octet-stream",
          },
        ],
      });

      const call = mockCreate.mock.calls[0][1];
      expect(call.attachment[0].data).toBe(buffer);
    });

    it("throws on error with attachments", async () => {
      mockCreate.mockRejectedValue(new Error("Attachment too large"));
      const provider = await getProvider();

      await expect(
        provider.sendWithAttachments({
          to: "user@test.com",
          subject: "Report",
          html: "<p>Attached</p>",
          attachments: [
            { filename: "big.zip", content: "data", contentType: "application/zip" },
          ],
        })
      ).rejects.toThrow("Mailgun: failed to send email: Attachment too large");
    });
  });
});
