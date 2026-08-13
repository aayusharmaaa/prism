/* ------------------------------------------------------------------
   Prism domain types.

   The mental model deliberately mirrors an IDE:
     Cursor            →  Prism
     ─────────────────────────────────────────────
     repository        →  workspace
     source file       →  document  (PRD, spec, one-pager, research)
     dependency / lib  →  source    (interview, feedback CSV, ticket dump)
     .cursorrules      →  product memory
     code diff         →  proposed change (document diff)
     MCP server        →  integration
------------------------------------------------------------------- */

export type Role = "owner" | "admin" | "editor" | "viewer";

export type Plan = "trial" | "team" | "business" | "enterprise";

export interface Workspace {
  id: string;
  slug: string;
  name: string;
  plan: Plan;
  seats: number;
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatarHue: number;
}

export interface Member extends User {
  role: Role;
  joinedAt: string;
  lastActiveAt: string | null;
}

/* ---------------------------- Documents --------------------------- */

export type DocKind =
  | "prd"
  | "spec"
  | "onepager"
  | "research"
  | "roadmap"
  | "note"
  | "memory";

export type DocStatus = "draft" | "in_review" | "approved" | "shipped";

export interface Document {
  id: string;
  workspaceId: string;
  folderId: string | null;
  kind: DocKind;
  title: string;
  content: string;
  status: DocStatus;
  createdBy: string;
  /** Null on documents that haven't been edited since creation. */
  updatedBy: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface Folder {
  id: string;
  workspaceId: string;
  parentId: string | null;
  name: string;
  order: number;
}

/* ----------------------------- Sources ---------------------------- */
/** Read-only evidence the agent can cite: interviews, feedback, tickets. */
export type SourceKind =
  | "interview"
  | "feedback"
  | "ticket"
  | "metric"
  | "competitor"
  | "transcript";

export interface Source {
  id: string;
  workspaceId: string;
  kind: SourceKind;
  title: string;
  /** Where it came from, e.g. "Gong", "Zendesk export", "Linear". */
  origin: string;
  content: string;
  /** Free-form JSON: severity, ARR impact, account, sentiment, … */
  meta: Record<string, unknown>;
  capturedAt: string;
}

/* ------------------------- Agent conversation --------------------- */

export type AgentMode = "ask" | "agent" | "plan";

export interface Thread {
  id: string;
  workspaceId: string;
  title: string;
  mode: AgentMode;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type MessageRole = "user" | "assistant" | "system";

export interface ToolInvocation {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: "running" | "ok" | "error";
  /** Short human-readable result summary rendered in the tool card. */
  summary?: string;
  /** Full payload, used by the model and the "details" disclosure. */
  result?: unknown;
  durationMs?: number;
}

export interface Citation {
  id: string;
  kind: "document" | "source";
  title: string;
  /** The quoted fragment that justified the claim. */
  excerpt: string;
}

export interface Message {
  id: string;
  threadId: string;
  role: MessageRole;
  content: string;
  tools: ToolInvocation[];
  citations: Citation[];
  /** Documents/sources the user explicitly @-mentioned. */
  attachments: string[];
  createdAt: string;
  /** Token accounting for usage metering. */
  inputTokens?: number;
  outputTokens?: number;
}

/* -------------------------- Proposed changes ---------------------- */
/** A pending document diff awaiting human accept/reject — the core UX. */
export interface ProposedChange {
  id: string;
  workspaceId: string;
  documentId: string;
  threadId: string | null;
  /** Null when the change creates a brand-new document. */
  before: string | null;
  after: string;
  summary: string;
  status: "pending" | "accepted" | "rejected";
  createdBy: "agent" | "inline";
  createdAt: string;
  resolvedAt: string | null;
}

/* --------------------------- Integrations ------------------------- */

export type IntegrationProvider =
  | "jira"
  | "linear"
  | "notion"
  | "posthog"
  | "figma"
  | "slack";

export type IntegrationStatus =
  | "connected"
  | "disconnected"
  | "degraded"
  | "error";

export interface Integration {
  id: string;
  workspaceId: string;
  provider: IntegrationProvider;
  status: IntegrationStatus;
  accountLabel: string | null;
  /** Non-secret config, e.g. default project key. */
  config: Record<string, unknown>;
  lastCheckedAt: string | null;
  lastError: string | null;
}

/* ----------------------------- Tickets ---------------------------- */

export interface DraftTicket {
  id: string;
  type: "epic" | "story" | "bug" | "task";
  title: string;
  description: string;
  acceptanceCriteria: string[];
  estimate: string | null;
  labels: string[];
  parentId: string | null;
  /** Set once pushed to a tracker. */
  externalKey?: string | null;
}

export interface TicketBatch {
  id: string;
  workspaceId: string;
  documentId: string | null;
  threadId: string | null;
  tickets: DraftTicket[];
  status: "draft" | "pushed";
  provider: IntegrationProvider | null;
  createdAt: string;
}

/* ------------------------- Platform / SaaS ------------------------ */

export interface AuditEntry {
  id: string;
  workspaceId: string;
  actorId: string;
  actorName: string;
  action: string;
  target: string;
  meta: Record<string, unknown>;
  createdAt: string;
}

export interface UsageRecord {
  id: string;
  workspaceId: string;
  userId: string;
  day: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  requests: number;
}

export interface ApiKey {
  id: string;
  workspaceId: string;
  name: string;
  /** Only the display prefix is retained; the secret is hashed. */
  prefix: string;
  createdBy: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

/* --------------------------- SSE wire format ---------------------- */
/** Events streamed from /api/agent to the client. */
export type AgentEvent =
  | { type: "thread"; threadId: string }
  | { type: "message_start"; messageId: string }
  | { type: "text"; delta: string }
  | { type: "thinking"; delta: string }
  | { type: "tool_start"; tool: ToolInvocation }
  | { type: "tool_end"; tool: ToolInvocation }
  | { type: "citation"; citation: Citation }
  | { type: "change"; change: ProposedChange }
  | { type: "tickets"; batch: TicketBatch }
  | { type: "invalidate"; scope: "documents" | "sources" | "memory" }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "done"; messageId: string }
  | { type: "error"; message: string };
