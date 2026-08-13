"use client";

import { useEffect, useState } from "react";
import { useWorkspace } from "@/store/workspace";
import { useAgent } from "@/store/agent";
import { Logo } from "@/components/shell/Logo";
import { cn } from "@/lib/format";
import { ArrowRight, Check, X } from "lucide-react";

const STORAGE_KEY = "prism-tour-done";

interface Step {
  title: string;
  body: string;
  /** Runs when the step is shown, to put the app in the right state. */
  enter?: () => void;
}

/**
 * First-run tour. Deliberately narrative rather than a series of pointer
 * bubbles: the product's argument is a *sequence* (evidence → cited answer →
 * reviewable diff → tickets), and coach-marks on individual buttons would
 * teach the UI while missing the point.
 */
export function Tour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const ws = useWorkspace();
  const agent = useAgent();

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setOpen(true);
    } catch {
      /* private mode — just don't show it */
    }
  }, []);

  const finish = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  const steps: Step[] = [
    {
      title: "This is a workspace, not a repo",
      body:
        "The file tree holds your product's real material: PRDs and research you can edit, plus read-only evidence — customer interviews, a support export, metrics. The agent searches and cites all of it.",
      enter: () => ws.setSidebar("explorer"),
    },
    {
      title: "Ask, and get an answer with its receipts",
      body:
        "Every claim the agent makes links back to the source excerpt that justifies it. If the evidence is thin, it says so rather than sounding confident. Try “what should we build next quarter?”",
      enter: () => ws.setAgentOpen(true),
    },
    {
      title: "It edits documents, not chat messages",
      body:
        "Ask it to change a PRD and the edit arrives in your editor as a diff you accept or reject — hunk by hunk. Nothing is ever applied without you. Select any text and press ⌘K to do the same thing yourself.",
    },
    {
      title: "Nothing is lost, and nothing is silent",
      body:
        "Every accepted change is snapshotted first, so it can be undone from History. Integrations report real health — Jira is deliberately degraded here, and pushing to it will refuse rather than fail quietly.",
      enter: () => ws.setSidebar("review"),
    },
    {
      title: "Your turn",
      body:
        "Drop a CSV onto the sidebar and ask the agent to pivot it. Or type “/” in the chat for repeatable workflows. Press ⌘/ any time for the shortcut list.",
      enter: () => ws.setSidebar("explorer"),
    },
  ];

  useEffect(() => {
    if (open) steps[step]?.enter?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step]);

  if (!open) return null;
  const current = steps[step];
  const last = step === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[98] flex items-end justify-end bg-black/30 p-5 backdrop-blur-[1px]">
      <div className="animate-pop w-[min(400px,92vw)] overflow-hidden rounded-xl border border-line-strong bg-elevated shadow-2xl shadow-black/60">
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <Logo size={16} />
          <span className="flex-1 text-[12.5px] font-semibold">
            Welcome to Prism
          </span>
          <span className="text-[10.5px] text-fg-dim">
            {step + 1} / {steps.length}
          </span>
          <button
            onClick={finish}
            title="Skip"
            className="grid h-6 w-6 place-items-center rounded text-fg-dim transition-colors hover:bg-hover hover:text-fg"
          >
            <X size={13} />
          </button>
        </div>

        <div className="px-4 py-3.5">
          <h3 className="mb-1.5 text-[13.5px] font-semibold">{current.title}</h3>
          <p className="text-[12px] leading-relaxed text-fg-muted">{current.body}</p>
        </div>

        <div className="flex items-center gap-2 border-t border-line px-4 py-2.5">
          <div className="flex gap-1">
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                aria-label={`Step ${i + 1}`}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === step ? "w-4 bg-accent" : "w-1.5 bg-line-strong",
                )}
              />
            ))}
          </div>

          <button
            onClick={finish}
            className="ml-auto rounded px-2 py-1 text-[11.5px] text-fg-dim transition-colors hover:text-fg"
          >
            Skip
          </button>
          <button
            onClick={() => {
              if (last) {
                finish();
                agent.setMode("ask");
                window.dispatchEvent(new CustomEvent("prism:focus-composer"));
              } else setStep((s) => s + 1);
            }}
            className="flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-[12px] font-medium text-on-accent transition-colors hover:bg-accent-hover"
          >
            {last ? (
              <>
                <Check size={12} /> Start
              </>
            ) : (
              <>
                Next <ArrowRight size={12} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Lets the command palette re-run the tour on demand. */
export function restartTour() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  window.location.reload();
}
