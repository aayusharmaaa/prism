"use client";

import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useWorkspace } from "@/store/workspace";
import { useAgent } from "@/store/agent";
import { parseCsv } from "@/lib/csv";
import { SOURCE_KIND_LABEL, cn, relativeTime } from "@/lib/format";
import { AtSign, Lock } from "lucide-react";

/** Read-only evidence view. Sources are never editable — that's the point. */
export function SourceViewer({ sourceId }: { sourceId: string }) {
  const source = useWorkspace((s) => s.sources.find((x) => x.id === sourceId));
  const setAgentOpen = useWorkspace((s) => s.setAgentOpen);
  const addAttachment = useAgent((s) => s.addAttachment);

  if (!source) {
    return (
      <div className="grid flex-1 place-items-center text-[13px] text-fg-dim">
        Source not found.
      </div>
    );
  }

  // `columns` is structural metadata already rendered as the table's header
  // row, and stringifying it produces "[object Object]". Skip it here.
  const HIDDEN_META = new Set(["columns", "format"]);
  const meta = Object.entries(source.meta).filter(
    ([k, v]) =>
      !HIDDEN_META.has(k) &&
      v !== null &&
      v !== undefined &&
      v !== "" &&
      typeof v !== "object",
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-2">
        <Lock size={12} className="shrink-0 text-fg-dim" />
        <h1 className="min-w-0 flex-1 truncate text-[14px] font-semibold">
          {source.title}
        </h1>
        <span className="shrink-0 rounded border border-line px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-fg-dim">
          {SOURCE_KIND_LABEL[source.kind]}
        </span>
        <span className="shrink-0 text-[10.5px] text-fg-dim">
          {source.origin} · {relativeTime(source.capturedAt)}
        </span>
        <button
          onClick={() => {
            addAttachment(source.id);
            setAgentOpen(true);
            window.dispatchEvent(new CustomEvent("prism:focus-composer"));
          }}
          title="Add to chat"
          className="flex shrink-0 items-center gap-1 rounded border border-line px-2 py-1 text-[11.5px] text-fg-muted transition-colors hover:border-accent/50 hover:bg-accent-soft hover:text-fg"
        >
          <AtSign size={11} /> Add to chat
        </button>
      </div>

      {meta.length > 0 && (
        <div className="flex shrink-0 flex-wrap gap-x-4 gap-y-1 border-b border-line bg-app px-4 py-1.5">
          {meta.map(([k, v]) => (
            <span key={k} className="text-[10.5px]">
              <span className="text-fg-dim">{humanise(k)}: </span>
              <span className="font-medium text-fg-muted">{formatValue(k, v)}</span>
            </span>
          ))}
        </div>
      )}

      {source.meta?.format === "table" ? (
        <TableView content={source.content} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <article className="prose-prism mx-auto max-w-3xl pb-24">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {source.content}
            </ReactMarkdown>
          </article>
        </div>
      )}
    </div>
  );
}

/**
 * Spreadsheet view for tabular sources. Virtualisation would be overkill —
 * uploads are capped at 2 MB — but rows are still windowed so a 5k-row export
 * doesn't put 5k DOM nodes on screen at once.
 */
function TableView({ content }: { content: string }) {
  const [limit, setLimit] = useState(200);
  const parsed = useMemo(() => parseCsv(content), [content]);

  const numericCols = new Set(
    parsed.columns
      .map((c, i) => (c.type === "number" || c.type === "currency" ? i : -1))
      .filter((i) => i >= 0),
  );

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full border-collapse text-[11.5px]">
        <thead className="sticky top-0 z-10 bg-elevated">
          <tr>
            <th className="w-10 border-b border-r border-line px-2 py-1.5 text-right font-mono text-[10px] font-normal text-fg-dim">
              #
            </th>
            {parsed.headers.map((h, i) => (
              <th
                key={i}
                className="whitespace-nowrap border-b border-r border-line px-2.5 py-1.5 text-left font-semibold"
              >
                {h}
                <span className="ml-1.5 font-normal text-[9.5px] uppercase text-fg-dim">
                  {parsed.columns[i]?.type}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {parsed.rows.slice(0, limit).map((row, r) => (
            <tr key={r} className="hover:bg-hover">
              <td className="border-b border-r border-line px-2 py-1 text-right font-mono text-[10px] text-fg-dim">
                {r + 1}
              </td>
              {row.map((cell, c) => (
                <td
                  key={c}
                  className={cn(
                    "max-w-[320px] truncate border-b border-r border-line px-2.5 py-1",
                    numericCols.has(c)
                      ? "text-right font-mono tabular-nums"
                      : "text-fg-muted",
                  )}
                  title={cell}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex items-center gap-3 px-3 py-2 text-[11px] text-fg-dim">
        <span>
          Showing {Math.min(limit, parsed.rows.length).toLocaleString()} of{" "}
          {parsed.rows.length.toLocaleString()} rows · {parsed.headers.length}{" "}
          columns
        </span>
        {limit < parsed.rows.length && (
          <button
            onClick={() => setLimit((l) => l + 500)}
            className="rounded border border-line px-2 py-0.5 transition-colors hover:bg-hover hover:text-fg"
          >
            Show more
          </button>
        )}
        <span className="ml-auto italic">
          Ask the agent to pivot this — it can build a severity × frequency matrix
        </span>
      </div>
    </div>
  );
}

const humanise = (key: string) =>
  key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

function formatValue(key: string, value: unknown): string {
  if (typeof value === "number") {
    if (/arr|pipeline|revenue/i.test(key)) {
      return value >= 1000
        ? `$${(value / 1000).toFixed(0)}k`
        : `$${value.toLocaleString()}`;
    }
    return value.toLocaleString();
  }
  return String(value);
}
