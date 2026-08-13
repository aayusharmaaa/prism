"use client";

import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/store/workspace";
import { computeDiff } from "@/lib/diff";
import { avatarStyle, cn, initials, relativeTime } from "@/lib/format";
import type { Document } from "@/lib/types";
import {
  Bot,
  Clock,
  History,
  Loader2,
  RotateCcw,
  Sparkles,
  User,
  X,
} from "lucide-react";

interface Version {
  id: string;
  content: string;
  origin: "manual" | "agent" | "inline" | "restore";
  label: string;
  createdBy: string;
  createdAt: string;
}

const ORIGIN_META = {
  manual: { icon: User, label: "Edit", tone: "text-fg-dim" },
  agent: { icon: Bot, label: "AI change", tone: "text-accent" },
  inline: { icon: Sparkles, label: "Inline edit", tone: "text-accent" },
  restore: { icon: RotateCcw, label: "Restore", tone: "text-warn" },
} as const;

/**
 * Version timeline with a diff of the selected snapshot against the live
 * document. Reuses `computeDiff` rather than a bespoke renderer so history and
 * AI review show changes identically.
 */
export function HistoryPanel({
  doc,
  onClose,
}: {
  doc: Document;
  onClose: () => void;
}) {
  const { slug, members, role, toast, refresh } = useWorkspace();
  const [versions, setVersions] = useState<Version[]>([]);
  const [current, setCurrent] = useState<string>(doc.content);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);

  const canRestore = role !== "viewer";

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/w/${slug}/documents/${doc.id}/versions`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setVersions((data.versions ?? []) as Version[]);
        setCurrent(data.current?.content ?? doc.content);
        setSelected((data.versions ?? [])[0]?.id ?? null);
      }
      setLoading(false);
    })();
  }, [slug, doc.id, doc.content]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const version = versions.find((v) => v.id === selected) ?? null;

  // Old → new, so additions read as "what the current version added".
  const diff = useMemo(
    () => (version ? computeDiff(version.content, current, 2) : null),
    [version, current],
  );

  const nameOf = (userId: string) =>
    members.find((m) => m.id === userId)?.name ?? "Unknown";

  const restore = async () => {
    if (!version || restoring) return;
    setRestoring(true);
    try {
      const res = await fetch(`/api/w/${slug}/documents/${doc.id}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: version.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast("error", data.error ?? "Restore failed");
        return;
      }
      await refresh("documents");
      toast("ok", "Restored — the previous content is still in history");
      onClose();
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex items-start justify-center bg-black/50 pt-[6vh] backdrop-blur-[1px]"
      onMouseDown={onClose}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="animate-pop flex h-[80vh] w-[min(900px,94vw)] flex-col overflow-hidden rounded-xl border border-line-strong bg-elevated shadow-2xl shadow-black/60"
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <History size={14} className="text-accent" />
          <h2 className="flex-1 truncate text-[13px] font-semibold">
            History · {doc.title}
          </h2>
          <button
            onClick={onClose}
            className="grid h-6 w-6 place-items-center rounded text-fg-dim transition-colors hover:bg-hover hover:text-fg"
          >
            <X size={13} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Timeline */}
          <div className="w-64 shrink-0 overflow-y-auto border-r border-line">
            {loading && (
              <div className="flex items-center gap-2 p-3 text-[12px] text-fg-dim">
                <Loader2 size={12} className="animate-spin" /> Loading…
              </div>
            )}

            <div className="border-b border-line bg-accent-soft/40 px-3 py-2">
              <p className="text-[11.5px] font-medium">Current</p>
              <p className="text-[10.5px] text-fg-dim">
                {relativeTime(doc.updatedAt)}
                {doc.updatedBy ? ` · ${nameOf(doc.updatedBy)}` : ""}
              </p>
            </div>

            {!loading && !versions.length && (
              <p className="p-3 text-[11.5px] leading-relaxed text-fg-dim">
                No earlier versions yet. Snapshots are taken as you edit and
                before every AI change is applied.
              </p>
            )}

            {versions.map((v) => {
              const meta = ORIGIN_META[v.origin] ?? ORIGIN_META.manual;
              const Icon = meta.icon;
              return (
                <button
                  key={v.id}
                  onClick={() => setSelected(v.id)}
                  className={cn(
                    "block w-full border-b border-line px-3 py-2 text-left transition-colors",
                    selected === v.id ? "bg-accent-soft" : "hover:bg-hover",
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <Icon size={11} className={cn("shrink-0", meta.tone)} />
                    <span className="text-[11.5px] font-medium">{meta.label}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-fg-dim">
                      {relativeTime(v.createdAt)}
                    </span>
                  </div>
                  {v.label && (
                    <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-snug text-fg-muted">
                      {v.label}
                    </p>
                  )}
                  <div className="mt-1 flex items-center gap-1">
                    <span
                      style={avatarStyle(
                        members.find((m) => m.id === v.createdBy)?.avatarHue ?? 250,
                      )}
                      className="grid h-3.5 w-3.5 place-items-center rounded-full text-[7px] font-bold text-white"
                    >
                      {initials(nameOf(v.createdBy))}
                    </span>
                    <span className="truncate text-[10px] text-fg-dim">
                      {nameOf(v.createdBy)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Diff */}
          <div className="flex min-w-0 flex-1 flex-col">
            {version && diff ? (
              <>
                <div className="flex items-center gap-2 border-b border-line px-3 py-2">
                  <Clock size={12} className="shrink-0 text-fg-dim" />
                  <span className="min-w-0 flex-1 truncate text-[11.5px] text-fg-muted">
                    Comparing that version to current
                  </span>
                  <span className="shrink-0 font-mono text-[10.5px]">
                    <span className="text-add">+{diff.added}</span>{" "}
                    <span className="text-del">−{diff.removed}</span>
                  </span>
                  {canRestore && (
                    <button
                      onClick={() => void restore()}
                      disabled={restoring || !diff.hunks.length}
                      title={
                        !diff.hunks.length
                          ? "Identical to current"
                          : "Replace current content with this version"
                      }
                      className="flex shrink-0 items-center gap-1 rounded bg-accent px-2.5 py-1 text-[11.5px] font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-40"
                    >
                      {restoring ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <RotateCcw size={11} />
                      )}
                      Restore
                    </button>
                  )}
                </div>

                <div className="min-h-0 flex-1 overflow-auto bg-app font-mono text-[11.5px] leading-[1.55]">
                  {!diff.hunks.length ? (
                    <p className="p-4 font-sans text-[12.5px] text-fg-dim">
                      Identical to the current document.
                    </p>
                  ) : (
                    diff.hunks.map((h) => (
                      <div key={h.id} className="border-b border-line last:border-0">
                        <div className="bg-elevated px-3 py-1 font-sans text-[10px] text-fg-dim">
                          line {h.beforeStart}
                        </div>
                        {h.lines.map((line, i) => (
                          <div
                            key={i}
                            className={cn(
                              "flex min-w-max px-3",
                              line.type === "add" && "bg-add/10",
                              line.type === "del" && "bg-del/10",
                            )}
                          >
                            <span
                              className={cn(
                                "w-4 shrink-0 select-none",
                                line.type === "add" && "text-add",
                                line.type === "del" && "text-del",
                              )}
                            >
                              {line.type === "add" ? "+" : line.type === "del" ? "−" : " "}
                            </span>
                            <span className="whitespace-pre text-fg">
                              {line.text || " "}
                            </span>
                          </div>
                        ))}
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : (
              <div className="grid flex-1 place-items-center text-[12.5px] text-fg-dim">
                {loading ? "" : "Select a version to compare"}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
