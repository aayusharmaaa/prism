"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "@/store/workspace";
import { useAgent } from "@/store/agent";
import { cn } from "@/lib/format";
import { expand, matchSlash, parseSlash } from "@/lib/slash";
import { ArrowUp, AtSign, Slash, Square, X } from "lucide-react";

/** Chat input with @-mention autocomplete over documents and sources. */
export function Composer() {
  const { documents, sources, role } = useWorkspace();
  const {
    send,
    stop,
    streaming,
    attachments,
    removeAttachment,
    addAttachment,
    consumeInsert,
    pendingInsert,
    mode,
    setMode,
  } = useAgent();

  const [text, setText] = useState("");
  const [mention, setMention] = useState<{ query: string; at: number } | null>(null);
  const [highlight, setHighlight] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);

  // Slash commands only trigger from the very start of an empty-ish composer,
  // so a "/" mid-sentence stays a literal slash.
  const slashQuery = /^\/([a-z]*)$/i.exec(text)?.[1] ?? null;
  const slashMatches = slashQuery !== null ? matchSlash(slashQuery) : [];
  const slashOpen = slashQuery !== null && slashMatches.length > 0;

  const applySlash = (command: (typeof slashMatches)[number]) => {
    setText(`/${command.name} `);
    requestAnimationFrame(() => ref.current?.focus());
  };

  /* Cmd+L and "Edit with AI" push text in from elsewhere. */
  useEffect(() => {
    if (!pendingInsert) return;
    const insert = consumeInsert();
    if (!insert) return;
    setText((t) => (t ? `${t}\n${insert}` : insert));
    ref.current?.focus();
  }, [pendingInsert, consumeInsert]);

  useEffect(() => {
    const focus = () => ref.current?.focus();
    window.addEventListener("prism:focus-composer", focus);
    return () => window.removeEventListener("prism:focus-composer", focus);
  }, []);

  /* Autogrow */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [text]);

  const entities = useMemo(
    () => [
      ...documents.map((d) => ({ id: d.id, title: d.title, kind: "document" as const })),
      ...sources.map((s) => ({ id: s.id, title: s.title, kind: "source" as const })),
    ],
    [documents, sources],
  );

  const matches = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return entities
      .filter((e) => !q || e.title.toLowerCase().includes(q))
      .slice(0, 7);
  }, [mention, entities]);

  const onChange = (value: string) => {
    setText(value);
    const caret = ref.current?.selectionStart ?? value.length;
    const upto = value.slice(0, caret);
    const at = upto.lastIndexOf("@");
    // An @ only opens the picker at a word boundary and before any whitespace.
    if (at === -1 || (at > 0 && !/\s/.test(upto[at - 1]))) {
      setMention(null);
      return;
    }
    const query = upto.slice(at + 1);
    if (/\s/.test(query) || query.length > 40) {
      setMention(null);
      return;
    }
    setMention({ query, at });
    setHighlight(0);
  };

  const pick = (entity: { id: string; title: string }) => {
    if (!mention) return;
    const caret = ref.current?.selectionStart ?? text.length;
    const next =
      text.slice(0, mention.at) +
      `@[${entity.title}](${entity.id}) ` +
      text.slice(caret);
    setText(next);
    addAttachment(entity.id);
    setMention(null);
    requestAnimationFrame(() => ref.current?.focus());
  };

  const submit = () => {
    if (!text.trim() || streaming) return;

    // A slash command expands into a full prompt and may switch modes.
    const parsed = parseSlash(text);
    if (parsed) {
      setMode(parsed.command.mode);
      void send(expand(parsed.command, parsed.arg));
    } else {
      void send(text);
    }

    setText("");
    setMention(null);
  };

  const placeholder =
    role === "viewer"
      ? "Ask a question (viewers can't make changes)…"
      : mode === "plan"
        ? "What should I plan?"
        : mode === "ask"
          ? "Ask about your product…"
          : "Ask, or tell me what to change… (@ to reference)";

  return (
    <div className="shrink-0 border-t border-line bg-panel p-2">
      {attachments.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {attachments.map((id) => {
            const e = entities.find((x) => x.id === id);
            if (!e) return null;
            return (
              <span
                key={id}
                className="flex items-center gap-1 rounded border border-accent/40 bg-accent-soft px-1.5 py-px text-[10.5px] text-fg"
              >
                <AtSign size={9} className="text-accent" />
                <span className="max-w-[150px] truncate">{e.title}</span>
                <button
                  onClick={() => removeAttachment(id)}
                  className="text-fg-dim transition-colors hover:text-danger"
                >
                  <X size={9} />
                </button>
              </span>
            );
          })}
        </div>
      )}

      <div className="relative rounded-lg border border-line bg-editor transition-colors focus-within:border-accent/60">
        {slashOpen && (
          <div className="animate-pop absolute bottom-full left-0 z-40 mb-1 w-full overflow-hidden rounded-lg border border-line-strong bg-elevated shadow-2xl shadow-black/50">
            {slashMatches.map((c, i) => (
              <button
                key={c.name}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applySlash(c);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={cn(
                  "flex w-full items-center gap-2 px-2.5 py-1.5 text-left",
                  i === highlight ? "bg-accent-soft" : "hover:bg-hover",
                )}
              >
                <Slash size={10} className="shrink-0 text-accent" />
                <span className="shrink-0 font-mono text-[12px] font-medium">
                  /{c.name}
                </span>
                <span className="truncate text-[11px] text-fg-dim">{c.hint}</span>
                <span className="ml-auto shrink-0 rounded border border-line px-1 text-[9px] uppercase text-fg-dim">
                  {c.mode}
                </span>
              </button>
            ))}
          </div>
        )}

        {mention && matches.length > 0 && (
          <div className="animate-pop absolute bottom-full left-0 z-40 mb-1 max-h-56 w-full overflow-y-auto rounded-lg border border-line-strong bg-elevated shadow-2xl shadow-black/50">
            {matches.map((m, i) => (
              <button
                key={m.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(m);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={cn(
                  "flex w-full items-center gap-2 px-2.5 py-1.5 text-left",
                  i === highlight ? "bg-accent-soft" : "hover:bg-hover",
                )}
              >
                <span
                  className={cn(
                    "shrink-0 rounded px-1 py-px text-[9px] font-semibold uppercase",
                    m.kind === "document"
                      ? "bg-accent/20 text-accent"
                      : "bg-hover text-fg-dim",
                  )}
                >
                  {m.kind === "document" ? "doc" : "src"}
                </span>
                <span className="truncate text-[12px]">{m.title}</span>
              </button>
            ))}
          </div>
        )}

        <textarea
          ref={ref}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (slashOpen) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlight((h) => (h + 1) % slashMatches.length);
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlight(
                  (h) => (h - 1 + slashMatches.length) % slashMatches.length,
                );
                return;
              }
              if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
                e.preventDefault();
                applySlash(slashMatches[Math.min(highlight, slashMatches.length - 1)]);
                return;
              }
            }
            if (mention && matches.length) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlight((h) => (h + 1) % matches.length);
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlight((h) => (h - 1 + matches.length) % matches.length);
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                pick(matches[highlight]);
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setMention(null);
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder={placeholder}
          className="max-h-[220px] w-full resize-none bg-transparent px-2.5 py-2 text-[12.5px] leading-relaxed outline-none placeholder:text-fg-dim"
        />

        <div className="flex items-center gap-1.5 px-2 pb-1.5">
          <span className="text-[10px] text-fg-dim">
            <kbd className="font-mono">↵</kbd> send ·{" "}
            <kbd className="font-mono">⇧↵</kbd> newline ·{" "}
            <kbd className="font-mono">@</kbd> reference ·{" "}
            <kbd className="font-mono">/</kbd> commands
          </span>
          {streaming ? (
            <button
              onClick={stop}
              className="ml-auto flex items-center gap-1 rounded border border-line px-2 py-1 text-[11px] text-fg-muted transition-colors hover:bg-hover hover:text-fg"
            >
              <Square size={9} className="fill-current" /> Stop
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!text.trim()}
              className="ml-auto grid h-6 w-6 place-items-center rounded-md bg-accent text-on-accent transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ArrowUp size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
