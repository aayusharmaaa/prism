"use client";

import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/store/workspace";
import { avatarStyle, cn, initials, relativeTime } from "@/lib/format";
import type { Comment } from "@/lib/db/repo";
import {
  Check,
  CornerDownRight,
  MessageSquare,
  Quote,
  Send,
  Trash2,
  X,
} from "lucide-react";

/**
 * Threaded review comments for a document.
 *
 * `anchorText` records the passage that was selected when the comment was
 * made. It's stored as text rather than an offset deliberately: offsets rot
 * the moment anyone edits above them, whereas a quoted excerpt stays
 * meaningful even after the paragraph moves or changes.
 */
export function CommentsRail({
  documentId,
  anchorDraft,
  onClearAnchor,
  onClose,
}: {
  documentId: string;
  /** Text selected when the user hit "comment on selection". */
  anchorDraft: string | null;
  onClearAnchor: () => void;
  onClose: () => void;
}) {
  const { slug, members, user, role, toast } = useWorkspace();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const load = async () => {
    const res = await fetch(`/api/w/${slug}/documents/${documentId}/comments`, {
      cache: "no-store",
    });
    if (res.ok) setComments(((await res.json()).comments ?? []) as Comment[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, documentId]);

  useEffect(() => {
    if (anchorDraft) inputRef.current?.focus();
  }, [anchorDraft]);

  const post = async (body: string, parentId?: string) => {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/w/${slug}/documents/${documentId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: text,
          parentId,
          anchorText: parentId ? "" : (anchorDraft ?? ""),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.comment) {
        toast("error", data.error ?? "Could not post comment");
        return;
      }
      setComments((c) => [...c, data.comment as Comment]);
      if (parentId) {
        setReplyTo(null);
        setReplyDraft("");
      } else {
        setDraft("");
        onClearAnchor();
      }
    } finally {
      setBusy(false);
    }
  };

  const patch = async (payload: Record<string, unknown>) => {
    const res = await fetch(`/api/w/${slug}/documents/${documentId}/comments`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast("error", data.error ?? "Action failed");
      return;
    }
    setComments((data.comments ?? []) as Comment[]);
  };

  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "Unknown";
  const hueOf = (id: string) => members.find((m) => m.id === id)?.avatarHue ?? 250;

  const roots = comments.filter((c) => !c.parentId);
  const visible = roots.filter((c) => showResolved || !c.resolved);
  const repliesOf = (id: string) => comments.filter((c) => c.parentId === id);
  const resolvedCount = roots.filter((c) => c.resolved).length;

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-line bg-panel">
      <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-line px-2.5">
        <MessageSquare size={12} className="text-fg-dim" />
        <h3 className="flex-1 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-fg-dim">
          Comments · {roots.length}
        </h3>
        {resolvedCount > 0 && (
          <button
            onClick={() => setShowResolved((v) => !v)}
            className="rounded px-1 text-[10px] text-fg-dim transition-colors hover:text-fg"
          >
            {showResolved ? "Hide" : "Show"} resolved ({resolvedCount})
          </button>
        )}
        <button
          onClick={onClose}
          title="Close comments"
          className="grid h-5 w-5 place-items-center rounded text-fg-dim transition-colors hover:bg-hover hover:text-fg"
        >
          <X size={12} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading && <p className="text-[11.5px] text-fg-dim">Loading…</p>}

        {!loading && !visible.length && (
          <p className="px-1 py-3 text-[11.5px] leading-relaxed text-fg-dim">
            No comments yet. Select text in the document and press the comment
            button to anchor feedback to a specific passage.
          </p>
        )}

        {visible.map((c) => (
          <div
            key={c.id}
            className={cn(
              "mb-2 rounded-lg border border-line bg-elevated p-2",
              c.resolved && "opacity-60",
            )}
          >
            {c.anchorText && (
              <div className="mb-1.5 flex gap-1 border-l-2 border-accent/50 pl-1.5">
                <Quote size={9} className="mt-0.5 shrink-0 text-fg-dim" />
                <p className="line-clamp-2 text-[10px] italic leading-snug text-fg-dim">
                  {c.anchorText}
                </p>
              </div>
            )}

            <div className="mb-1 flex items-center gap-1.5">
              <span
                style={avatarStyle(hueOf(c.authorId))}
                className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-[7.5px] font-bold text-white"
              >
                {initials(nameOf(c.authorId))}
              </span>
              <span className="truncate text-[11px] font-medium">
                {nameOf(c.authorId)}
              </span>
              <span className="ml-auto shrink-0 text-[9.5px] text-fg-dim">
                {relativeTime(c.createdAt)}
              </span>
            </div>

            <p className="whitespace-pre-wrap break-words text-[11.5px] leading-relaxed text-fg-muted">
              {c.body}
            </p>

            {repliesOf(c.id).map((r) => (
              <div key={r.id} className="mt-1.5 border-l border-line pl-2">
                <div className="mb-0.5 flex items-center gap-1.5">
                  <CornerDownRight size={9} className="shrink-0 text-fg-dim" />
                  <span className="truncate text-[10.5px] font-medium">
                    {nameOf(r.authorId)}
                  </span>
                  <span className="ml-auto shrink-0 text-[9.5px] text-fg-dim">
                    {relativeTime(r.createdAt)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-fg-muted">
                  {r.body}
                </p>
              </div>
            ))}

            <div className="mt-1.5 flex items-center gap-1.5 border-t border-line pt-1.5">
              <button
                onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}
                className="text-[10.5px] text-fg-dim transition-colors hover:text-fg"
              >
                Reply
              </button>
              <button
                onClick={() => void patch({ commentId: c.id, resolved: !c.resolved })}
                className={cn(
                  "flex items-center gap-0.5 text-[10.5px] transition-colors",
                  c.resolved ? "text-ok" : "text-fg-dim hover:text-ok",
                )}
              >
                <Check size={10} /> {c.resolved ? "Resolved" : "Resolve"}
              </button>
              {(c.authorId === user?.id || role === "owner" || role === "admin") && (
                <button
                  onClick={() => void patch({ commentId: c.id, action: "delete" })}
                  title="Delete"
                  className="ml-auto text-fg-dim transition-colors hover:text-danger"
                >
                  <Trash2 size={10} />
                </button>
              )}
            </div>

            {replyTo === c.id && (
              <div className="mt-1.5 flex gap-1">
                <textarea
                  value={replyDraft}
                  onChange={(e) => setReplyDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void post(replyDraft, c.id);
                    }
                  }}
                  rows={2}
                  placeholder="Reply…"
                  className="min-w-0 flex-1 resize-none rounded border border-line bg-app px-1.5 py-1 text-[11px] outline-none placeholder:text-fg-dim focus:border-accent"
                />
                <button
                  onClick={() => void post(replyDraft, c.id)}
                  disabled={!replyDraft.trim()}
                  className="grid h-6 w-6 shrink-0 place-items-center self-end rounded bg-accent text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-30"
                >
                  <Send size={11} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-line p-2">
        {anchorDraft && (
          <div className="mb-1.5 flex gap-1 rounded border border-accent/35 bg-accent-soft px-1.5 py-1">
            <Quote size={9} className="mt-0.5 shrink-0 text-accent" />
            <p className="line-clamp-2 min-w-0 flex-1 text-[10px] italic leading-snug text-fg-muted">
              {anchorDraft}
            </p>
            <button
              onClick={onClearAnchor}
              className="shrink-0 text-fg-dim transition-colors hover:text-danger"
            >
              <X size={9} />
            </button>
          </div>
        )}
        <div className="flex gap-1">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void post(draft);
              }
            }}
            rows={2}
            placeholder={anchorDraft ? "Comment on this passage…" : "Add a comment…"}
            className="min-w-0 flex-1 resize-none rounded border border-line bg-editor px-2 py-1.5 text-[11.5px] outline-none placeholder:text-fg-dim focus:border-accent"
          />
          <button
            onClick={() => void post(draft)}
            disabled={!draft.trim() || busy}
            className="grid h-7 w-7 shrink-0 place-items-center self-end rounded bg-accent text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-30"
          >
            <Send size={12} />
          </button>
        </div>
      </div>
    </aside>
  );
}
