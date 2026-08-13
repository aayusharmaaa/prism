"use client";

import { useWorkspace } from "@/store/workspace";
import { cn } from "@/lib/format";
import { Check, Info, TriangleAlert, X } from "lucide-react";

const ICON = { ok: Check, info: Info, error: TriangleAlert } as const;

export function Toasts() {
  const { toasts, dismissToast } = useWorkspace();
  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed bottom-9 right-4 z-[100] flex w-72 flex-col gap-1.5">
      {toasts.map((t) => {
        const Icon = ICON[t.tone];
        return (
          <div
            key={t.id}
            className={cn(
              "animate-fade-up pointer-events-auto flex items-start gap-2 rounded-lg border bg-elevated px-2.5 py-2 shadow-xl shadow-black/30",
              t.tone === "ok" && "border-ok/35",
              t.tone === "error" && "border-danger/35",
              t.tone === "info" && "border-line-strong",
            )}
          >
            <Icon
              size={13}
              className={cn(
                "mt-px shrink-0",
                t.tone === "ok" && "text-ok",
                t.tone === "error" && "text-danger",
                t.tone === "info" && "text-fg-dim",
              )}
            />
            <p className="min-w-0 flex-1 break-words text-[11.5px] leading-snug text-fg">
              {t.message}
            </p>
            <button
              onClick={() => dismissToast(t.id)}
              className="shrink-0 text-fg-dim transition-colors hover:text-fg"
            >
              <X size={11} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
