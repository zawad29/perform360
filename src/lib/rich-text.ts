import { sanitizeHtml } from "@/lib/crypto-utils";

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"');
}

export function stripRichText(value?: string | null) {
  if (!value) return "";
  return decodeEntities(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasMeaningfulRichText(value?: string | null) {
  return stripRichText(value).length > 0;
}

export function sanitizeRichText(value?: string | null) {
  if (value == null) return undefined;
  const sanitized = sanitizeHtml(value);
  return hasMeaningfulRichText(sanitized) ? sanitized : "";
}
