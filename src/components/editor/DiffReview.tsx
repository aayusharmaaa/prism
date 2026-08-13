"use client";

import { useMemo, useState } from "react";
import { applyHunks, computeDiff, type DiffLine, type Hunk } from "@/lib/diff";
import { cn } from "@/lib/format";
import type { ProposedChange } from "@/lib/types";
import { Bot, Check, CheckCheck, Sparkles, Undo2, X } from "lucide-react";

/**
 * Cursor-style diff review.
 *
 * Hunks start accepted — the agent's proposal is the default and the user
 * subtracts from it. Rejecting individual hunks and then accepting writes the
 * merged result, so partial acceptance is a first-class outcome rather than
 * an all-or-nothing choice.
 */
export function DiffReview({
  change,
  onResolve,
  readOnly,
}: {
  change: ProposedChange;
  onResolve: (action: "accept" | "reject", content: string) => void;
  readOnly?: boolean;
}) {
  const diff = useMemo(
    () => computeDiff(change.before ?? "", change.after),
    [change.before, change.after],
  );

  const [accepted, setAccepted] = useState<Set<string>>(
    () => new Set(diff.hunks.map((h) => h.id)),
  );

  const merged = useMemo(() => applyHunks(diff, accepted), [diff, accepted]);
  const allOn = accepted.size === diff.hunks.length;
  const noneOn = accepted.size === 0;

  const toggle = (id: string) =>
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex h-full flex-col bg-editor">
      {/* Review bar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-accent/25 bg-accent-soft px-4 py-2.5">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          {change.createdBy === "agent" ? (
            <Bot size={14} className="mt-px shrink-0 text-accent" />
          ) : (
            <Sparkles size={14} className="mt-px shrink-0 text-accent" />
          )}
          <div className="min-w-0">
            <p className="text-[12.5px] font-medium leading-snug text-fg">
              {change.summary}
            </p>
            <p className="mt-0.5 font-mono text-[10.5px] text-fg-dim">
              <span className="text-add">+{diff.added}</span>{" "}
              <span className="text-del">−{diff.removed}</span> ·{" "}
              {accepted.size}/{diff.hunks.length} hunk
              {diff.hunks.length === 1 ? "" : "s"} accepted
            </p>
          </div>
        </div>

        {!readOnly && (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={() =>
                setAccepted(
                  allOn ? new Set() : new Set(diff.hunks.map((h) => h.id)),
                )
              }
              className="rounded border border-line px-2 py-1 text-[11.5px] text-fg-muted transition-colors hover:bg-hover hover:text-fg"
            >
              {allOn ? "Deselect all" : "Select all"}
            </button>
            <button
              onClick={() => onResolve("reject", change.before ?? "")}
              className="flex items-center gap-1 rounded border border-line px-2.5 py-1 text-[11.5px] font-medium text-fg-muted transition-colors hover:border-danger/50 hover:bg-danger/10 hover:text-danger"
            >
              <X size={12} /> Reject all
            </button>
            <button
              onClick={() => onResolve("accept", merged)}
              disabled={noneOn}
              title={
                noneOn
                  ? "No hunks selected — reject instead"
                  : allOn
                    ? "Apply every change"
                    : `Apply ${accepted.size} of ${diff.hunks.length} hunks`
              }
              className="flex items-center gap-1 rounded bg-accent px-2.5 py-1 text-[11.5px] font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              <CheckCheck size={12} />
              {allOn ? "Accept all" : `Accept ${accepted.size}`}
            </button>
          </div>
        )}
      </div>

      {/* Hunks */}
      <div className="min-h-0 flex-1 overflow-auto py-3">
        {!diff.hunks.length && (
          <p className="px-5 text-[12.5px] text-fg-dim">
            This change produces no textual difference.
          </p>
        )}
        {diff.hunks.map((hunk, i) => (
          <HunkBlock
            key={hunk.id}
            hunk={hunk}
            index={i}
            accepted={accepted.has(hunk.id)}
            onToggle={() => toggle(hunk.id)}
            readOnly={readOnly}
          />
        ))}
      </div>
    </div>
  );
}

function HunkBlock({
  hunk,
  index,
  accepted,
  onToggle,
  readOnly,
}: {
  hunk: Hunk;
  index: number;
  accepted: boolean;
  onToggle: () => void;
  readOnly?: boolean;
}) {
  return (
    <div
      className={cn(
        "group mx-3 mb-3 overflow-hidden rounded-lg border transition-colors",
        accepted ? "border-line-strong" : "border-line opacity-55",
      )}
    >
      <div className="flex items-center gap-2 border-b border-line bg-elevated px-3 py-1.5">
        <span className="font-mono text-[10.5px] text-fg-dim">
          Hunk {index + 1} · line {hunk.beforeStart}
        </span>
        <span className="font-mono text-[10.5px]">
          <span className="text-add">+{hunk.added}</span>{" "}
          <span className="text-del">−{hunk.removed}</span>
        </span>
        {!readOnly && (
          <button
            onClick={onToggle}
            className={cn(
              "ml-auto flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
              accepted
                ? "text-ok hover:bg-ok/10"
                : "text-fg-dim hover:bg-hover hover:text-fg",
            )}
          >
            {accepted ? (
              <>
                <Check size={11} /> Accepted
              </>
            ) : (
              <>
                <Undo2 size={11} /> Rejected
              </>
            )}
          </button>
        )}
      </div>

      <div className="overflow-x-auto bg-app font-mono text-[11.5px] leading-[1.55]">
        {hunk.lines.map((line, i) => (
          <DiffRow key={i} line={line} dimmed={!accepted} />
        ))}
      </div>
    </div>
  );
}

function DiffRow({ line, dimmed }: { line: DiffLine; dimmed: boolean }) {
  const bg =
    line.type === "add"
      ? "bg-add/10"
      : line.type === "del"
        ? "bg-del/10"
        : "";

  return (
    <div className={cn("flex min-w-max", bg, dimmed && "grayscale")}>
      <span className="w-10 shrink-0 select-none pr-2 text-right text-fg-dim/60">
        {line.beforeNo ?? ""}
      </span>
      <span className="w-10 shrink-0 select-none pr-2 text-right text-fg-dim/60">
        {line.afterNo ?? ""}
      </span>
      <span
        className={cn(
          "w-4 shrink-0 select-none text-center",
          line.type === "add" && "text-add",
          line.type === "del" && "text-del",
          line.type === "context" && "text-transparent",
        )}
      >
        {line.type === "add" ? "+" : line.type === "del" ? "−" : " "}
      </span>
      <span className="whitespace-pre pr-4 text-fg">
        {line.words ? (
          line.words.map((w, i) => (
            <span
              key={i}
              className={cn(
                w.changed &&
                  (line.type === "add"
                    ? "rounded-sm bg-add/30"
                    : "rounded-sm bg-del/30"),
              )}
            >
              {w.text}
            </span>
          ))
        ) : (
          <>{line.text || " "}</>
        )}
      </span>
    </div>
  );
}
