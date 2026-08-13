"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useDocumentContent, useWorkspace } from "@/store/workspace";
import { useAgent } from "@/store/agent";
import { DiffReview } from "./DiffReview";
import { InlineEditBar } from "./InlineEditBar";
import { ShareDialog } from "./ShareDialog";
import { HistoryPanel } from "./HistoryPanel";
import { CommentsRail } from "./CommentsRail";
import { copyMarkdown, downloadMarkdown, printDocument } from "@/lib/export";
import {
  DOC_KIND_LABEL,
  STATUS_CLASS,
  STATUS_LABEL,
  cn,
  estimateTokens,
  relativeTime,
} from "@/lib/format";
import type { DocStatus } from "@/lib/types";
import {
  AtSign,
  Brain,
  Check,
  ChevronDown,
  Download,
  Eye,
  History,
  Loader2,
  MessageSquare,
  Pencil,
  Share2,
  Sparkles,
} from "lucide-react";

const STATUSES: DocStatus[] = ["draft", "in_review", "approved", "shipped"];

function ExportItem({
  label,
  hint,
  onSelect,
}: {
  label: string;
  hint?: string;
  onSelect: () => void | Promise<void>;
}) {
  return (
    <button
      // onMouseDown, not onClick: the parent closes on blur, which fires first.
      onMouseDown={(e) => {
        e.preventDefault();
        void onSelect();
      }}
      className="block w-full px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-hover"
    >
      {label}
      {hint && <span className="ml-1.5 text-[10px] text-fg-dim">{hint}</span>}
    </button>
  );
}

