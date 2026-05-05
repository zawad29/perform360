import type {
  EmailProvider,
  SendEmailOptions,
  SendEmailWithAttachmentsOptions,
} from "../types";

const DIVIDER = "─".repeat(72);

function logEmail(opts: { to: string; subject: string; text?: string; html?: string; attachments?: number }) {
  console.log(
    [
      "",
      DIVIDER,
      `📧  EMAIL (console provider)`,
      `   To:      ${opts.to}`,
      `   Subject: ${opts.subject}`,
      ...(opts.attachments ? [`   Attachments: ${opts.attachments}`] : []),
      DIVIDER,
      opts.text ?? extractTextFromHtml(opts.html ?? ""),
      DIVIDER,
      "",
    ].join("\n")
  );
}

/** Extract magic-link URLs and visible body text from a basic HTML email. */
function extractTextFromHtml(html: string): string {
  const linkMatches = Array.from(html.matchAll(/href="([^"]+)"/g)).map((m) => m[1]);
  const stripped = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const sections = [stripped];
  if (linkMatches.length > 0) {
    sections.push("", "Links:", ...linkMatches.map((u) => `  → ${u}`));
  }
  return sections.join("\n");
}

export const consoleProvider: EmailProvider = {
  async send({ to, subject, html, text }: SendEmailOptions) {
    logEmail({ to, subject, html, text });
  },

  async sendWithAttachments({
    to,
    subject,
    html,
    text,
    attachments,
  }: SendEmailWithAttachmentsOptions) {
    logEmail({ to, subject, html, text, attachments: attachments.length });
  },
};
