"use client";

import { useEffect, useState } from "react";
import { useWorkspace } from "@/store/workspace";
import { cn, relativeTime } from "@/lib/format";
import type { Document } from "@/lib/types";
import { Check, Copy, Globe, Link2, Loader2, Trash2, X } from "lucide-react";

interface Share {
  id: string;
  token: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

const EXPIRY = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "Never", days: 0 },
];

export function ShareDialog({
  doc,
  onClose,
}: {
  doc: Document;
  onClose: () => void;
}) {
  const { slug, toast, role } = useWorkspace();
  const [shares, setShares] = useState<Share[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState(30);
  const [copied, setCopied] = useState<string | null>(null);

  const canShare = role !== "viewer";

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/w/${slug}/documents/${doc.id}/share`, {
        cache: "no-store",
      });
      if (res.ok) setShares(((await res.json()).shares ?? []) as Share[]);
      setLoading(false);
    })();
  }, [slug, doc.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const active = shares.filter((s) => !s.revokedAt);

  const create = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/w/${slug}/documents/${doc.id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresInDays: days || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.share) {
        toast("error", data.error ?? "Could not create link");
        return;
      }
      setShares((s) => [data.share, ...s]);
      await copy(data.share.token);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (shareId: string) => {
    const res = await fetch(
      `/api/w/${slug}/documents/${doc.id}/share?shareId=${shareId}`,
      { method: "DELETE" },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast("error", data.error ?? "Could not revoke");
      return;
    }
    setShares((data.shares ?? []) as Share[]);
    toast("info", "Link revoked — it now 404s for anyone holding it");
  };

  const urlFor = (token: string) =>
    typeof window === "undefined" ? "" : `${window.location.origin}/s/${token}`;

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(urlFor(token));
      setCopied(token);
      setTimeout(() => setCopied(null), 1800);
      toast("ok", "Link copied");
    } catch {
      toast("error", "Couldn't copy — select and copy the link manually");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex items-start justify-center bg-black/50 pt-[12vh] backdrop-blur-[1px]"
      onMouseDown={onClose}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="animate-pop w-[min(520px,92vw)] overflow-hidden rounded-xl border border-line-strong bg-elevated shadow-2xl shadow-black/60"
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <Globe size={14} className="text-accent" />
          <h2 className="flex-1 truncate text-[13px] font-semibold">
            Share “{doc.title}”
          </h2>
          <button
            onClick={onClose}
            className="grid h-6 w-6 place-items-center rounded text-fg-dim transition-colors hover:bg-hover hover:text-fg"
          >
            <X size={13} />
          </button>
        </div>

        <div className="px-4 py-3">
          <p className="mb-3 text-[11.5px] leading-relaxed text-fg-muted">
            Anyone with the link can read this document — no account needed. They
            see only this page, never the workspace. Revoking takes effect
            immediately.
          </p>

          {canShare && (
            <div className="mb-3 flex items-center gap-2">
              <span className="text-[11.5px] text-fg-dim">Expires</span>
              <div className="flex gap-1">
                {EXPIRY.map((e) => (
                  <button
                    key={e.label}
                    onClick={() => setDays(e.days)}
                    className={cn(
                      "rounded border px-2 py-1 text-[11.5px] transition-colors",
                      days === e.days
                        ? "border-accent bg-accent-soft text-fg"
                        : "border-line text-fg-muted hover:text-fg",
                    )}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => void create()}
                disabled={busy}
                className="ml-auto flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-[12px] font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                {busy ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
                Create link
              </button>
            </div>
          )}

          {loading ? (
            <div className="flex items-center gap-2 py-4 text-[12px] text-fg-dim">
              <Loader2 size={12} className="animate-spin" /> Loading…
            </div>
          ) : !active.length ? (
            <p className="rounded border border-dashed border-line px-3 py-4 text-center text-[11.5px] text-fg-dim">
              No active links. This document is private to the workspace.
            </p>
          ) : (
            <div className="space-y-1.5">
              {active.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-2 rounded border border-line bg-app px-2 py-1.5"
                >
                  <input
                    readOnly
                    value={urlFor(s.token)}
                    onFocus={(e) => e.currentTarget.select()}
                    className="min-w-0 flex-1 bg-transparent font-mono text-[11px] text-fg-muted outline-none"
                  />
                  <button
                    onClick={() => void copy(s.token)}
                    title="Copy link"
                    className="shrink-0 rounded p-1 text-fg-dim transition-colors hover:bg-hover hover:text-fg"
                  >
                    {copied === s.token ? (
                      <Check size={12} className="text-ok" />
                    ) : (
                      <Copy size={12} />
                    )}
                  </button>
                  {canShare && (
                    <button
                      onClick={() => void revoke(s.id)}
                      title="Revoke"
                      className="shrink-0 rounded p-1 text-fg-dim transition-colors hover:bg-hover hover:text-danger"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
              <p className="pt-0.5 text-[10.5px] text-fg-dim">
                {active[0].expiresAt
                  ? `Expires ${relativeTime(active[0].expiresAt).replace(" ago", "")} from creation · created ${relativeTime(active[0].createdAt)}`
                  : `Never expires · created ${relativeTime(active[0].createdAt)}`}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
