"use client";

import { useWorkspace, type Tab } from "@/store/workspace";
import { cn } from "@/lib/format";
import {
  BarChart3,
  Brain,
  FileText,
  GitPullRequestArrow,
  ListTodo,
  MessageSquareQuote,
  Plug,
  Settings,
  X,
} from "lucide-react";

function TabIcon({ tab }: { tab: Tab }) {
  const { documents } = useWorkspace();
  const size = 12;
  switch (tab.kind) {
    case "document": {
      const doc = documents.find((d) => d.id === tab.entityId);
      return doc?.kind === "memory" ? (
        <Brain size={size} className="text-accent" />
      ) : (
        <FileText size={size} className="text-fg-dim" />
      );
    }
    case "source":
      return <MessageSquareQuote size={size} className="text-fg-dim" />;
    case "integrations":
      return <Plug size={size} className="text-fg-dim" />;
    case "settings":
      return <Settings size={size} className="text-fg-dim" />;
    case "review":
      return <GitPullRequestArrow size={size} className="text-fg-dim" />;
    case "tickets":
      return <ListTodo size={size} className="text-fg-dim" />;
    default:
      return <BarChart3 size={size} className="text-fg-dim" />;
  }
}

export function EditorTabs() {
  const { tabs, activeTab, setActiveTab, closeTab, drafts, pendingChanges } =
    useWorkspace();

  if (!tabs.length) return null;

  return (
    <div className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-line bg-app no-scrollbar">
      {tabs.map((tab) => {
        const active = tab.key === activeTab;
        const dirty = tab.entityId ? drafts[tab.entityId] !== undefined : false;
        const pending =
          tab.kind === "document" &&
          pendingChanges.some((c) => c.documentId === tab.entityId);

        return (
          <div
            key={tab.key}
            role="tab"
            aria-selected={active}
            onMouseDown={(e) => {
              // Middle-click closes, as in every editor.
              if (e.button === 1) {
                e.preventDefault();
                closeTab(tab.key);
              }
            }}
            className={cn(
              "group relative flex min-w-0 max-w-[220px] shrink-0 cursor-pointer items-center gap-1.5 border-r border-line px-3 transition-colors",
              active
                ? "bg-editor text-fg"
                : "bg-app text-fg-dim hover:bg-hover hover:text-fg-muted",
            )}
          >
            {active && (
              <span className="absolute inset-x-0 top-0 h-px bg-accent" />
            )}
            <button
              onClick={() => setActiveTab(tab.key)}
              className="flex min-w-0 flex-1 items-center gap-1.5"
            >
              <TabIcon tab={tab} />
              <span className="truncate text-[12px]">{tab.title}</span>
              {pending && (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              )}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.key);
              }}
              title="Close"
              className={cn(
                "grid h-4 w-4 shrink-0 place-items-center rounded transition-colors hover:bg-active",
                dirty ? "text-fg-muted" : "opacity-0 group-hover:opacity-100",
              )}
            >
              {dirty ? (
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
              ) : (
                <X size={11} />
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
