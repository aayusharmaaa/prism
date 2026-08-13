"use client";

import { useWorkspace } from "@/store/workspace";
import { SidebarHeader } from "@/components/shell/Sidebar";
import { computeDiff, diffStat } from "@/lib/diff";
import { relativeTime } from "@/lib/format";
import { Bot, Check, GitPullRequestArrow, Sparkles, X } from "lucide-react";

/** Pending AI-proposed diffs across the whole workspace. */
export function ReviewQueue() {
  const { pendingChanges, documents, openDocument, resolveChange, role } =
    useWorkspace();

  const canReview = role !== "viewer";

  return (
    <div className="flex h-full flex-col">
      <SidebarHeader title={`Review queue · ${pendingChanges.length}`} />

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {!pendingChanges.length && (
          <div className="px-1 pt-6 text-center">
            <GitPullRequestArrow
              size={22}
              className="mx-auto mb-2 text-fg-dim opacity-50"
            />
            <p className="text-[12px] font-medium text-fg-muted">Nothing to review</p>
            <p className="mt-1 text-[11px] leading-relaxed text-fg-dim">
              Ask the agent to change a document and the diff lands here for
              accept or reject.
            </p>
          </div>
        )}

        {pendingChanges.map((change) => {
          const doc = documents.find((d) => d.id === change.documentId);
          const diff = computeDiff(change.before ?? "", change.after);
          return (
            <div
              key={change.id}
              className="animate-fade-up mb-2 overflow-hidden rounded-lg border border-line bg-elevated"
            >
              <button
                onClick={() => openDocument(change.documentId)}
                className="w-full px-2.5 pb-1.5 pt-2 text-left"
              >
                <div className="mb-1 flex items-center gap-1.5">
                  {change.createdBy === "agent" ? (
                    <Bot size={11} className="shrink-0 text-accent" />
                  ) : (
                    <Sparkles size={11} className="shrink-0 text-accent" />
                  )}
                  <span className="truncate text-[11px] font-medium text-fg-muted">
                    {doc?.title ?? "Document"}
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-[10px]">
                    <span className="text-add">+{diff.added}</span>{" "}
                    <span className="text-del">−{diff.removed}</span>
                  </span>
                </div>
                <p className="line-clamp-3 text-[12px] leading-snug text-fg">
                  {change.summary}
                </p>
                <p className="mt-1 text-[10px] text-fg-dim">
                  {diff.hunks.length} hunk{diff.hunks.length === 1 ? "" : "s"} ·{" "}
                  {diffStat(diff)} · {relativeTime(change.createdAt)}
                </p>
              </button>

              {canReview && (
                <div className="flex border-t border-line">
                  <button
                    onClick={() => void resolveChange(change.id, "accept")}
                    className="flex flex-1 items-center justify-center gap-1 py-1.5 text-[11.5px] font-medium text-ok transition-colors hover:bg-ok/10"
                  >
                    <Check size={12} /> Accept
                  </button>
                  <div className="w-px bg-line" />
                  <button
                    onClick={() => void resolveChange(change.id, "reject")}
                    className="flex flex-1 items-center justify-center gap-1 py-1.5 text-[11.5px] font-medium text-fg-muted transition-colors hover:bg-danger/10 hover:text-danger"
                  >
                    <X size={12} /> Reject
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
