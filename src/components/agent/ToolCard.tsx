"use client";

import { useState } from "react";
import { cn } from "@/lib/format";
import type { ToolInvocation } from "@/lib/types";
import {
  Brain,
  ChevronRight,
  FileEdit,
  FilePlus2,
  ListTodo,
  Loader2,
  Quote,
  Search,
  TriangleAlert,
  Check,
  BookOpen,
} from "lucide-react";

const ICONS: Record<string, typeof Search> = {
  search_workspace: Search,
  read_entity: BookOpen,
  cite: Quote,
  propose_edit: FileEdit,
  create_document: FilePlus2,
  draft_tickets: ListTodo,
  remember: Brain,
};

const VERB: Record<string, string> = {
  search_workspace: "Searched",
  read_entity: "Read",
  cite: "Cited",
  propose_edit: "Proposed edit",
  create_document: "Created",
  draft_tickets: "Drafted tickets",
  remember: "Updated memory",
};

/** Compact, expandable record of one tool call — the agent's audit trail. */
export function ToolCard({ tool }: { tool: ToolInvocation }) {
  const [open, setOpen] = useState(false);
  const Icon = ICONS[tool.name] ?? Search;
  const running = tool.status === "running";
  const failed = tool.status === "error";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border bg-elevated/60 transition-colors",
        failed ? "border-danger/35" : "border-line",
      )}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left"
      >
        {running ? (
          <Loader2 size={11} className="shrink-0 animate-spin text-accent" />
        ) : failed ? (
          <TriangleAlert size={11} className="shrink-0 text-danger" />
        ) : (
          <Icon size={11} className="shrink-0 text-fg-dim" />
        )}

        <span className="shrink-0 text-[11px] font-medium text-fg-muted">
          {VERB[tool.name] ?? tool.name}
        </span>
        <span
          className={cn(
            "truncate text-[11px]",
            failed ? "text-danger" : "text-fg-dim",
          )}
        >
          {tool.summary}
        </span>

        {!running && (
          <>
            {typeof tool.durationMs === "number" && (
              <span className="ml-auto shrink-0 font-mono text-[9.5px] text-fg-dim">
                {tool.durationMs < 1000
                  ? `${tool.durationMs}ms`
                  : `${(tool.durationMs / 1000).toFixed(1)}s`}
              </span>
            )}
            <ChevronRight
              size={11}
              className={cn(
                "shrink-0 text-fg-dim transition-transform",
                open && "rotate-90",
              )}
            />
          </>
        )}
        {running && (
          <span className="ml-auto shrink-0 text-[9.5px] text-accent">running</span>
        )}
      </button>

      {open && !running && (
        <div className="border-t border-line bg-app px-2 py-1.5">
          <Field label="Input" value={tool.input} />
          {tool.result !== undefined && <Field label="Result" value={tool.result} />}
          {failed && (
            <div className="mt-1 flex gap-1.5 rounded border border-danger/25 bg-danger/5 p-1.5 text-[10.5px] leading-snug text-danger">
              <TriangleAlert size={11} className="mt-px shrink-0" />
              <span>
                The error was returned to the model, which can correct and retry.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: unknown }) {
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2) ?? "";
  const truncated = text.length > 1400 ? `${text.slice(0, 1400)}\n… truncated` : text;
  return (
    <div className="mb-1 last:mb-0">
      <div className="mb-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-fg-dim">
        {label}
      </div>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[10.5px] leading-snug text-fg-muted">
        {truncated}
      </pre>
    </div>
  );
}

/** Green tick shown once a batch of tool calls completes without error. */
export function ToolsDone({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-1.5 text-[10.5px] text-fg-dim">
      <Check size={10} className="text-ok" />
      {count} tool call{count === 1 ? "" : "s"}
    </div>
  );
}
