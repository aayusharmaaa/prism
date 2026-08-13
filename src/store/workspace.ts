"use client";

import { create } from "zustand";
import type {
  Document,
  Folder,
  Integration,
  Member,
  ProposedChange,
  Source,
  Thread,
  TicketBatch,
  Workspace,
} from "@/lib/types";

export type TabKind =
  | "document"
  | "source"
  | "integrations"
  | "settings"
  | "review"
  | "tickets";

export interface Tab {
  /** Stable identity, e.g. `doc:doc_sso` or `pane:settings`. */
  key: string;
  kind: TabKind;
  entityId?: string;
  title: string;
}

export type SidebarView =
  | "explorer"
  | "search"
  | "review"
  | "activity"
  | "integrations"
  | "chats";

export interface ModelOption {
  id: string;
  label: string;
  hint: string;
}

interface Bootstrap {
  workspace: Workspace;
  user: Member;
  role: Member["role"];
  members: Member[];
  folders: Folder[];
  documents: Document[];
  sources: Source[];
  threads: Thread[];
  integrations: Integration[];
  pendingChanges: ProposedChange[];
  config: { models: ModelOption[]; defaultModel: string; liveModel: boolean };
}

interface Toast {
  id: string;
  tone: "info" | "ok" | "error";
  message: string;
}

interface WorkspaceState {
  slug: string;
  loaded: boolean;
  error: string | null;

  workspace: Workspace | null;
  user: Member | null;
  role: Member["role"];
  members: Member[];
  folders: Folder[];
  documents: Document[];
  sources: Source[];
  threads: Thread[];
  integrations: Integration[];
  pendingChanges: ProposedChange[];
  ticketBatches: TicketBatch[];
  config: Bootstrap["config"];

  /* editor */
  tabs: Tab[];
  activeTab: string | null;
  /** Unsaved editor content, keyed by document id. */
  drafts: Record<string, string>;
  saving: Record<string, boolean>;

  /* layout */
  sidebarView: SidebarView;
  sidebarOpen: boolean;
  sidebarWidth: number;
  agentOpen: boolean;
  agentWidth: number;
  /**
   * Panes the viewport-fitter closed on the user's behalf. Only these are
   * reopened when space returns — a pane the user closed deliberately stays
   * closed.
   */
  autoCollapsed: { sidebar: boolean; agent: boolean };
  paletteMode: "closed" | "files" | "commands";
  theme: "dark" | "light";
  toasts: Toast[];

  /* actions */
  init: (slug: string) => Promise<void>;
  refresh: (scope?: "documents" | "sources" | "changes" | "all") => Promise<void>;

  openTab: (tab: Tab) => void;
  openDocument: (id: string) => void;
  openSource: (id: string) => void;
  openPane: (kind: Exclude<TabKind, "document" | "source">, title?: string, entityId?: string) => void;
  closeTab: (key: string) => void;
  setActiveTab: (key: string) => void;

  setDraft: (docId: string, content: string) => void;
  saveDocument: (docId: string, patch?: { title?: string; status?: Document["status"] }) => Promise<void>;
  createDocument: (kind: Document["kind"], title: string) => Promise<Document | null>;
  deleteDocument: (id: string) => Promise<void>;
  addSource: (source: Source) => void;

  addChange: (change: ProposedChange) => void;
  resolveChange: (changeId: string, action: "accept" | "reject", content?: string) => Promise<void>;

  addTicketBatch: (batch: TicketBatch) => void;
  updateTicketBatch: (batch: TicketBatch) => void;

  setIntegration: (integration: Integration) => void;
  setSidebar: (view: SidebarView) => void;
  toggleSidebar: () => void;
  setSidebarWidth: (w: number) => void;
  setAgentOpen: (open: boolean) => void;
  setAgentWidth: (w: number) => void;
  /** Collapses panes so the editor keeps a usable width on small viewports. */
  fitToViewport: (width: number) => void;
  setPalette: (mode: WorkspaceState["paletteMode"]) => void;
  setTheme: (t: "dark" | "light") => void;
  toast: (tone: Toast["tone"], message: string) => void;
  dismissToast: (id: string) => void;
}

const EMPTY_CONFIG: Bootstrap["config"] = {
  models: [],
  defaultModel: "claude-opus-5",
  liveModel: false,
};

