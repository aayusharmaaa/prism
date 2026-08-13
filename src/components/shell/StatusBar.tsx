"use client";

import { useWorkspace } from "@/store/workspace";
import { useAgent } from "@/store/agent";
import { cn } from "@/lib/format";
import {
  Bot,
  Check,
  GitPullRequestArrow,
  Loader2,
  Plug,
  TriangleAlert,
} from "lucide-react";

export function StatusBar() {
  const {
    documents,
    sources,
    pendingChanges,
    integrations,
    setSidebar,
    openPane,
    config,
    role,
    user,
  } = useWorkspace();
  const { streaming, mode, model } = useAgent();

  const unhealthy = integrations.filter(
    (i) => i.status === "degraded" || i.status === "error",
  );
  const modelLabel =
    config.models.find((m) => m.id === model)?.label ?? model;

  return (
    <footer className="flex h-6 shrink-0 items-center gap-3 border-t border-line bg-app px-2.5 text-[10.5px] text-fg-dim">
      <button
        onClick={() => setSidebar("review")}
        className={cn(
          "flex items-center gap-1 rounded px-1 transition-colors hover:bg-hover",
          pendingChanges.length && "text-accent",
        )}
      >
        <GitPullRequestArrow size={10} />
        {pendingChanges.length} pending
      </button>

      <button
        onClick={() => openPane("integrations")}
        className={cn(
          "flex items-center gap-1 rounded px-1 transition-colors hover:bg-hover",
          unhealthy.length ? "text-warn" : "",
        )}
      >
        {unhealthy.length ? <TriangleAlert size={10} /> : <Plug size={10} />}
        {unhealthy.length
          ? `${unhealthy.length} need attention`
          : `${integrations.filter((i) => i.status === "connected").length} connected`}
      </button>

      <span>
        {documents.length} docs · {sources.length} sources
      </span>

      <div className="ml-auto flex items-center gap-3">
        <span className="flex items-center gap-1">
          {streaming ? (
            <>
              <Loader2 size={10} className="animate-spin text-accent" />
              <span className="text-accent">Working…</span>
            </>
          ) : (
            <>
              <Bot size={10} />
              {mode}
            </>
          )}
        </span>

        <span
          className="flex items-center gap-1"
          title={
            config.liveModel
              ? "ANTHROPIC_API_KEY detected — live model"
              : "No API key — scripted demo agent with real tool calls"
          }
        >
          {config.liveModel ? (
            <Check size={10} className="text-ok" />
          ) : (
            <TriangleAlert size={10} className="text-warn" />
          )}
          {modelLabel}
          {!config.liveModel && " (demo)"}
        </span>

        <span>
          {user?.name} · {role}
        </span>
      </div>
    </footer>
  );
}
