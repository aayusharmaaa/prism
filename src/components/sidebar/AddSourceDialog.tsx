"use client";

import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/store/workspace";
import { cn } from "@/lib/format";
import type { SourceKind } from "@/lib/types";
import { FileUp, Loader2, X } from "lucide-react";

const KINDS: { id: SourceKind; label: string }[] = [
  { id: "feedback", label: "Feedback" },
  { id: "interview", label: "Interview" },
  { id: "ticket", label: "Tickets" },
  { id: "metric", label: "Metrics" },
  { id: "competitor", label: "Competitive" },
  { id: "transcript", label: "Transcript" },
];

/**
 * Adds evidence to the workspace. Sources are read-only once created — the
 * agent cites them but never edits them — so this is the only way data enters.
 */
export function AddSourceDialog({
  onClose,
  initialFile,
}: {
  onClose: () => void;
  /** Pre-filled when the dialog is opened by a drag-and-drop. */
  initialFile?: File | null;
}) {
  const { slug, addSource, toast } = useWorkspace();
  const [tab, setTab] = useState<"paste" | "upload">(initialFile ? "upload" : "paste");
  const [file, setFile] = useState<File | null>(initialFile ?? null);
  const [title, setTitle] = useState(
    initialFile ? initialFile.name.replace(/\.[^.]+$/, "") : "",
  );
  const [origin, setOrigin] = useState("");
  const [kind, setKind] = useState<SourceKind>("feedback");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async () => {
    if (busy) return;
    setError(null);

    if (tab === "upload" && !file) {
      setError("Choose a file first.");
      return;
    }
    if (tab === "paste" && !text.trim()) {
      setError("Paste some content first.");
      return;
    }

    setBusy(true);
    try {
      let res: Response;
      if (tab === "upload" && file) {
        const form = new FormData();
        form.append("file", file);
        form.append("title", title.trim());
        form.append("origin", origin.trim() || "Upload");
        form.append("kind", kind);
        res = await fetch(`/api/w/${slug}/sources`, { method: "POST", body: form });
      } else {
        res = await fetch(`/api/w/${slug}/sources`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: text,
            title: title.trim(),
            origin: origin.trim() || "Pasted",
            kind,
          }),
        });
      }

      const data = (await res.json().catch(() => ({}))) as {
        source?: import("@/lib/types").Source;
        error?: string;
      };
      if (!res.ok || !data.source) {
        setError(data.error ?? `Upload failed (${res.status})`);
        return;
      }

      addSource(data.source);
      const rows = data.source.meta?.rowCount;
      toast(
        "ok",
        typeof rows === "number"
          ? `Added “${data.source.title}” · ${rows} rows parsed`
          : `Added “${data.source.title}”`,
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex items-start justify-center bg-black/50 pt-[10vh] backdrop-blur-[1px]"
      onMouseDown={onClose}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="animate-pop w-[min(560px,92vw)] overflow-hidden rounded-xl border border-line-strong bg-elevated shadow-2xl shadow-black/60"
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <FileUp size={14} className="text-accent" />
          <h2 className="flex-1 text-[13px] font-semibold">Add a source</h2>
          <button
            onClick={onClose}
            className="grid h-6 w-6 place-items-center rounded text-fg-dim transition-colors hover:bg-hover hover:text-fg"
          >
            <X size={13} />
          </button>
        </div>

        <div className="px-4 pt-3">
          <p className="mb-3 text-[11.5px] leading-relaxed text-fg-muted">
            Evidence the agent can search and cite — interview notes, a support
            export, a ticket dump. CSVs are parsed into a table it can pivot.
          </p>

          <div className="mb-3 flex gap-0.5 border-b border-line">
            {(["paste", "upload"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "border-b-2 px-3 py-1.5 text-[12px] capitalize transition-colors",
                  tab === t
                    ? "border-accent text-fg"
                    : "border-transparent text-fg-dim hover:text-fg-muted",
                )}
              >
                {t === "paste" ? "Paste text" : "Upload file"}
              </button>
            ))}
          </div>

          {tab === "paste" ? (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={9}
              placeholder={
                "Paste interview notes, a CSV, a Slack thread…\n\n" +
                "tag,severity,arr\nsaved-views,High,84000"
              }
              className="w-full resize-none rounded border border-line bg-app px-2.5 py-2 font-mono text-[11.5px] leading-relaxed outline-none placeholder:text-fg-dim focus:border-accent"
            />
          ) : (
            <FileDrop
              file={file}
              onFile={(f) => {
                setFile(f);
                if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ""));
              }}
            />
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-[10.5px] uppercase tracking-wide text-fg-dim">
                Title
              </span>
              <input
                ref={firstRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Auto from content"
                className="w-full rounded border border-line bg-app px-2 py-1.5 text-[12.5px] outline-none placeholder:text-fg-dim focus:border-accent"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10.5px] uppercase tracking-wide text-fg-dim">
                Where it came from
              </span>
              <input
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                placeholder="Zendesk, Gong, Linear…"
                className="w-full rounded border border-line bg-app px-2 py-1.5 text-[12.5px] outline-none placeholder:text-fg-dim focus:border-accent"
              />
            </label>
          </div>

          <div className="mt-3">
            <span className="mb-1 block text-[10.5px] uppercase tracking-wide text-fg-dim">
              Kind
            </span>
            <div className="flex flex-wrap gap-1">
              {KINDS.map((k) => (
                <button
                  key={k.id}
                  onClick={() => setKind(k.id)}
                  className={cn(
                    "rounded border px-2 py-1 text-[11.5px] transition-colors",
                    kind === k.id
                      ? "border-accent bg-accent-soft text-fg"
                      : "border-line text-fg-muted hover:border-line-strong hover:text-fg",
                  )}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="mt-3 rounded border border-danger/30 bg-danger/5 px-2 py-1.5 text-[11.5px] text-danger">
              {error}
            </p>
          )}
        </div>

        <div className="mt-4 flex items-center gap-2 border-t border-line px-4 py-2.5">
          <span className="text-[10.5px] text-fg-dim">Max 2 MB · stored in your workspace</span>
          <button
            onClick={onClose}
            className="ml-auto rounded border border-line px-2.5 py-1.5 text-[12px] text-fg-muted transition-colors hover:bg-hover"
          >
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={busy}
            className="flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-[12px] font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {busy && <Loader2 size={12} className="animate-spin" />}
            {busy ? "Adding…" : "Add source"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FileDrop({
  file,
  onFile,
}: {
  file: File | null;
  onFile: (f: File) => void;
}) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "grid h-[170px] cursor-pointer place-items-center rounded border border-dashed transition-colors",
        over ? "border-accent bg-accent-soft" : "border-line hover:border-line-strong",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.tsv,.txt,.md,.json,text/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      <div className="text-center">
        <FileUp size={20} className="mx-auto mb-2 text-fg-dim" />
        {file ? (
          <>
            <p className="text-[12.5px] font-medium">{file.name}</p>
            <p className="text-[11px] text-fg-dim">
              {(file.size / 1024).toFixed(0)} KB · click to replace
            </p>
          </>
        ) : (
          <>
            <p className="text-[12.5px] text-fg-muted">
              Drop a file, or click to browse
            </p>
            <p className="mt-0.5 text-[11px] text-fg-dim">CSV, TSV, TXT, MD, JSON</p>
          </>
        )}
      </div>
    </div>
  );
}