let saveTimers: Record<string, ReturnType<typeof setTimeout>> = {};

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  slug: "",
  loaded: false,
  error: null,

  workspace: null,
  user: null,
  role: "editor",
  members: [],
  folders: [],
  documents: [],
  sources: [],
  threads: [],
  integrations: [],
  pendingChanges: [],
  ticketBatches: [],
  config: EMPTY_CONFIG,

  tabs: [],
  activeTab: null,
  drafts: {},
  saving: {},

  sidebarView: "explorer",
  sidebarOpen: true,
  sidebarWidth: 268,
  agentOpen: true,
  agentWidth: 428,
  autoCollapsed: { sidebar: false, agent: false },
  paletteMode: "closed",
  theme: "dark",
  toasts: [],

  async init(slug) {
    set({ slug });
    try {
      const res = await fetch(`/api/w/${slug}/bootstrap`, { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        set({ error: body.error ?? `Failed to load workspace (${res.status})`, loaded: true });
        return;
      }
      const data = (await res.json()) as Bootstrap;

      // Open the workspace on something useful rather than an empty editor.
      const first =
        data.documents.find((d) => d.status === "in_review") ??
        data.documents.find((d) => d.kind === "prd") ??
        data.documents[0];

      set({
        loaded: true,
        error: null,
        workspace: data.workspace,
        user: data.user,
        role: data.role,
        members: data.members,
        folders: data.folders,
        documents: data.documents,
        sources: data.sources,
        threads: data.threads,
        integrations: data.integrations,
        pendingChanges: data.pendingChanges,
        config: data.config,
        tabs: first
          ? [{ key: `doc:${first.id}`, kind: "document", entityId: first.id, title: first.title }]
          : [],
        activeTab: first ? `doc:${first.id}` : null,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to reach the server",
        loaded: true,
      });
    }
  },

  async refresh(scope = "all") {
    const { slug } = get();
    if (!slug) return;
    const res = await fetch(`/api/w/${slug}/bootstrap`, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as Bootstrap;
    const patch: Partial<WorkspaceState> = {};
    if (scope === "all" || scope === "documents") {
      patch.documents = data.documents;
      patch.folders = data.folders;
    }
    if (scope === "all" || scope === "sources") patch.sources = data.sources;
    if (scope === "all" || scope === "changes") patch.pendingChanges = data.pendingChanges;
    if (scope === "all") {
      patch.threads = data.threads;
      patch.integrations = data.integrations;
      patch.members = data.members;
      patch.workspace = data.workspace;
    }
    set(patch);
  },

  openTab(tab) {
    const { tabs } = get();
    if (!tabs.some((t) => t.key === tab.key)) {
      set({ tabs: [...tabs, tab] });
    }
    set({ activeTab: tab.key });
  },

  openDocument(id) {
    const doc = get().documents.find((d) => d.id === id);
    if (!doc) return;
    get().openTab({
      key: `doc:${id}`,
      kind: "document",
      entityId: id,
      title: doc.title,
    });
  },

  openSource(id) {
    const src = get().sources.find((s) => s.id === id);
    if (!src) return;
    get().openTab({
      key: `src:${id}`,
      kind: "source",
      entityId: id,
      title: src.title,
    });
  },

  openPane(kind, title, entityId) {
    const key = entityId ? `pane:${kind}:${entityId}` : `pane:${kind}`;
    const labels: Record<string, string> = {
      integrations: "Integrations",
      settings: "Workspace settings",
      review: "Review queue",
      tickets: "Ticket draft",
    };
    get().openTab({ key, kind, entityId, title: title ?? labels[kind] ?? kind });
  },

  closeTab(key) {
    const { tabs, activeTab } = get();
    const idx = tabs.findIndex((t) => t.key === key);
    if (idx === -1) return;
    const next = tabs.filter((t) => t.key !== key);
    let nextActive = activeTab;
    if (activeTab === key) {
      nextActive = next[Math.min(idx, next.length - 1)]?.key ?? null;
    }
    set({ tabs: next, activeTab: nextActive });
  },

  setActiveTab(key) {
    set({ activeTab: key });
  },

  setDraft(docId, content) {
    set({ drafts: { ...get().drafts, [docId]: content } });

    // Debounced autosave, mirroring an editor's behaviour.
    clearTimeout(saveTimers[docId]);
    saveTimers[docId] = setTimeout(() => {
      void get().saveDocument(docId);
    }, 900);
  },

  async saveDocument(docId, patch) {
    const { slug, drafts, documents } = get();
    const doc = documents.find((d) => d.id === docId);
    if (!doc) return;

    const content = drafts[docId];
    const body: Record<string, unknown> = {};
    if (content !== undefined && content !== doc.content) body.content = content;
    if (patch?.title) body.title = patch.title;
    if (patch?.status) body.status = patch.status;
    if (!Object.keys(body).length) return;

    set({ saving: { ...get().saving, [docId]: true } });
    try {
      const res = await fetch(`/api/w/${slug}/documents/${docId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        get().toast("error", err.error ?? "Could not save");
        return;
      }
      const { document } = (await res.json()) as { document: Document };
      const nextDrafts = { ...get().drafts };
      // Only clear the draft if the user hasn't typed since the request began.
      if (nextDrafts[docId] === content) delete nextDrafts[docId];
      set({
        documents: get().documents.map((d) => (d.id === docId ? document : d)),
        drafts: nextDrafts,
        tabs: get().tabs.map((t) =>
          t.entityId === docId && t.kind === "document"
            ? { ...t, title: document.title }
            : t,
        ),
      });
    } finally {
      set({ saving: { ...get().saving, [docId]: false } });
    }
  },

  async createDocument(kind, title) {
    const { slug } = get();
    const res = await fetch(`/api/w/${slug}/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, title }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      get().toast("error", err.error ?? "Could not create document");
      return null;
    }
    const { document } = (await res.json()) as { document: Document };
    set({ documents: [...get().documents, document] });
    get().openDocument(document.id);
    get().toast("ok", `Created “${document.title}”`);
    return document;
  },

  async deleteDocument(id) {
    const { slug } = get();
    const res = await fetch(`/api/w/${slug}/documents/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      get().toast("error", err.error ?? "Could not delete");
      return;
    }
    get().closeTab(`doc:${id}`);
    set({ documents: get().documents.filter((d) => d.id !== id) });
    get().toast("ok", "Document deleted");
  },

  addSource(source) {
    set({ sources: [source, ...get().sources] });
    // Open it so the upload visibly produced something.
    get().openSource(source.id);
  },

  addChange(change) {
    const existing = get().pendingChanges;
    if (existing.some((c) => c.id === change.id)) return;
    set({ pendingChanges: [change, ...existing] });
    // Bring the affected document forward so the diff is visible immediately.
    get().openDocument(change.documentId);
  },

  async resolveChange(changeId, action, content) {
    const { slug } = get();
    const change = get().pendingChanges.find((c) => c.id === changeId);
    const res = await fetch(`/api/w/${slug}/changes/${changeId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, content }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      get().toast("error", err.error ?? "Could not resolve change");
      // Drop it from the queue anyway if the server says it's already gone.
      if (res.status === 409) {
        set({ pendingChanges: get().pendingChanges.filter((c) => c.id !== changeId) });
      }
      return;
    }
    const { document } = (await res.json()) as { document: Document | null };
    set({
      pendingChanges: get().pendingChanges.filter((c) => c.id !== changeId),
      documents: document
        ? get().documents.map((d) => (d.id === document.id ? document : d))
        : get().documents,
    });
    if (document) {
      const drafts = { ...get().drafts };
      delete drafts[document.id];
      set({ drafts });
    }
    get().toast(
      action === "accept" ? "ok" : "info",
      action === "accept"
        ? `Applied to “${document?.title ?? "document"}”`
        : `Rejected${change ? `: ${change.summary}` : ""}`,
    );
  },

  addTicketBatch(batch) {
    set({ ticketBatches: [batch, ...get().ticketBatches] });
    get().openPane("tickets", `Tickets · ${batch.tickets.length}`, batch.id);
  },

  updateTicketBatch(batch) {
    set({
      ticketBatches: get().ticketBatches.map((b) => (b.id === batch.id ? batch : b)),
    });
  },

  setIntegration(integration) {
    set({
      integrations: get().integrations.map((i) =>
        i.provider === integration.provider ? integration : i,
      ),
    });
  },

  setSidebar(view) {
    const { sidebarView, sidebarOpen, autoCollapsed } = get();
    // Clicking the active icon collapses the panel, as in VS Code.
    const open = !(view === sidebarView && sidebarOpen);
    set({
      sidebarView: open ? view : sidebarView,
      sidebarOpen: open,
      // An explicit choice, so the fitter must not undo it.
      autoCollapsed: { ...autoCollapsed, sidebar: false },
    });
  },

  toggleSidebar() {
    const { sidebarOpen, autoCollapsed } = get();
    set({
      sidebarOpen: !sidebarOpen,
      autoCollapsed: { ...autoCollapsed, sidebar: false },
    });
  },

  setSidebarWidth(w) {
    set({ sidebarWidth: Math.min(Math.max(w, 200), 520) });
  },

  setAgentOpen(open) {
    set({ agentOpen: open, autoCollapsed: { ...get().autoCollapsed, agent: false } });
  },

  setAgentWidth(w) {
    set({ agentWidth: Math.min(Math.max(w, 320), 780) });
  },

  /**
   * Keeps the editor at least MIN_EDITOR wide by shedding panes, cheapest
   * first: narrow the agent, narrow the sidebar, drop the sidebar, drop the
   * agent.
   *
   * Panes closed here are flagged, and only flagged panes are restored when
   * the window grows again — so widening never reopens something the user
   * deliberately closed, and maximising never leaves them staring at an empty
   * shell because a transient narrow layout ate their panels.
   */
  fitToViewport(width) {
    const MIN_EDITOR = 380;
    const ACTIVITY = 44;
    const state = get();

    let { sidebarOpen, agentOpen, agentWidth, sidebarWidth } = state;
    const auto = { ...state.autoCollapsed };

    const editorWidth = () =>
      width -
      ACTIVITY -
      (sidebarOpen ? sidebarWidth + 1 : 0) -
      (agentOpen ? agentWidth + 1 : 0);

    // Grow first: restore what we previously took away, widest benefit last.
    if (auto.sidebar && !sidebarOpen) {
      const restored = width - ACTIVITY - (sidebarWidth + 1) - (agentOpen ? agentWidth + 1 : 0);
      if (restored >= MIN_EDITOR) {
        sidebarOpen = true;
        auto.sidebar = false;
      }
    }
    if (auto.agent && !agentOpen) {
      const restored = width - ACTIVITY - (sidebarOpen ? sidebarWidth + 1 : 0) - (agentWidth + 1);
      if (restored >= MIN_EDITOR) {
        agentOpen = true;
        auto.agent = false;
      }
    }

    // Then shrink/shed if we're still over budget.
    if (editorWidth() < MIN_EDITOR && agentOpen) {
      agentWidth = Math.max(320, agentWidth + (editorWidth() - MIN_EDITOR));
    }
    if (editorWidth() < MIN_EDITOR && sidebarOpen) {
      sidebarWidth = Math.max(200, sidebarWidth + (editorWidth() - MIN_EDITOR));
    }
    if (editorWidth() < MIN_EDITOR && sidebarOpen) {
      sidebarOpen = false;
      auto.sidebar = true;
    }
    if (editorWidth() < MIN_EDITOR && agentOpen) {
      agentOpen = false;
      auto.agent = true;
    }

    if (
      sidebarOpen !== state.sidebarOpen ||
      agentOpen !== state.agentOpen ||
      agentWidth !== state.agentWidth ||
      sidebarWidth !== state.sidebarWidth ||
      auto.sidebar !== state.autoCollapsed.sidebar ||
      auto.agent !== state.autoCollapsed.agent
    ) {
      set({ sidebarOpen, agentOpen, agentWidth, sidebarWidth, autoCollapsed: auto });
    }
  },

  setPalette(mode) {
    set({ paletteMode: mode });
  },

  setTheme(t) {
    set({ theme: t });
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = t;
      try {
        localStorage.setItem("prism-theme", t);
      } catch {
        /* private mode */
      }
    }
  },

  toast(tone, message) {
    const id = Math.random().toString(36).slice(2);
    set({ toasts: [...get().toasts, { id, tone, message }] });
    setTimeout(() => get().dismissToast(id), tone === "error" ? 6000 : 3200);
  },

  dismissToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));

/** Current editor content for a document, preferring unsaved local edits. */
export function useDocumentContent(docId: string | undefined): string {
  return useWorkspace((s) => {
    if (!docId) return "";
    const draft = s.drafts[docId];
    if (draft !== undefined) return draft;
    return s.documents.find((d) => d.id === docId)?.content ?? "";
  });
}