export function DocumentEditor({ documentId }: { documentId: string }) {
  const {
    documents,
    setDraft,
    saveDocument,
    saving,
    drafts,
    pendingChanges,
    resolveChange,
    role,
    toast,
    members,
  } = useWorkspace();
  const { addAttachment, queueInsert, setMode } = useAgent();

  const doc = documents.find((d) => d.id === documentId);
  const content = useDocumentContent(documentId);
  const change = pendingChanges.find((c) => c.documentId === documentId);

  const [mode, setViewMode] = useState<"edit" | "preview">("preview");
  const [statusOpen, setStatusOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [anchorDraft, setAnchorDraft] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [inlineEdit, setInlineEdit] = useState<{
    text: string;
    start: number;
    end: number;
  } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const readOnly = role === "viewer";

  /* ------------------------ keyboard handling ---------------------- */
  const openInlineEdit = useCallback(() => {
    const el = textareaRef.current;
    if (!el || readOnly) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (start === end) {
      toast("info", "Select some text first, then press ⌘K");
      return;
    }
    setInlineEdit({ text: content.slice(start, end), start, end });
  }, [content, readOnly, toast]);

  const addSelectionToChat = useCallback(() => {
    const el = textareaRef.current;
    const selected =
      el && el.selectionStart !== el.selectionEnd
        ? content.slice(el.selectionStart, el.selectionEnd)
        : window.getSelection()?.toString() ?? "";

    if (selected.trim()) {
      queueInsert(
        `From **${doc?.title ?? "document"}**:\n\n> ${selected.trim().replace(/\n/g, "\n> ")}\n\n`,
      );
    } else if (doc) {
      addAttachment(doc.id);
    }
    useWorkspace.getState().setAgentOpen(true);
    window.dispatchEvent(new CustomEvent("prism:focus-composer"));
  }, [content, doc, addAttachment, queueInsert]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();

      if (key === "k" && !e.shiftKey) {
        e.preventDefault();
        if (mode !== "edit") {
          setViewMode("edit");
          // Let the textarea mount before reading its selection.
          setTimeout(() => textareaRef.current?.focus(), 30);
          return;
        }
        openInlineEdit();
      }
      if (key === "l") {
        e.preventDefault();
        addSelectionToChat();
      }
      if (key === "s") {
        e.preventDefault();
        void saveDocument(documentId);
      }
      if (key === "e" && e.shiftKey) {
        e.preventDefault();
        setViewMode((m) => (m === "edit" ? "preview" : "edit"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, openInlineEdit, addSelectionToChat, saveDocument, documentId]);

  const stats = useMemo(() => {
    const words = content.trim() ? content.trim().split(/\s+/).length : 0;
    return {
      words,
      lines: content.split("\n").length,
      tokens: estimateTokens(content),
      readingMinutes: Math.max(1, Math.round(words / 220)),
    };
  }, [content]);

  if (!doc) {
    return (
      <div className="grid flex-1 place-items-center text-[13px] text-fg-dim">
        Document not found.
      </div>
    );
  }

  /* --------------------------- diff mode --------------------------- */
  if (change) {
    return (
      <DiffReview
        change={change}
        readOnly={readOnly}
        onResolve={(action, merged) =>
          void resolveChange(change.id, action, merged)
        }
      />
    );
  }

  const isDirty = drafts[documentId] !== undefined;
  const isMemory = doc.kind === "memory";
  const editorName = members.find((m) => m.id === doc.updatedBy)?.name ?? null;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Document header */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-2">
        {isMemory && <Brain size={14} className="shrink-0 text-accent" />}
        <input
          value={titleDraft ?? doc.title}
          disabled={readOnly}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={() => {
            if (titleDraft !== null && titleDraft !== doc.title) {
              void saveDocument(documentId, { title: titleDraft.trim() || doc.title });
            }
            setTitleDraft(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setTitleDraft(null);
              e.currentTarget.blur();
            }
          }}
          className="min-w-0 flex-1 truncate bg-transparent text-[14px] font-semibold outline-none focus:text-fg disabled:cursor-default"
        />

        <span className="shrink-0 rounded border border-line px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-fg-dim">
          {DOC_KIND_LABEL[doc.kind]}
        </span>

        {/* Status */}
        {!isMemory && (
          <div className="relative shrink-0">
            <button
              onClick={() => !readOnly && setStatusOpen((v) => !v)}
              onBlur={() => setTimeout(() => setStatusOpen(false), 140)}
              className={cn(
                "flex items-center gap-1 rounded border px-1.5 py-px text-[10px] font-medium uppercase tracking-wide transition-colors",
                STATUS_CLASS[doc.status],
                !readOnly && "hover:bg-hover",
              )}
            >
              {STATUS_LABEL[doc.status]}
              {!readOnly && <ChevronDown size={9} />}
            </button>
            {statusOpen && (
              <div className="animate-pop absolute right-0 top-6 z-40 w-36 overflow-hidden rounded-lg border border-line-strong bg-elevated shadow-xl">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      void saveDocument(documentId, { status: s });
                      setStatusOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-hover"
                  >
                    <Check
                      size={11}
                      className={cn(s === doc.status ? "text-accent" : "opacity-0")}
                    />
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-line p-0.5">
          <button
            onClick={() => setViewMode("preview")}
            title="Preview (⌘⇧E)"
            className={cn(
              "grid h-5 w-6 place-items-center rounded transition-colors",
              mode === "preview" ? "bg-active text-fg" : "text-fg-dim hover:text-fg",
            )}
          >
            <Eye size={12} />
          </button>
          <button
            onClick={() => setViewMode("edit")}
            title="Edit (⌘⇧E)"
            className={cn(
              "grid h-5 w-6 place-items-center rounded transition-colors",
              mode === "edit" ? "bg-active text-fg" : "text-fg-dim hover:text-fg",
            )}
          >
            <Pencil size={12} />
          </button>
        </div>

        <button
          onClick={addSelectionToChat}
          title="Add to chat (⌘L)"
          className="grid h-6 w-6 shrink-0 place-items-center rounded text-fg-dim transition-colors hover:bg-hover hover:text-accent"
        >
          <AtSign size={13} />
        </button>

        {/* Export */}
        <div className="relative shrink-0">
          <button
            onClick={() => setExportOpen((v) => !v)}
            onBlur={() => setTimeout(() => setExportOpen(false), 140)}
            title="Export"
            className="grid h-6 w-6 place-items-center rounded text-fg-dim transition-colors hover:bg-hover hover:text-fg"
          >
            <Download size={13} />
          </button>
          {exportOpen && (
            <div className="animate-pop absolute right-0 top-7 z-40 w-52 overflow-hidden rounded-lg border border-line-strong bg-elevated shadow-xl">
              <ExportItem
                label="Download as Markdown"
                onSelect={() => downloadMarkdown({ ...doc, content })}
              />
              <ExportItem
                label="Copy as Markdown"
                onSelect={async () => {
                  const ok = await copyMarkdown({ ...doc, content });
                  toast(ok ? "ok" : "error", ok ? "Copied to clipboard" : "Copy failed");
                }}
              />
              <ExportItem
                label="Print / Save as PDF"
                hint={mode === "edit" ? "switches to preview" : undefined}
                onSelect={() => {
                  // The print stylesheet targets the rendered article, so the
                  // preview has to be on screen before the dialog opens.
                  setViewMode("preview");
                  setTimeout(printDocument, 120);
                }}
              />
            </div>
          )}
        </div>

        <button
          onClick={() => setSharing(true)}
          title="Share a read-only link"
          className="grid h-6 w-6 shrink-0 place-items-center rounded text-fg-dim transition-colors hover:bg-hover hover:text-fg"
        >
          <Share2 size={13} />
        </button>

        <button
          onClick={() => setShowHistory(true)}
          title="Version history"
          className="grid h-6 w-6 shrink-0 place-items-center rounded text-fg-dim transition-colors hover:bg-hover hover:text-fg"
        >
          <History size={13} />
        </button>

        <button
          onClick={() => {
            // Anchor to whatever is selected, in either edit or preview mode.
            const el = textareaRef.current;
            const fromTextarea =
              el && el.selectionStart !== el.selectionEnd
                ? content.slice(el.selectionStart, el.selectionEnd)
                : "";
            const selected =
              fromTextarea || (window.getSelection()?.toString() ?? "");
            setAnchorDraft(selected.trim().slice(0, 300) || null);
            setShowComments(true);
          }}
          title="Comment on selection"
          className={cn(
            "grid h-6 w-6 shrink-0 place-items-center rounded transition-colors hover:bg-hover hover:text-fg",
            showComments ? "text-accent" : "text-fg-dim",
          )}
        >
          <MessageSquare size={13} />
        </button>

        {!readOnly && (
          <button
            onClick={() => {
              setMode("agent");
              queueInsert(`Review @[${doc.title}](${doc.id}) and `);
              useWorkspace.getState().setAgentOpen(true);
              window.dispatchEvent(new CustomEvent("prism:focus-composer"));
            }}
            title="Ask the agent to edit this document"
            className="flex shrink-0 items-center gap-1 rounded border border-line px-2 py-1 text-[11.5px] text-fg-muted transition-colors hover:border-accent/50 hover:bg-accent-soft hover:text-fg"
          >
            <Sparkles size={11} /> Edit with AI
          </button>
        )}

        <span
          className="shrink-0 text-[10.5px] text-fg-dim"
          title={
            editorName
              ? `Last edited by ${editorName} · ${new Date(doc.updatedAt).toLocaleString()}`
              : undefined
          }
        >
          {saving[documentId] ? (
            <span className="flex items-center gap-1">
              <Loader2 size={10} className="animate-spin" /> Saving
            </span>
          ) : isDirty ? (
            "Unsaved"
          ) : (
            <>
              {relativeTime(doc.updatedAt)}
              {editorName && ` · ${editorName.split(" ")[0]}`}
            </>
          )}
        </span>
      </div>

      {isMemory && (
        <div className="shrink-0 border-b border-line bg-accent-soft/50 px-4 py-1.5 text-[11px] leading-relaxed text-fg-muted">
          This file is injected into every agent request in this workspace. It
          is the fix for &ldquo;the AI forgets between sessions&rdquo; — keep it
          short and true.
        </div>
      )}

      {sharing && <ShareDialog doc={doc} onClose={() => setSharing(false)} />}
      {showHistory && (
        <HistoryPanel doc={doc} onClose={() => setShowHistory(false)} />
      )}

      {/* Body + comments rail */}
      <div className="flex min-h-0 flex-1">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {inlineEdit && (
          <InlineEditBar
            documentId={documentId}
            selection={inlineEdit.text}
            onClose={() => setInlineEdit(null)}
            onAccept={(replacement) => {
              const next =
                content.slice(0, inlineEdit.start) +
                replacement +
                content.slice(inlineEdit.end);
              setDraft(documentId, next);
              setInlineEdit(null);
              toast("ok", "Inline edit applied");
            }}
          />
        )}

        {mode === "edit" ? (
          <textarea
            ref={textareaRef}
            value={content}
            readOnly={readOnly}
            onChange={(e) => setDraft(documentId, e.target.value)}
            spellCheck={false}
            placeholder="Start writing…"
            className="h-full w-full resize-none bg-editor px-5 py-4 font-mono text-[12.5px] leading-[1.7] outline-none placeholder:text-fg-dim"
          />
        ) : (
          <div className="h-full overflow-y-auto px-5 py-5">
            <article className="prose-prism mx-auto max-w-3xl pb-24">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </article>
          </div>
        )}
      </div>

        {showComments && (
          <CommentsRail
            documentId={documentId}
            anchorDraft={anchorDraft}
            onClearAnchor={() => setAnchorDraft(null)}
            onClose={() => {
              setShowComments(false);
              setAnchorDraft(null);
            }}
          />
        )}
      </div>

      {/* Doc footer */}
      <div className="flex shrink-0 items-center gap-3 border-t border-line px-4 py-1 text-[10.5px] text-fg-dim">
        <span>{stats.words.toLocaleString()} words</span>
        <span>{stats.lines} lines</span>
        <span>~{stats.tokens.toLocaleString()} tokens</span>
        <span>{stats.readingMinutes} min read</span>
        <span className="ml-auto">
          {mode === "edit" ? "⌘K to edit selection · ⌘L to add to chat" : "⌘⇧E to edit"}
        </span>
      </div>
    </div>
  );
}
