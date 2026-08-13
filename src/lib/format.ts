import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { DocKind, DocStatus, SourceKind } from "@/lib/types";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 31) return `${Math.round(days / 7)}w ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

export const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

export function compactNumber(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

/** Rough token estimate for the status bar; not billing-accurate. */
export const estimateTokens = (text: string) => Math.ceil(text.length / 3.7);

export const DOC_KIND_LABEL: Record<DocKind, string> = {
  prd: "PRD",
  spec: "Spec",
  onepager: "One-pager",
  research: "Research",
  roadmap: "Roadmap",
  note: "Note",
  memory: "Memory",
};

export const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  interview: "Interview",
  feedback: "Feedback",
  ticket: "Tickets",
  metric: "Metrics",
  competitor: "Competitive",
  transcript: "Transcript",
};

export const STATUS_LABEL: Record<DocStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  shipped: "Shipped",
};

export const STATUS_CLASS: Record<DocStatus, string> = {
  draft: "text-fg-dim border-line",
  in_review: "text-warn border-warn/40",
  approved: "text-ok border-ok/40",
  shipped: "text-info border-info/40",
};

/** Deterministic pastel from a hue, used for member avatars. */
export const avatarStyle = (hue: number) => ({
  background: `linear-gradient(135deg, hsl(${hue} 62% 52%), hsl(${(hue + 38) % 360} 58% 44%))`,
});

/** First non-heading line, used as a subtitle in lists. */
export function preview(markdown: string, max = 90): string {
  const line = markdown
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("#") && !l.startsWith("**Status"));
  if (!line) return "";
  const clean = line.replace(/[*_`>|-]/g, "").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}
