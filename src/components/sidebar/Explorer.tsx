"use client";

import { useMemo, useState } from "react";
import { useWorkspace } from "@/store/workspace";
import { useAgent } from "@/store/agent";
import { SidebarHeader, SidebarIconButton } from "@/components/shell/Sidebar";
import { NewDocumentMenu } from "./NewDocumentMenu";
import { AddSourceDialog } from "./AddSourceDialog";
import {
  DOC_KIND_LABEL,
  SOURCE_KIND_LABEL,
  STATUS_CLASS,
  cn,
  relativeTime,
} from "@/lib/format";
import type { Document, Source } from "@/lib/types";
import {
  AtSign,
  BarChart3,
  BookOpen,
  Brain,
  ChevronRight,
  FileText,
  FileUp,
  FlaskConical,
  ListTodo,
  Map as MapIcon,
  MessageSquareQuote,
  Plus,
  Swords,
  Trash2,
} from "lucide-react";

const DOC_ICON = {
  prd: FileText,
  spec: FileText,
  onepager: BookOpen,
  research: FlaskConical,
  roadmap: MapIcon,
  note: FileText,
  memory: Brain,
} as const;

const SOURCE_ICON = {
  interview: MessageSquareQuote,
  feedback: MessageSquareQuote,
  ticket: ListTodo,
  metric: BarChart3,
  competitor: Swords,
  transcript: MessageSquareQuote,
} as const;

