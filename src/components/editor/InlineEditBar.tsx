"use client";

import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/store/workspace";
import { useAgent } from "@/store/agent";
import { computeDiff } from "@/lib/diff";
import { cn } from "@/lib/format";
import { ArrowUp, Check, Loader2, Sparkles, X } from "lucide-react";

const SUGGESTIONS = [
  "Make this shorter",
  "Turn this into bullets",
  "Make this a table",
  "Add an open question",
  "Ground this in evidence",
];

/**
 * Cmd+K. Takes the current selection, streams a rewrite, and shows the result
 * as an inline diff the user accepts or rejects — the same review contract as
 * the agent's edits, so there is only one mental model for AI changes.
 */
export function InlineEditBar({
  documentId,
  selection,
  onAccept,
  onClose,
}: {
  documentId: string;
  selection: string;
  onAccept: (replacement: string) => void;
  onClose: () => void;
}) {
  const slug = useWorkspace((s) => s.slug);
  const model = useAgent((s) => s.model);

  const [instruction, setInstruction] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    return () => abortRef.current?.abort();
  }, []);

  const run = async (text: string) => {
    const prompt = text.trim();
    if (!prompt || streaming) return;

    setStreaming(true);
    setResult("");
    setError(null);
    abortRef.current = new AbortController();

    try {
      const res = await fetch(`/api/w/${slug}/inline-edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, selection, instruction: prompt, model }),
        signal: abortRef.current.signal,
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        setError(err.error ?? `Request failed (${res.status})`);
        setResult(null);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          try {
            const payload = JSON.parse(line.slice(6)) as {
              delta?: string;
              error?: string;
              done?: boolean;
            };
            if (payload.error) {
              setError(payload.error);
              continue;
            }
            if (payload.delta) {
              acc += payload.delta;
              setResult(acc);
            }
          } catch {
            /* skip malformed frame */
          }
        }
      }
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        setError(err instanceof Error ? err.message : "Inline edit failed");
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const diff = result && !streaming ? computeDiff(selection, result, 2) : null;

  return (
    <div className="animate-pop absolute inset-x-4 top-4 z-30 overflow-hidden rounded-lg border border-accent/40 bg-elevated shadow-2xl shadow-black/50">
      {/* Prompt row */}
      <div className="flex items-center gap-2 px-3 py-2">
        <Sparkles size={13} className="shrink-0 text-accent" />
        <input
          ref={inputRef}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void run(instruction);
            }
            if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
          placeholder={`Edit ${selection.length} selected characters…`}
          className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-fg-dim"
        />
        {streaming ? (
          <button
            onClick={() => abortRef.current?.abort()}
            className="rounded px-2 py-1 text-[11px] text-fg-muted transition-colors hover:bg-hover"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={() => void run(instruction)}
            disabled={!instruction.trim()}
            className="grid h-6 w-6 place-items-center rounded bg-accent text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-30"
          >
            <ArrowUp size={13} />
          </button>
        )}
        <button
          onClick={onClose}
          className="grid h-6 w-6 place-items-center rounded text-fg-dim transition-colors hover:bg-hover hover:text-fg"
        >
          <X size={13} />
        </button>
      </div>

      {/* Suggestions */}
      {!result && !streaming && !error && (
        <div className="flex flex-wrap gap-1.5 border-t border-line px-3 py-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => {
                setInstruction(s);
                void run(s);
              }}
              className="rounded border border-line px-2 py-0.5 text-[11px] text-fg-muted transition-colors hover:border-accent/50 hover:bg-accent-soft hover:text-fg"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="border-t border-danger/30 bg-danger/5 px-3 py-2 text-[11.5px] text-danger">
          {error}
        </div>
      )}

      {/* Streaming / result */}
      {(streaming || result) && (
        <div className="border-t border-line">
          <div className="max-h-[38vh] overflow-auto bg-app font-mono text-[11.5px] leading-[1.55]">
            {streaming ? (
              <div className="whitespace-pre-wrap px-3 py-2 text-fg">
                {result}
                <span className="caret" />
              </div>
            ) : (
              diff?.hunks.map((h) => (
                <div key={h.id}>
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
                      <span className="whitespace-pre-wrap break-words text-fg">
                        {line.words
                          ? line.words.map((w, j) => (
                              <span
                                key={j}
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
                          : line.text || " "}
                      </span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>

          {!streaming && result && (
            <div className="flex items-center gap-2 border-t border-line px-3 py-2">
              <span className="font-mono text-[10.5px] text-fg-dim">
                <span className="text-add">+{diff?.added ?? 0}</span>{" "}
                <span className="text-del">−{diff?.removed ?? 0}</span>
              </span>
              <div className="ml-auto flex gap-1.5">
                <button
                  onClick={() => {
                    setResult(null);
                    setInstruction("");
                    inputRef.current?.focus();
                  }}
                  className="rounded border border-line px-2 py-1 text-[11.5px] text-fg-muted transition-colors hover:bg-hover hover:text-fg"
                >
                  Try again
                </button>
                <button
                  onClick={onClose}
                  className="rounded border border-line px-2 py-1 text-[11.5px] text-fg-muted transition-colors hover:bg-hover hover:text-fg"
                >
                  Discard
                </button>
                <button
                  onClick={() => onAccept(result)}
                  className="flex items-center gap-1 rounded bg-accent px-2.5 py-1 text-[11.5px] font-medium text-on-accent transition-colors hover:bg-accent-hover"
                >
                  <Check size={12} /> Apply
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {streaming && !result && (
        <div className="flex items-center gap-2 border-t border-line px-3 py-2 text-[11.5px] text-fg-dim">
          <Loader2 size={12} className="animate-spin" /> Rewriting…
        </div>
      )}
    </div>
  );
}
