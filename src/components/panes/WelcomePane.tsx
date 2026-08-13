"use client";

import { useWorkspace } from "@/store/workspace";
import { useAgent } from "@/store/agent";
import { Logo } from "@/components/shell/Logo";
import { SHORTCUTS } from "@/lib/shortcuts";
import { Brain, FileText, Keyboard, Sparkles } from "lucide-react";

/** A short teaser; ⌘/ opens the full list from the same source. */
const TEASER = SHORTCUTS.filter((s) =>
  ["⌘P", "⌘⇧P", "⌘K", "⌘L", "⌘I", "⌘/"].includes(s.keys),
);

export function WelcomePane() {
  const { documents, openDocument, setPalette } = useWorkspace();
  const setAgentOpen = useWorkspace((s) => s.setAgentOpen);
  const send = useAgent((s) => s.send);

  const recent = documents.filter((d) => d.kind !== "memory").slice(0, 5);
  const memory = documents.find((d) => d.kind === "memory");

  return (
    <div className="grid min-h-0 flex-1 place-items-center overflow-y-auto p-8">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center gap-2.5">
          <Logo size={36} />
          <div>
            <h1 className="text-[16px] font-semibold">Prism</h1>
            <p className="text-[12px] text-fg-dim">
              The AI workspace for product managers
            </p>
          </div>
        </div>

        <div className="mb-5">
          <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-dim">
            <FileText size={11} /> Open a document
          </h2>
          <div className="space-y-0.5">
            {memory && (
              <button
                onClick={() => openDocument(memory.id)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-hover"
              >
                <Brain size={13} className="shrink-0 text-accent" />
                <span className="text-[12.5px]">Product Memory</span>
                <span className="ml-auto text-[10.5px] text-fg-dim">
                  persistent context
                </span>
              </button>
            )}
            {recent.map((d) => (
              <button
                key={d.id}
                onClick={() => openDocument(d.id)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-hover"
              >
                <FileText size={13} className="shrink-0 text-fg-dim" />
                <span className="truncate text-[12.5px]">{d.title}</span>
              </button>
            ))}
            <button
              onClick={() => setPalette("files")}
              className="px-2 py-1 text-[11.5px] text-accent transition-colors hover:underline"
            >
              Browse all ({documents.length}) →
            </button>
          </div>
        </div>

        <div className="mb-5">
          <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-dim">
            <Sparkles size={11} /> Or start with a question
          </h2>
          <button
            onClick={() => {
              setAgentOpen(true);
              void send(
                "What should we build next quarter? Weigh the evidence and tell me where you'd push back on the current roadmap.",
              );
            }}
            className="w-full rounded-lg border border-line bg-elevated px-3 py-2.5 text-left text-[12.5px] transition-colors hover:border-accent/40 hover:bg-accent-soft"
          >
            What should we build next quarter?
          </button>
        </div>

        <div>
          <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-dim">
            <Keyboard size={11} /> Shortcuts
          </h2>
          <dl className="grid grid-cols-2 gap-x-5 gap-y-1">
            {TEASER.map((s) => (
              <div key={s.keys} className="flex items-center gap-2">
                <dt className="shrink-0">
                  <kbd className="rounded border border-line bg-elevated px-1.5 py-px font-mono text-[10px] text-fg-muted">
                    {s.keys}
                  </kbd>
                </dt>
                <dd className="truncate text-[11.5px] text-fg-dim">{s.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
