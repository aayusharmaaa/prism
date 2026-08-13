"use client";

import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/store/workspace";
import { SidebarHeader, SidebarIconButton } from "@/components/shell/Sidebar";
import { avatarStyle, cn, initials, relativeTime } from "@/lib/format";
import type { AuditEntry } from "@/lib/types";
import type { Comment } from "@/lib/db/repo";
import {
  Bot,
  Check,
  FilePlus2,
  FileText,
  Globe,
  Loader2,
  MessageSquare,
  Plug,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
  UserCog,
  X,
} from "lucide-react";

/** Icon + phrasing per audit action, so the feed reads as prose not log lines. */
const ACTION_META: Record<
  string,
  { icon: typeof FileText; verb: string; tone?: string }
> = {
  "document.created": { icon: FilePlus2, verb: "created" },
  "document.deleted": { icon: Trash2, verb: "deleted", tone: "text-danger" },
  "document.status_changed": { icon: FileText, verb: "moved" },
  "document.restored": { icon: RotateCcw, verb: "restored", tone: "text-warn" },
  "document.shared": { icon: Globe, verb: "shared", tone: "text-info" },
  "document.unshared": { icon: Globe, verb: "revoked sharing on" },
  "change.proposed": { icon: Bot, verb: "proposed a change to", tone: "text-accent" },
  "change.accepted": { icon: Check, verb: "accepted a change to", tone: "text-ok" },
  "change.rejected": { icon: X, verb: "rejected a change to" },
  "comment.added": { icon: MessageSquare, verb: "commented on" },
  "comment.replied": { icon: MessageSquare, verb: "replied on" },
  "source.added": { icon: Upload, verb: "added source" },
  "tickets.pushed": { icon: Check, verb: "pushed", tone: "text-ok" },
  "integration.connected": { icon: Plug, verb: "connected", tone: "text-ok" },
  "integration.disconnected": { icon: Plug, verb: "disconnected", tone: "text-warn" },
  "member.role_changed": { icon: UserCog, verb: "changed role for" },
  "member.invited": { icon: UserCog, verb: "invited" },
  "memory.updated": { icon: Bot, verb: "updated" },
  "apikey.created": { icon: UserCog, verb: "created API key" },
  "apikey.revoked": { icon: UserCog, verb: "revoked API key", tone: "text-danger" },
  "workspace.updated": { icon: UserCog, verb: "updated workspace" },
};

/**
 * Workspace-wide activity — the answer to Cursor's "solo tool, no team
 * visibility". Built on the existing audit log rather than a parallel event
 * stream, so governance and visibility can't drift apart.
 */
export function ActivityView() {
  const { slug, members, documents, openDocument } = useWorkspace();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [openComments, setOpenComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const res = await fetch(`/api/w/${slug}/activity`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setEntries((data.entries ?? []) as AuditEntry[]);
      setOpenComments((data.openComments ?? []) as Comment[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Group by calendar day so the feed reads chronologically.
  const grouped = useMemo(() => {
    const map = new Map<string, AuditEntry[]>();
    for (const e of entries) {
      const day = e.createdAt.slice(0, 10);
      const bucket = map.get(day);
      if (bucket) bucket.push(e);
      else map.set(day, [e]);
    }
    return [...map.entries()];
  }, [entries]);

  const dayLabel = (day: string) => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (day === today) return "Today";
    if (day === yesterday) return "Yesterday";
    return new Date(day).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  };

  const hueOf = (id: string) =>
    members.find((m) => m.id === id)?.avatarHue ?? 250;

  return (
    <div className="flex h-full flex-col">
      <SidebarHeader
        title="Activity"
        actions={
          <SidebarIconButton
            onClick={() => {
              setLoading(true);
              void load();
            }}
            title="Refresh"
          >
            <RefreshCw size={12} className={cn(loading && "animate-spin")} />
          </SidebarIconButton>
        }
      />

      {openComments.length > 0 && (
        <button
          onClick={() => {
            const doc = documents.find((d) => d.id === openComments[0].documentId);
            if (doc) openDocument(doc.id);
          }}
          className="mx-2 mb-2 flex items-start gap-1.5 rounded-md border border-accent/30 bg-accent-soft px-2 py-1.5 text-left transition-colors hover:border-accent/50"
        >
          <MessageSquare size={11} className="mt-0.5 shrink-0 text-accent" />
          <span className="text-[11px] leading-snug text-fg-muted">
            <strong className="text-fg">{openComments.length}</strong> unresolved
            comment{openComments.length === 1 ? "" : "s"} across the workspace
          </span>
        </button>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {loading && !entries.length && (
          <div className="flex items-center gap-2 px-3 py-3 text-[11.5px] text-fg-dim">
            <Loader2 size={12} className="animate-spin" /> Loading…
          </div>
        )}

        {!loading && !entries.length && (
          <p className="px-3 py-3 text-[11.5px] leading-relaxed text-fg-dim">
            Nothing has happened yet. Edits, AI changes, comments, and pushes
            all show up here.
          </p>
        )}

        {grouped.map(([day, items]) => (
          <div key={day} className="mb-1">
            <div className="sticky top-0 z-10 bg-sidebar px-3 py-1 text-[9.5px] font-semibold uppercase tracking-wider text-fg-dim">
              {dayLabel(day)}
            </div>
            {items.map((e) => {
              const meta = ACTION_META[e.action] ?? {
                icon: FileText,
                verb: e.action.replace(/[._]/g, " "),
              };
              const Icon = meta.icon;
              const docId =
                typeof e.meta?.documentId === "string" ? e.meta.documentId : null;

              return (
                <button
                  key={e.id}
                  onClick={() => docId && openDocument(docId)}
                  disabled={!docId}
                  className={cn(
                    "flex w-full items-start gap-2 px-3 py-1.5 text-left transition-colors",
                    docId ? "hover:bg-hover" : "cursor-default",
                  )}
                >
                  <span
                    style={avatarStyle(hueOf(e.actorId))}
                    className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full text-[7.5px] font-bold text-white"
                  >
                    {initials(e.actorName)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-[11.5px] leading-snug text-fg-muted">
                      <strong className="font-medium text-fg">{e.actorName}</strong>{" "}
                      {meta.verb}{" "}
                      {e.target && (
                        <span className="text-fg">{truncate(e.target)}</span>
                      )}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 text-[9.5px] text-fg-dim">
                      <Icon size={9} className={meta.tone} />
                      {relativeTime(e.createdAt)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

const truncate = (s: string, n = 44) => (s.length > n ? `${s.slice(0, n)}…` : s);
