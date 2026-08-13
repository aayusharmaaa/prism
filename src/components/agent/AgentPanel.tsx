"use client";

import { useWorkspace } from "@/store/workspace";
import { useAgent } from "@/store/agent";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";
import { cn } from "@/lib/format";
import type { AgentMode } from "@/lib/types";
import { Eye, ListChecks, Plus, Sparkles } from "lucide-react";

const MODES: {
  id: AgentMode;
  label: string;
  icon: typeof Eye;
  hint: string;
}[] = [
  {
    id: "ask",
    label: "Ask",
    icon: Eye,
    hint: "Read-only. Searches and cites, changes nothing.",
  },
  {
    id: "agent",
    label: "Agent",
    icon: Sparkles,
    hint: "Proposes edits, documents, and tickets for your review.",
  },
  {
    id: "plan",
    label: "Plan",
    icon: ListChecks,
    hint: "Researches first, then writes a plan you approve.",
  },
];

export function AgentPanel() {
  const role = useWorkspace((s) => s.role);
  const { mode, setMode, newThread, messages, streaming } = useAgent();

  return (
    <div className="flex h-full flex-col bg-panel">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line px-2">
        <div className="flex items-center gap-0.5 rounded-md border border-line p-0.5">
          {MODES.map((m) => {
            const disabled = role === "viewer" && m.id !== "ask";
            return (
              <button
                key={m.id}
                onClick={() => !disabled && setMode(m.id)}
                disabled={disabled}
                title={
                  disabled
                    ? "Viewers can only use Ask mode"
                    : `${m.label} — ${m.hint}`
                }
                className={cn(
                  "flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors",
                  mode === m.id
                    ? "bg-accent text-on-accent"
                    : "text-fg-dim hover:text-fg",
                  disabled && "cursor-not-allowed opacity-40",
                )}
              >
                <m.icon size={10} />
                {m.label}
              </button>
            );
          })}
        </div>

        <button
          onClick={newThread}
          disabled={streaming || !messages.length}
          title="New chat"
          className="ml-auto grid h-6 w-6 place-items-center rounded text-fg-dim transition-colors hover:bg-hover hover:text-fg disabled:opacity-30"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="shrink-0 border-b border-line px-3 py-1 text-[10.5px] leading-snug text-fg-dim">
        {MODES.find((m) => m.id === mode)?.hint}
      </div>

      <MessageList />
      <Composer />
    </div>
  );
}
