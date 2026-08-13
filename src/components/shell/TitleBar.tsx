"use client";

import { useState } from "react";
import { useWorkspace } from "@/store/workspace";
import { useAgent } from "@/store/agent";
import { Logo } from "./Logo";
import { avatarStyle, cn, initials } from "@/lib/format";
import {
  ChevronDown,
  Check,
  Moon,
  PanelRightClose,
  PanelRightOpen,
  Search,
  Sun,
  Zap,
} from "lucide-react";

export function TitleBar() {
  const {
    workspace,
    user,
    members,
    theme,
    setTheme,
    agentOpen,
    setAgentOpen,
    setPalette,
    config,
  } = useWorkspace();
  const { model, setModel } = useAgent();
  const [modelOpen, setModelOpen] = useState(false);

  const activeModel = config.models.find((m) => m.id === model);

  return (
    <header className="flex h-9 shrink-0 items-center gap-2 border-b border-line bg-app px-2.5">
      {/* Product identity, then the tenant. Kept visually distinct: without a
          separator the mark reads as the *workspace's* logo rather than the
          product's. */}
      <div className="flex shrink-0 items-center gap-2 pr-1">
        <Logo size={18} />
        <span className="text-[12.5px] font-semibold tracking-tight">Prism</span>

        <span aria-hidden className="h-3.5 w-px shrink-0 bg-line-strong" />

        {/* Tenant names are user-supplied, so cap and ellipsise rather than
            letting a long one push the rest of the bar off-screen. */}
        <span
          className="max-w-[180px] truncate text-[12.5px] text-fg-muted"
          title={`Workspace: ${workspace?.name ?? "none"}`}
        >
          {workspace?.name ?? "No workspace"}
        </span>
        <span className="shrink-0 rounded border border-line bg-elevated px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-fg-dim">
          {workspace?.plan ?? "trial"}
        </span>
      </div>

      {/* Quick open */}
      <button
        onClick={() => setPalette("files")}
        className="group mx-auto flex h-6 w-[min(420px,38vw)] items-center gap-2 rounded-md border border-line bg-elevated px-2.5 text-[11.5px] text-fg-dim transition-colors hover:border-line-strong hover:text-fg-muted"
      >
        <Search size={12} />
        <span>Search documents, sources, commands…</span>
        <kbd className="ml-auto rounded border border-line px-1 py-px font-mono text-[9.5px] text-fg-dim">
          ⌘P
        </kbd>
      </button>

      {/* Model picker */}
      <div className="relative">
        <button
          onClick={() => setModelOpen((v) => !v)}
          onBlur={() => setTimeout(() => setModelOpen(false), 140)}
          className="flex h-6 items-center gap-1.5 rounded-md border border-line bg-elevated px-2 text-[11.5px] text-fg-muted transition-colors hover:text-fg"
        >
          <Zap size={11} className={config.liveModel ? "text-accent" : "text-fg-dim"} />
          {activeModel?.label ?? "Model"}
          <ChevronDown size={11} className="text-fg-dim" />
        </button>
        {modelOpen && (
          <div className="animate-pop absolute right-0 top-7 z-50 w-56 overflow-hidden rounded-lg border border-line-strong bg-elevated shadow-2xl shadow-black/40">
            {config.models.map((m) => (
              <button
                key={m.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setModel(m.id);
                  setModelOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] transition-colors hover:bg-hover"
              >
                <Check
                  size={12}
                  className={cn(
                    "shrink-0",
                    m.id === model ? "text-accent" : "opacity-0",
                  )}
                />
                <span className="flex-1">{m.label}</span>
                <span className="text-[10.5px] text-fg-dim">{m.hint}</span>
              </button>
            ))}
            {!config.liveModel && (
              <div className="border-t border-line bg-warn/5 px-3 py-2 text-[10.5px] leading-relaxed text-warn">
                No <code className="font-mono">ANTHROPIC_API_KEY</code> set —
                running the scripted demo agent.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Members */}
      <div className="flex -space-x-1.5 pl-1">
        {members.slice(0, 4).map((m) => (
          <div
            key={m.id}
            title={`${m.name} · ${m.role}`}
            style={avatarStyle(m.avatarHue)}
            className="grid h-[21px] w-[21px] place-items-center rounded-full text-[9px] font-bold text-white ring-2 ring-app"
          >
            {initials(m.name)}
          </div>
        ))}
        {members.length > 4 && (
          <div className="grid h-[21px] w-[21px] place-items-center rounded-full bg-elevated text-[9px] font-semibold text-fg-dim ring-2 ring-app">
            +{members.length - 4}
          </div>
        )}
      </div>

      <button
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        title="Toggle theme"
        className="grid h-6 w-6 place-items-center rounded text-fg-dim transition-colors hover:bg-hover hover:text-fg"
      >
        {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
      </button>

      <button
        onClick={() => setAgentOpen(!agentOpen)}
        title={`${agentOpen ? "Hide" : "Show"} agent (⌘J)`}
        className={cn(
          "grid h-6 w-6 place-items-center rounded transition-colors hover:bg-hover",
          agentOpen ? "text-fg" : "text-fg-dim",
        )}
      >
        {agentOpen ? <PanelRightClose size={13} /> : <PanelRightOpen size={13} />}
      </button>

      {user && (
        <div
          title={`${user.name} · ${user.role}`}
          style={avatarStyle(user.avatarHue)}
          className="ml-0.5 grid h-[22px] w-[22px] place-items-center rounded-full text-[9.5px] font-bold text-white"
        >
          {initials(user.name)}
        </div>
      )}
    </header>
  );
}
