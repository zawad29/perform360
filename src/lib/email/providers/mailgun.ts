import Mailgun from "mailgun.js";
import FormData from "form-data";
import type {
  EmailProvider,
  SendEmailOptions,
  SendEmailWithAttachmentsOptions,
} from "../types";

const DEFAULT_FROM =
  process.env.EMAIL_FROM || "Performs360 <noreply@performs360.com>";

type MailgunClient = ReturnType<InstanceType<typeof Mailgun>["client"]>;

let _client: MailgunClient | null = null;
function getClient(): MailgunClient {
  if (!_client) {
    if (!process.env.MAILGUN_API_KEY) {
      throw new Error(
        "MAILGUN_API_KEY env var is required for mailgun provider"
      );
    }
    const mailgun = new Mailgun(FormData);
    _client = mailgun.client({
      username: "api",
      key: process.env.MAILGUN_API_KEY,
      // EU customers must set MAILGUN_API_URL to https://api.eu.mailgun.net
      ...(process.env.MAILGUN_API_URL
        ? { url: process.env.MAILGUN_API_URL }
        : {}),
    });
  }
  return _client;
}

function getDomain(): string {
  const domain = process.env.MAILGUN_DOMAIN;
  if (!domain) {
    throw new Error("MAILGUN_DOMAIN env var is required for mailgun provider");
  }
  return domain;
}

export const mailgunProvider: EmailProvider = {
  async send({ to, subject, html, text }: SendEmailOptions) {
    try {
      await getClient().messages.create(getDomain(), {
        from: DEFAULT_FROM,
        to: [to],
        subject,
        html,
        ...(text ? { text } : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Mailgun: failed to send email: ${message}`);
    }
  },

  async sendWithAttachments({
    to,
    subject,
    html,
    text,
    attachments,
  }: SendEmailWithAttachmentsOptions) {
    try {
      await getClient().messages.create(getDomain(), {
        from: DEFAULT_FROM,
        to: [to],
        subject,
        html,
        ...(text ? { text } : {}),
        attachment: attachments.map((a) => ({
          filename: a.filename,
          data:
            typeof a.content === "string" ? Buffer.from(a.content) : a.content,
          contentType: a.contentType,
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Mailgun: failed to send email: ${message}`);
    }
  },
};
