"use client";

import { sanitizeRichText } from "@/lib/rich-text";

interface RichTextContentProps {
  html?: string | null;
  className?: string;
}

export function RichTextContent({ html, className }: RichTextContentProps) {
  const sanitized = sanitizeRichText(html);

  if (!sanitized) return null;

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
