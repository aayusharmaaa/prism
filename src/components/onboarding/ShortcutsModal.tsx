"use client";

import { useEffect } from "react";
import { SHORTCUTS, SHORTCUT_GROUPS } from "@/lib/shortcuts";
import { Keyboard, X } from "lucide-react";

export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[97] flex items-start justify-center bg-black/50 pt-[12vh] backdrop-blur-[1px]"
      onMouseDown={onClose}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="animate-pop w-[min(600px,92vw)] overflow-hidden rounded-xl border border-line-strong bg-elevated shadow-2xl shadow-black/60"
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <Keyboard size={14} className="text-accent" />
          <h2 className="flex-1 text-[13px] font-semibold">Keyboard shortcuts</h2>
          <button
            onClick={onClose}
            className="grid h-6 w-6 place-items-center rounded text-fg-dim transition-colors hover:bg-hover hover:text-fg"
          >
            <X size={13} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-4 px-4 py-4">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group}>
              <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-dim">
                {group}
              </h3>
              <dl className="space-y-1">
                {SHORTCUTS.filter((s) => s.group === group).map((s) => (
                  <div key={s.keys} className="flex items-baseline gap-2">
                    <dt className="w-14 shrink-0">
                      <kbd className="rounded border border-line bg-app px-1.5 py-px font-mono text-[10px] text-fg-muted">
                        {s.keys}
                      </kbd>
                    </dt>
                    <dd className="text-[11.5px] text-fg-muted">{s.label}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>

        <p className="border-t border-line px-4 py-2 text-[10.5px] text-fg-dim">
          On Windows and Linux, ⌘ is Ctrl.
        </p>
      </div>
    </div>
  );
}
