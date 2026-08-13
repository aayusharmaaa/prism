"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "@/store/workspace";
import { SidebarHeader } from "@/components/shell/Sidebar";
import { cn } from "@/lib/format";
import { FileText, Loader2, MessageSquareQuote, Search } from "lucide-react";

interface Hit {
  id: string;
  type: "document" | "source";
  title: string;
  line: number;
  excerpt: string;
}

/**
 * Client-side search across loaded content. Instant, and it can show line
 * numbers and multiple matches per file the way an editor's search does.
 */
export function SearchView() {
  const { documents, sources, openDocument, openSource } = useWorkspace();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 130);
    return () => clearTimeout(t);
  }, [query]);

  const results = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    if (q.length < 2) return [];

    const groups: { id: string; type: Hit["type"]; title: string; hits: Hit[] }[] = [];
    const scan = (
      id: string,
      type: Hit["type"],
      title: string,
      content: string,
    ) => {
      const hits: Hit[] = [];
      content.split("\n").forEach((line, i) => {
        const idx = line.toLowerCase().indexOf(q);
        if (idx === -1 || hits.length >= 6) return;
        const start = Math.max(0, idx - 28);
        hits.push({
          id,
          type,
          title,
          line: i + 1,
          excerpt: (start ? "…" : "") + line.slice(start, start + 130).trim(),
        });
      });
      if (hits.length) groups.push({ id, type, title, hits });
    };

    for (const d of documents) scan(d.id, "document", d.title, d.content);
    for (const s of sources) scan(s.id, "source", s.title, s.content);
    return groups;
  }, [debounced, documents, sources]);

  const total = results.reduce((n, g) => n + g.hits.length, 0);
  const searching = query !== debounced;

  return (
    <div className="flex h-full flex-col">
      <SidebarHeader title="Search" />

      <div className="px-2.5 pb-2">
        <div className="relative">
          <Search
            size={12}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-fg-dim"
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search workspace…"
            className="w-full rounded border border-line bg-app py-1.5 pl-7 pr-2 text-[12.5px] outline-none placeholder:text-fg-dim focus:border-accent"
          />
          {searching && (
            <Loader2
              size={12}
              className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-fg-dim"
            />
          )}
        </div>
        {debounced.length >= 2 && (
          <div className="px-0.5 pt-1.5 text-[10.5px] text-fg-dim">
            {total} result{total === 1 ? "" : "s"} in {results.length} file
            {results.length === 1 ? "" : "s"}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {results.map((g) => (
          <div key={g.id} className="mb-1">
            <button
              onClick={() =>
                g.type === "document" ? openDocument(g.id) : openSource(g.id)
              }
              className="flex w-full items-center gap-1.5 px-2.5 py-1 text-left transition-colors hover:bg-hover"
            >
              {g.type === "document" ? (
                <FileText size={12} className="shrink-0 text-fg-dim" />
              ) : (
                <MessageSquareQuote size={12} className="shrink-0 text-fg-dim" />
              )}
              <span className="truncate text-[12px] font-medium">{g.title}</span>
              <span className="ml-auto shrink-0 text-[10px] text-fg-dim">
                {g.hits.length}
              </span>
            </button>
            {g.hits.map((h, i) => (
              <button
                key={i}
                onClick={() =>
                  g.type === "document" ? openDocument(g.id) : openSource(g.id)
                }
                className="flex w-full gap-2 py-0.5 pl-7 pr-2.5 text-left transition-colors hover:bg-hover"
              >
                <span className="shrink-0 font-mono text-[10px] leading-[1.5] text-fg-dim">
                  {h.line}
                </span>
                <span className="truncate text-[11.5px] leading-[1.5] text-fg-muted">
                  <Highlight text={h.excerpt} term={debounced} />
                </span>
              </button>
            ))}
          </div>
        ))}

        {debounced.length >= 2 && !results.length && !searching && (
          <p className="px-3 pt-2 text-[12px] text-fg-dim">
            No matches for “{debounced}”.
          </p>
        )}
        {debounced.length < 2 && (
          <p className="px-3 pt-2 text-[11.5px] leading-relaxed text-fg-dim">
            Searches document and source contents. The agent runs the same
            search server-side with ranking when it needs evidence.
          </p>
        )}
      </div>
    </div>
  );
}

function Highlight({ text, term }: { text: string; term: string }) {
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if (idx === -1 || !term) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className={cn("rounded-sm bg-accent/30 text-fg")}>
        {text.slice(idx, idx + term.length)}
      </mark>
      {text.slice(idx + term.length)}
    </>
  );
}
