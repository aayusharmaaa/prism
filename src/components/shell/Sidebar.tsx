"use client";

import { useWorkspace } from "@/store/workspace";
import { Explorer } from "@/components/sidebar/Explorer";
import { SearchView } from "@/components/sidebar/SearchView";
import { ReviewQueue } from "@/components/sidebar/ReviewQueue";
import { ChatsView } from "@/components/sidebar/ChatsView";
import { ActivityView } from "@/components/sidebar/ActivityView";
import { IntegrationsView } from "@/components/sidebar/IntegrationsView";

export function Sidebar() {
  const view = useWorkspace((s) => s.sidebarView);

  return (
    <div className="flex h-full flex-col">
      {view === "explorer" && <Explorer />}
      {view === "search" && <SearchView />}
      {view === "review" && <ReviewQueue />}
      {view === "activity" && <ActivityView />}
      {view === "chats" && <ChatsView />}
      {view === "integrations" && <IntegrationsView />}
    </div>
  );
}

/** Shared header used by every sidebar view. */
export function SidebarHeader({
  title,
  actions,
}: {
  title: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex h-8 shrink-0 items-center justify-between pl-3 pr-1.5">
      <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-fg-dim">
        {title}
      </h2>
      <div className="flex items-center gap-0.5">{actions}</div>
    </div>
  );
}

export function SidebarIconButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="grid h-6 w-6 place-items-center rounded text-fg-dim transition-colors hover:bg-hover hover:text-fg"
    >
      {children}
    </button>
  );
}