export function Explorer() {
  const {
    documents,
    sources,
    folders,
    openDocument,
    openSource,
    activeTab,
    pendingChanges,
    drafts,
    deleteDocument,
    role,
  } = useWorkspace();
  const addAttachment = useAgent((s) => s.addAttachment);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState(false);
  const [addingSource, setAddingSource] = useState(false);
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const toggle = (key: string) =>
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));

  const canEdit = role !== "viewer";

  const openSourceDialog = (file: File | null = null) => {
    setDroppedFile(file);
    setAddingSource(true);
  };

  const memory = documents.find((d) => d.kind === "memory");
  const grouped = useMemo(() => {
    const byFolder = new Map<string, Document[]>();
    const loose: Document[] = [];
    for (const d of documents) {
      if (d.kind === "memory") continue;
      if (d.folderId) {
        const list = byFolder.get(d.folderId) ?? [];
        list.push(d);
        byFolder.set(d.folderId, list);
      } else {
        loose.push(d);
      }
    }
    return { byFolder, loose };
  }, [documents]);

  const sourceGroups = useMemo(() => {
    const map = new Map<string, Source[]>();
    for (const s of sources) {
      const list = map.get(s.kind) ?? [];
      list.push(s);
      map.set(s.kind, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [sources]);

  const changesFor = (docId: string) =>
    pendingChanges.filter((c) => c.documentId === docId).length;

  return (
    <div
      className="relative flex h-full flex-col"
      onDragOver={(e) => {
        if (!canEdit || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        // Only clear when the pointer actually leaves the panel, not on the
        // dragleave fired when crossing a child element.
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDragOver(false);
      }}
      onDrop={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) openSourceDialog(file);
      }}
    >
      <SidebarHeader
        title="Workspace"
        actions={
          canEdit && (
            <SidebarIconButton onClick={() => setCreating(true)} title="New document">
              <Plus size={14} />
            </SidebarIconButton>
          )
        }
      />

      {creating && <NewDocumentMenu onClose={() => setCreating(false)} />}
      {addingSource && (
        <AddSourceDialog
          initialFile={droppedFile}
          onClose={() => {
            setAddingSource(false);
            setDroppedFile(null);
          }}
        />
      )}

      {dragOver && (
        <div className="pointer-events-none absolute inset-1.5 z-20 grid place-items-center rounded-lg border-2 border-dashed border-accent bg-accent-soft/80">
          <div className="text-center">
            <FileUp size={20} className="mx-auto mb-1.5 text-accent" />
            <p className="text-[12px] font-medium">Drop to add a source</p>
            <p className="text-[10.5px] text-fg-muted">CSV, TSV, TXT, MD</p>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {/* Product memory gets top billing — it's the highest-leverage file. */}
        {memory && (
          <div className="mb-1 px-1.5">
            <button
              onClick={() => openDocument(memory.id)}
              className={cn(
                "group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                activeTab === `doc:${memory.id}`
                  ? "bg-accent-soft text-fg"
                  : "hover:bg-hover",
              )}
            >
              <Brain size={14} className="shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-medium">
                  Product Memory
                </div>
                <div className="truncate text-[10.5px] text-fg-dim">
                  Injected into every request
                </div>
              </div>
              {changesFor(memory.id) > 0 && <PendingDot />}
            </button>
          </div>
        )}

        {/* Documents */}
        <Section
          label="Documents"
          count={documents.filter((d) => d.kind !== "memory").length}
          collapsed={collapsed.docs}
          onToggle={() => toggle("docs")}
        >
          {folders.map((f) => {
            const docs = grouped.byFolder.get(f.id) ?? [];
            if (!docs.length) return null;
            const key = `f:${f.id}`;
            return (
              <div key={f.id}>
                <button
                  onClick={() => toggle(key)}
                  className="flex w-full items-center gap-1 py-1 pl-4 pr-2 text-[11.5px] text-fg-muted transition-colors hover:text-fg"
                >
                  <ChevronRight
                    size={11}
                    className={cn(
                      "shrink-0 transition-transform",
                      !collapsed[key] && "rotate-90",
                    )}
                  />
                  <span className="truncate font-medium">{f.name}</span>
                  <span className="ml-auto text-[10px] text-fg-dim">
                    {docs.length}
                  </span>
                </button>
                {!collapsed[key] &&
                  docs.map((d) => (
                    <DocRow
                      key={d.id}
                      doc={d}
                      depth={2}
                      active={activeTab === `doc:${d.id}`}
                      dirty={drafts[d.id] !== undefined}
                      pending={changesFor(d.id)}
                      onOpen={() => openDocument(d.id)}
                      onMention={() => addAttachment(d.id)}
                      onDelete={
                        role === "owner" || role === "admin"
                          ? () => void deleteDocument(d.id)
                          : undefined
                      }
                    />
                  ))}
              </div>
            );
          })}
          {grouped.loose.map((d) => (
            <DocRow
              key={d.id}
              doc={d}
              depth={1}
              active={activeTab === `doc:${d.id}`}
              dirty={drafts[d.id] !== undefined}
              pending={changesFor(d.id)}
              onOpen={() => openDocument(d.id)}
              onMention={() => addAttachment(d.id)}
              onDelete={
                role === "owner" || role === "admin"
                  ? () => void deleteDocument(d.id)
                  : undefined
              }
            />
          ))}
        </Section>

        {/* Sources */}
        <Section
          label="Sources"
          count={sources.length}
          collapsed={collapsed.sources}
          onToggle={() => toggle("sources")}
          hint="Read-only evidence"
          action={
            canEdit && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openSourceDialog(null);
                }}
                title="Add a source"
                className="grid h-4 w-4 place-items-center rounded text-fg-dim transition-colors hover:bg-active hover:text-fg"
              >
                <Plus size={12} />
              </button>
            )
          }
        >
          {sourceGroups.map(([kind, list]) => {
            const key = `s:${kind}`;
            const Icon = SOURCE_ICON[kind as keyof typeof SOURCE_ICON] ?? BookOpen;
            return (
              <div key={kind}>
                <button
                  onClick={() => toggle(key)}
                  className="flex w-full items-center gap-1 py-1 pl-4 pr-2 text-[11.5px] text-fg-muted transition-colors hover:text-fg"
                >
                  <ChevronRight
                    size={11}
                    className={cn(
                      "shrink-0 transition-transform",
                      !collapsed[key] && "rotate-90",
                    )}
                  />
                  <Icon size={12} className="shrink-0 text-fg-dim" />
                  <span className="truncate font-medium">
                    {SOURCE_KIND_LABEL[kind as keyof typeof SOURCE_KIND_LABEL] ?? kind}
                  </span>
                  <span className="ml-auto text-[10px] text-fg-dim">
                    {list.length}
                  </span>
                </button>
                {!collapsed[key] &&
                  list.map((s) => (
                    <div
                      key={s.id}
                      className={cn(
                        "group flex items-center gap-1.5 pr-1.5 transition-colors",
                        activeTab === `src:${s.id}` ? "bg-accent-soft" : "hover:bg-hover",
                      )}
                      style={{ paddingLeft: 30 }}
                    >
                      <button
                        onClick={() => openSource(s.id)}
                        className="min-w-0 flex-1 py-1 text-left"
                      >
                        <div className="truncate text-[12px] text-fg-muted group-hover:text-fg">
                          {s.title.replace(/^(Interview|Support export|Linear|PostHog snapshot|Competitive teardown)\s*[—-]\s*/, "")}
                        </div>
                      </button>
                      <button
                        onClick={() => addAttachment(s.id)}
                        title="Add to chat"
                        className="hidden shrink-0 rounded p-0.5 text-fg-dim transition-colors hover:bg-active hover:text-accent group-hover:block"
                      >
                        <AtSign size={11} />
                      </button>
                    </div>
                  ))}
              </div>
            );
          })}
        </Section>
      </div>
    </div>
  );
}

