import type { EmailProvider } from "./types";

type ProviderName = "console" | "resend" | "brevo" | "smtp";

let _provider: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (!_provider) {
    const name = (process.env.EMAIL_PROVIDER || "console") as ProviderName;
    _provider = createProvider(name);
  }
  return _provider;
}

function createProvider(name: ProviderName): EmailProvider {
  switch (name) {
    case "console": {
      const { consoleProvider } = require("./providers/console") as typeof import("./providers/console");
      return consoleProvider;
    }
    case "resend": {
      const { resendProvider } = require("./providers/resend") as typeof import("./providers/resend");
      return resendProvider;
    }
    case "brevo": {
      const { brevoProvider } = require("./providers/brevo") as typeof import("./providers/brevo");
      return brevoProvider;
    }
    case "smtp": {
      const { smtpProvider } = require("./providers/smtp") as typeof import("./providers/smtp");
      return smtpProvider;
    }
    default:
      throw new Error(
        `Unknown EMAIL_PROVIDER "${name}". Valid options: console, resend, brevo, smtp`
      );
  }
}
