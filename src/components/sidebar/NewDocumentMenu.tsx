"use client";

import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/store/workspace";
import type { DocKind } from "@/lib/types";

const KINDS: { id: DocKind; label: string; hint: string }[] = [
  { id: "prd", label: "PRD", hint: "Problem → evidence → solution → metrics" },
  { id: "onepager", label: "One-pager", hint: "A claim, a number, three bets" },
  { id: "research", label: "Research", hint: "Method, findings, recommendations" },
  { id: "roadmap", label: "Roadmap", hint: "Now / next / later / not doing" },
  { id: "spec", label: "Spec", hint: "Behaviour, edge cases, telemetry" },
  { id: "note", label: "Note", hint: "Blank page" },
];

export function NewDocumentMenu({ onClose }: { onClose: () => void }) {
  const createDocument = useWorkspace((s) => s.createDocument);
  const [kind, setKind] = useState<DocKind>("prd");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    await createDocument(kind, title.trim() || `Untitled ${kind}`);
    setBusy(false);
    onClose();
  };

  return (
    <div className="mx-1.5 mb-2 rounded-lg border border-line-strong bg-elevated p-2 shadow-lg shadow-black/25">
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
          if (e.key === "Escape") onClose();
        }}
        placeholder="Document title…"
        className="mb-2 w-full rounded border border-line bg-app px-2 py-1.5 text-[12.5px] outline-none placeholder:text-fg-dim focus:border-accent"
      />
      <div className="mb-2 grid grid-cols-2 gap-1">
        {KINDS.map((k) => (
          <button
            key={k.id}
            onClick={() => setKind(k.id)}
            title={k.hint}
            className={
              "rounded border px-2 py-1 text-left text-[11.5px] transition-colors " +
              (kind === k.id
                ? "border-accent bg-accent-soft text-fg"
                : "border-line text-fg-muted hover:border-line-strong hover:text-fg")
            }
          >
            {k.label}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5">
        <button
          onClick={() => void submit()}
          disabled={busy}
          className="flex-1 rounded bg-accent px-2 py-1.5 text-[12px] font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create"}
        </button>
        <button
          onClick={onClose}
          className="rounded border border-line px-2.5 py-1.5 text-[12px] text-fg-muted transition-colors hover:bg-hover"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
