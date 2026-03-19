import DOMPurify from "dompurify";
import { marked } from "marked";

let configured = false;

function ensureMarkedConfigured(): void {
  if (configured) return;
  marked.setOptions({
    gfm: true,
    breaks: false,
  });
  configured = true;
}

/** Parse Markdown to HTML and sanitize for {@html} rendering. */
export function renderMarkdownToSafeHtml(source: string): string {
  ensureMarkedConfigured();
  const raw = marked.parse(source, { async: false }) as string;
  return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
}

/** Sanitize user HTML for live preview (same policy as Markdown: scripts removed). */
export function sanitizeHtmlForPreview(source: string): string {
  return DOMPurify.sanitize(source, { USE_PROFILES: { html: true } });
}
