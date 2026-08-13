"use client";

import { useWorkspace, type SidebarView } from "@/store/workspace";
import { cn } from "@/lib/format";
import {
  Activity,
  Files,
  GitPullRequestArrow,
  MessagesSquare,
  Plug,
  Search,
  Settings,
} from "lucide-react";

const VIEWS: { id: SidebarView; icon: typeof Files; label: string; key: string }[] = [
  { id: "explorer", icon: Files, label: "Workspace", key: "⌘B" },
  { id: "search", icon: Search, label: "Search", key: "⌘⇧F" },
  { id: "review", icon: GitPullRequestArrow, label: "Review queue", key: "" },
  { id: "activity", icon: Activity, label: "Team activity", key: "" },
  { id: "chats", icon: MessagesSquare, label: "Chats", key: "" },
  { id: "integrations", icon: Plug, label: "Integrations", key: "" },
];

export function ActivityBar() {
  const { sidebarView, sidebarOpen, setSidebar, pendingChanges, openPane, integrations } =
    useWorkspace();

  const unhealthy = integrations.filter(
    (i) => i.status === "degraded" || i.status === "error",
  ).length;

  return (
    <nav className="flex w-11 shrink-0 flex-col items-center border-r border-line bg-app py-1.5">
      {VIEWS.map((v) => {
        const active = sidebarOpen && sidebarView === v.id;
        const badge =
          v.id === "review"
            ? pendingChanges.length
            : v.id === "integrations"
              ? unhealthy
              : 0;
        return (
          <button
            key={v.id}
            onClick={() => setSidebar(v.id)}
            title={`${v.label}${v.key ? ` (${v.key})` : ""}`}
            className={cn(
              "relative grid h-10 w-11 place-items-center transition-colors",
              active ? "text-fg" : "text-fg-dim hover:text-fg-muted",
            )}
          >
            {active && (
              <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-accent" />
            )}
            <v.icon size={18} strokeWidth={1.6} />
            {badge > 0 && (
              <span
                className={cn(
                  "absolute right-1.5 top-1.5 grid h-3.5 min-w-3.5 place-items-center rounded-full px-1 text-[9px] font-bold text-white",
                  v.id === "review" ? "bg-accent" : "bg-warn text-black",
                )}
              >
                {badge}
              </span>
            )}
          </button>
        );
      })}

      <button
        onClick={() => openPane("settings")}
        title="Workspace settings"
        className="mt-auto grid h-10 w-11 place-items-center text-fg-dim transition-colors hover:text-fg-muted"
      >
        <Settings size={18} strokeWidth={1.6} />
      </button>
    </nav>
  );
}
