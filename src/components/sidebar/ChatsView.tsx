"use client";

import { useWorkspace } from "@/store/workspace";
import { useAgent } from "@/store/agent";
import { SidebarHeader, SidebarIconButton } from "@/components/shell/Sidebar";
import { cn, relativeTime } from "@/lib/format";
import { MessageSquare, Plus, Trash2 } from "lucide-react";

const MODE_LABEL = { ask: "Ask", agent: "Agent", plan: "Plan" } as const;

export function ChatsView() {
  const { threads, slug, refresh, setAgentOpen } = useWorkspace();
  const { threadId, loadThread, newThread } = useAgent();

  const remove = async (id: string) => {
    await fetch(`/api/w/${slug}/threads/${id}`, { method: "DELETE" });
    if (useAgent.getState().threadId === id) newThread();
    void refresh("all");
  };

  return (
    <div className="flex h-full flex-col">
      <SidebarHeader
        title="Chats"
        actions={
          <SidebarIconButton
            onClick={() => {
              newThread();
              setAgentOpen(true);
            }}
            title="New chat"
          >
            <Plus size={14} />
          </SidebarIconButton>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-4">
        {!threads.length && (
          <p className="px-1.5 pt-3 text-[11.5px] leading-relaxed text-fg-dim">
            No conversations yet. Chats persist per workspace, so anyone on the
            team can pick up where you left off.
          </p>
        )}

        {threads.map((t) => (
          <div
            key={t.id}
            className={cn(
              "group flex items-start gap-1.5 rounded-md px-2 py-1.5 transition-colors",
              threadId === t.id ? "bg-accent-soft" : "hover:bg-hover",
            )}
          >
            <button
              onClick={() => {
                void loadThread(t.id);
                setAgentOpen(true);
              }}
              className="min-w-0 flex-1 text-left"
            >
              <div className="flex items-center gap-1.5">
                <MessageSquare
                  size={11}
                  className={cn(
                    "shrink-0",
                    threadId === t.id ? "text-accent" : "text-fg-dim",
                  )}
                />
                <span className="truncate text-[12px] text-fg">{t.title}</span>
              </div>
              <div className="mt-0.5 pl-[17px] text-[10px] text-fg-dim">
                {MODE_LABEL[t.mode]} · {relativeTime(t.updatedAt)}
              </div>
            </button>
            <button
              onClick={() => void remove(t.id)}
              title="Delete chat"
              className="hidden shrink-0 rounded p-0.5 text-fg-dim transition-colors hover:text-danger group-hover:block"
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
