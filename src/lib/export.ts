import type { Document } from "@/lib/types";
import { DOC_KIND_LABEL, STATUS_LABEL } from "@/lib/format";

/**
 * Document export.
 *
 * PDF goes through the browser's own print pipeline rather than a bundled
 * renderer — it costs nothing in bundle size, honours the print stylesheet,
 * and produces a file people can actually hand to a stakeholder.
 */

const slug = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "document";

/** Front-matter makes the export round-trippable into another tool. */
export function toMarkdown(doc: Document): string {
  return [
    "---",
    `title: ${JSON.stringify(doc.title)}`,
    `kind: ${DOC_KIND_LABEL[doc.kind]}`,
    `status: ${STATUS_LABEL[doc.status]}`,
    `exported: ${new Date().toISOString()}`,
    "---",
    "",
    doc.content.trim(),
    "",
  ].join("\n");
}

export function downloadMarkdown(doc: Document) {
  const blob = new Blob([toMarkdown(doc)], {
    type: "text/markdown;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = window.document.createElement("a");
  a.href = url;
  a.download = `${slug(doc.title)}.md`;
  window.document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function copyMarkdown(doc: Document): Promise<boolean> {
  const text = toMarkdown(doc);
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API needs a secure context and permission; fall back.
    try {
      const ta = window.document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      window.document.body.appendChild(ta);
      ta.select();
      const ok = window.document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * Prints the rendered document. The caller must be showing the preview, since
 * the print stylesheet targets `.prose-prism` and hides the app chrome.
 */
export function printDocument() {
  window.print();
}