function Section({
  label,
  count,
  collapsed,
  onToggle,
  hint,
  action,
  children,
}: {
  label: string;
  count: number;
  collapsed?: boolean;
  onToggle: () => void;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="group/section mb-1">
      <div className="flex w-full items-center gap-1 px-2 py-1 text-fg-muted transition-colors hover:text-fg">
        <button onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-1">
          <ChevronRight
            size={11}
            className={cn("shrink-0 transition-transform", !collapsed && "rotate-90")}
          />
          <span className="text-[11px] font-semibold uppercase tracking-wide">
            {label}
          </span>
          <span className="ml-auto text-[10px] text-fg-dim">{count}</span>
        </button>
        {action}
      </div>
      {!collapsed && (
        <>
          {hint && (
            <div className="px-2 pb-1 pl-6 text-[10px] italic text-fg-dim">{hint}</div>
          )}
          {children}
        </>
      )}
    </div>
  );
}

function DocRow({
  doc,
  depth,
  active,
  dirty,
  pending,
  onOpen,
  onMention,
  onDelete,
}: {
  doc: Document;
  depth: number;
  active: boolean;
  dirty: boolean;
  pending: number;
  onOpen: () => void;
  onMention: () => void;
  onDelete?: () => void;
}) {
  const Icon = DOC_ICON[doc.kind] ?? FileText;
  return (
    <div
      className={cn(
        "group flex items-center gap-1.5 pr-1.5 transition-colors",
        active ? "bg-accent-soft" : "hover:bg-hover",
      )}
      style={{ paddingLeft: depth * 14 + 2 }}
    >
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left">
        <Icon
          size={13}
          className={cn("shrink-0", active ? "text-accent" : "text-fg-dim")}
        />
        <span
          className={cn(
            "truncate text-[12.5px]",
            active ? "text-fg" : "text-fg-muted group-hover:text-fg",
          )}
        >
          {doc.title.replace(/^(PRD|One-pager|Research)\s*[—-]\s*/, "")}
        </span>
        {dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-fg-dim" />}
        {pending > 0 && <PendingDot />}
      </button>

      <span
        className={cn(
          "hidden shrink-0 rounded border px-1 py-px text-[9px] font-medium uppercase tracking-wide group-hover:hidden",
          STATUS_CLASS[doc.status],
          !active && "sm:block",
        )}
        title={`${DOC_KIND_LABEL[doc.kind]} · updated ${relativeTime(doc.updatedAt)}`}
      >
        {DOC_KIND_LABEL[doc.kind]}
      </span>

      <button
        onClick={onMention}
        title="Add to chat (@)"
        className="hidden shrink-0 rounded p-0.5 text-fg-dim transition-colors hover:bg-active hover:text-accent group-hover:block"
      >
        <AtSign size={11} />
      </button>
      {onDelete && (
        <button
          onClick={onDelete}
          title="Delete document"
          className="hidden shrink-0 rounded p-0.5 text-fg-dim transition-colors hover:bg-active hover:text-danger group-hover:block"
        >
          <Trash2 size={11} />
        </button>
      )}
    </div>
  );
}

const PendingDot = () => (
  <span
    title="Has a pending change"
    className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent ring-2 ring-accent/25"
  />
);
