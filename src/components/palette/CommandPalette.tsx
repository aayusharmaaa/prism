"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "@/store/workspace";
import { useAgent } from "@/store/agent";
import { cn } from "@/lib/format";
import { restartTour } from "@/components/onboarding/Tour";
import {
  BookOpen,
  Bot,
  Brain,
  Compass,
  CornerDownLeft,
  FilePlus2,
  FileText,
  GitPullRequestArrow,
  Moon,
  PanelLeft,
  PanelRight,
  Plug,
  RotateCcw,
  Search,
  Settings,
  Sun,
} from "lucide-react";

interface Item {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: typeof FileText;
  run: () => void;
}

export function CommandPalette() {
  const store = useWorkspace();
  const {
    paletteMode,
    setPalette,
    documents,
    sources,
    openDocument,
    openSource,
    openPane,
    setSidebar,
    toggleSidebar,
    setAgentOpen,
    createDocument,
    theme,
    setTheme,
    agentOpen,
  } = store;
  const { setMode, newThread } = useAgent();

  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const open = paletteMode !== "closed";

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, paletteMode]);

  const items = useMemo<Item[]>(() => {
    const files: Item[] = [
      ...documents.map((d) => ({
        id: `doc:${d.id}`,
        label: d.title,
        hint: d.kind === "memory" ? "Product memory" : d.kind.toUpperCase(),
        group: "Documents",
        icon: d.kind === "memory" ? Brain : FileText,
        run: () => openDocument(d.id),
      })),
      ...sources.map((s) => ({
        id: `src:${s.id}`,
        label: s.title,
        hint: s.origin,
        group: "Sources",
        icon: BookOpen,
        run: () => openSource(s.id),
      })),
    ];

    if (paletteMode === "files") return files;

    const commands: Item[] = [
      {
        id: "cmd:new-prd",
        label: "New PRD",
        hint: "Creates from the PRD template",
        group: "Create",
        icon: FilePlus2,
        run: () => void createDocument("prd", "Untitled PRD"),
      },
      {
        id: "cmd:new-onepager",
        label: "New one-pager",
        group: "Create",
        icon: FilePlus2,
        run: () => void createDocument("onepager", "Untitled one-pager"),
      },
      {
        id: "cmd:new-chat",
        label: "New chat",
        group: "Agent",
        icon: Bot,
        run: () => {
          newThread();
          setAgentOpen(true);
        },
      },
      {
        id: "cmd:mode-ask",
        label: "Agent: Ask mode",
        hint: "Read-only",
        group: "Agent",
        icon: Bot,
        run: () => {
          setMode("ask");
          setAgentOpen(true);
        },
      },
      {
        id: "cmd:mode-agent",
        label: "Agent: Agent mode",
        hint: "Proposes changes",
        group: "Agent",
        icon: Bot,
        run: () => {
          setMode("agent");
          setAgentOpen(true);
        },
      },
      {
        id: "cmd:mode-plan",
        label: "Agent: Plan mode",
        hint: "Research, then a plan",
        group: "Agent",
        icon: Bot,
        run: () => {
          setMode("plan");
          setAgentOpen(true);
        },
      },
      {
        id: "cmd:review",
        label: "Open review queue",
        group: "Navigate",
        icon: GitPullRequestArrow,
        run: () => setSidebar("review"),
      },
      {
        id: "cmd:search",
        label: "Search workspace",
        group: "Navigate",
        icon: Search,
        run: () => setSidebar("search"),
      },
      {
        id: "cmd:integrations",
        label: "Open integrations",
        group: "Navigate",
        icon: Plug,
        run: () => openPane("integrations"),
      },
      {
        id: "cmd:settings",
        label: "Open workspace settings",
        group: "Navigate",
        icon: Settings,
        run: () => openPane("settings"),
      },
      {
        id: "cmd:toggle-sidebar",
        label: "Toggle sidebar",
        hint: "⌘B",
        group: "View",
        icon: PanelLeft,
        run: toggleSidebar,
      },
      {
        id: "cmd:toggle-agent",
        label: "Toggle agent panel",
        hint: "⌘J",
        group: "View",
        icon: PanelRight,
        run: () => setAgentOpen(!agentOpen),
      },
      {
        id: "cmd:tour",
        label: "Replay the product tour",
        group: "View",
        icon: Compass,
        run: restartTour,
      },
      {
        id: "cmd:reset",
        label: "Reset demo data",
        hint: "owner only · destructive",
        group: "View",
        icon: RotateCcw,
        run: async () => {
          if (
            !window.confirm(
              "Reset the workspace to its seeded state?\n\nThis permanently deletes every document edit, uploaded source, comment, version, share link, and chat. It cannot be undone.",
            )
          ) {
            return;
          }
          const state = useWorkspace.getState();
          const res = await fetch(`/api/w/${state.slug}/reset`, { method: "POST" });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            state.toast("error", data.error ?? "Reset failed");
            return;
          }
          window.location.reload();
        },
      },
      {
        id: "cmd:theme",
        label: theme === "dark" ? "Switch to light theme" : "Switch to dark theme",
        group: "View",
        icon: theme === "dark" ? Sun : Moon,
        run: () => setTheme(theme === "dark" ? "light" : "dark"),
      },
    ];

    return [...commands, ...files];
  }, [
    paletteMode,
    documents,
    sources,
    openDocument,
    openSource,
    openPane,
    setSidebar,
    toggleSidebar,
    setAgentOpen,
    createDocument,
    setMode,
    newThread,
    theme,
    setTheme,
    agentOpen,
  ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 40);
    return items
      .map((item) => ({ item, score: fuzzyScore(item.label.toLowerCase(), q) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 40)
      .map((r) => r.item);
  }, [items, query]);

  useEffect(() => setIndex(0), [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-idx="${index}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [index]);

  if (!open) return null;

  const choose = (item: Item | undefined) => {
    if (!item) return;
    item.run();
    setPalette("closed");
  };

  let lastGroup = "";

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center bg-black/45 pt-[12vh] backdrop-blur-[1px]"
      onMouseDown={() => setPalette("closed")}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="animate-pop w-[min(620px,92vw)] overflow-hidden rounded-xl border border-line-strong bg-elevated shadow-2xl shadow-black/60"
      >
        <div className="flex items-center gap-2 border-b border-line px-3.5 py-2.5">
          <Search size={14} className="shrink-0 text-fg-dim" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, filtered.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              }
              if (e.key === "Enter") {
                e.preventDefault();
                choose(filtered[index]);
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setPalette("closed");
              }
            }}
            placeholder={
              paletteMode === "files"
                ? "Go to document or source…"
                : "Type a command…"
            }
            className="flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-fg-dim"
          />
          <button
            onClick={() =>
              setPalette(paletteMode === "files" ? "commands" : "files")
            }
            className="rounded border border-line px-1.5 py-0.5 text-[10px] text-fg-dim transition-colors hover:text-fg"
          >
            {paletteMode === "files" ? "⌘⇧P commands" : "⌘P files"}
          </button>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-1">
          {!filtered.length && (
            <p className="px-3.5 py-4 text-center text-[12.5px] text-fg-dim">
              Nothing matches “{query}”.
            </p>
          )}
          {filtered.map((item, i) => {
            const showGroup = item.group !== lastGroup;
            lastGroup = item.group;
            return (
              <div key={item.id}>
                {showGroup && (
                  <div className="px-3.5 pb-1 pt-2 text-[9.5px] font-semibold uppercase tracking-wider text-fg-dim">
                    {item.group}
                  </div>
                )}
                <button
                  data-idx={i}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => choose(item)}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3.5 py-1.5 text-left",
                    i === index ? "bg-accent-soft" : "hover:bg-hover",
                  )}
                >
                  <item.icon size={13} className="shrink-0 text-fg-dim" />
                  <span className="min-w-0 flex-1 truncate text-[12.5px]">
                    {item.label}
                  </span>
                  {item.hint && (
                    <span className="shrink-0 text-[10px] text-fg-dim">
                      {item.hint}
                    </span>
                  )}
                  {i === index && (
                    <CornerDownLeft size={11} className="shrink-0 text-fg-dim" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Subsequence match with bonuses for prefix and word-boundary hits. */
function fuzzyScore(text: string, query: string): number {
  if (text.includes(query)) {
    return 1000 - text.indexOf(query) + (text.startsWith(query) ? 500 : 0);
  }
  let score = 0;
  let ti = 0;
  for (const ch of query) {
    const found = text.indexOf(ch, ti);
    if (found === -1) return 0;
    score += found === ti ? 6 : found > 0 && text[found - 1] === " " ? 4 : 1;
    ti = found + 1;
  }
  return score;
}
