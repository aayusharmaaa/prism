import { db, hasFts, json, nowIso, num, nullableStr, str, type Row } from "./client";
import type {
  ApiKey,
  AuditEntry,
  Citation,
  Document,
  DocKind,
  DocStatus,
  DraftTicket,
  Folder,
  Integration,
  IntegrationProvider,
  IntegrationStatus,
  Member,
  Message,
  MessageRole,
  ProposedChange,
  Role,
  Source,
  SourceKind,
  Thread,
  TicketBatch,
  ToolInvocation,
  UsageRecord,
  Workspace,
} from "@/lib/types";
import { nanoid } from "nanoid";

const id = (prefix: string) => `${prefix}_${nanoid(12)}`;

/* --------------------------- mappers ------------------------------ */

const toWorkspace = (r: Row): Workspace => ({
  id: str(r.id),
  slug: str(r.slug),
  name: str(r.name),
  plan: str(r.plan, "trial") as Workspace["plan"],
  seats: num(r.seats, 5),
  createdAt: str(r.created_at),
});

const toMember = (r: Row): Member => ({
  id: str(r.id),
  email: str(r.email),
  name: str(r.name),
  avatarHue: num(r.avatar_hue, 250),
  role: str(r.role, "editor") as Role,
  joinedAt: str(r.joined_at),
  lastActiveAt: nullableStr(r.last_active_at),
});

const toDocument = (r: Row): Document => ({
  id: str(r.id),
  workspaceId: str(r.workspace_id),
  folderId: nullableStr(r.folder_id),
  kind: str(r.kind, "note") as DocKind,
  title: str(r.title),
  content: str(r.content),
  status: str(r.status, "draft") as DocStatus,
  createdBy: str(r.created_by),
  updatedBy: nullableStr(r.updated_by),
  createdAt: str(r.created_at),
  updatedAt: str(r.updated_at),
});

const toSource = (r: Row): Source => ({
  id: str(r.id),
  workspaceId: str(r.workspace_id),
  kind: str(r.kind, "feedback") as SourceKind,
  title: str(r.title),
  origin: str(r.origin),
  content: str(r.content),
  meta: json<Record<string, unknown>>(r.meta, {}),
  capturedAt: str(r.captured_at),
});

const toThread = (r: Row): Thread => ({
  id: str(r.id),
  workspaceId: str(r.workspace_id),
  title: str(r.title, "New chat"),
  mode: str(r.mode, "agent") as Thread["mode"],
  createdBy: str(r.created_by),
  createdAt: str(r.created_at),
  updatedAt: str(r.updated_at),
});

const toMessage = (r: Row): Message => ({
  id: str(r.id),
  threadId: str(r.thread_id),
  role: str(r.role, "user") as MessageRole,
  content: str(r.content),
  tools: json<ToolInvocation[]>(r.tools, []),
  citations: json<Citation[]>(r.citations, []),
  attachments: json<string[]>(r.attachments, []),
  inputTokens: num(r.input_tokens),
  outputTokens: num(r.output_tokens),
  createdAt: str(r.created_at),
});

const toChange = (r: Row): ProposedChange => ({
  id: str(r.id),
  workspaceId: str(r.workspace_id),
  documentId: str(r.document_id),
  threadId: nullableStr(r.thread_id),
  before: nullableStr(r.before),
  after: str(r.after),
  summary: str(r.summary),
  status: str(r.status, "pending") as ProposedChange["status"],
  createdBy: str(r.created_by, "agent") as ProposedChange["createdBy"],
  createdAt: str(r.created_at),
  resolvedAt: nullableStr(r.resolved_at),
});

const toIntegration = (r: Row): Integration => ({
  id: str(r.id),
  workspaceId: str(r.workspace_id),
  provider: str(r.provider) as IntegrationProvider,
  status: str(r.status, "disconnected") as IntegrationStatus,
  accountLabel: nullableStr(r.account_label),
  config: json<Record<string, unknown>>(r.config, {}),
  lastCheckedAt: nullableStr(r.last_checked_at),
  lastError: nullableStr(r.last_error),
});

const toBatch = (r: Row): TicketBatch => ({
  id: str(r.id),
  workspaceId: str(r.workspace_id),
  documentId: nullableStr(r.document_id),
  threadId: nullableStr(r.thread_id),
  tickets: json<DraftTicket[]>(r.tickets, []),
  status: str(r.status, "draft") as TicketBatch["status"],
  provider: nullableStr(r.provider) as IntegrationProvider | null,
  createdAt: str(r.created_at),
});

/* -------------------------- workspace ----------------------------- */

export async function getWorkspaceBySlug(slug: string): Promise<Workspace | null> {
  const c = await db();
  const r = await c.execute({
    sql: "SELECT * FROM workspaces WHERE slug = ?",
    args: [slug],
  });
  return r.rows[0] ? toWorkspace(r.rows[0] as Row) : null;
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const c = await db();
  const r = await c.execute("SELECT * FROM workspaces ORDER BY created_at");
  return r.rows.map((x) => toWorkspace(x as Row));
}

export async function listMembers(workspaceId: string): Promise<Member[]> {
  const c = await db();
  const r = await c.execute({
    sql: `SELECT u.*, m.role, m.joined_at, m.last_active_at
          FROM memberships m JOIN users u ON u.id = m.user_id
          WHERE m.workspace_id = ?
          ORDER BY CASE m.role
            WHEN 'owner' THEN 0 WHEN 'admin' THEN 1
            WHEN 'editor' THEN 2 ELSE 3 END, u.name`,
    args: [workspaceId],
  });
  return r.rows.map((x) => toMember(x as Row));
}

export async function setMemberRole(
  workspaceId: string,
  userId: string,
  role: Role,
) {
  const c = await db();
  await c.execute({
    sql: "UPDATE memberships SET role = ? WHERE workspace_id = ? AND user_id = ?",
    args: [role, workspaceId, userId],
  });
}

export async function updateWorkspace(
  workspaceId: string,
  patch: { name?: string; plan?: string; seats?: number },
) {
  const sets: string[] = [];
  const args: unknown[] = [];
  if (patch.name !== undefined) (sets.push("name = ?"), args.push(patch.name));
  if (patch.plan !== undefined) (sets.push("plan = ?"), args.push(patch.plan));
  if (patch.seats !== undefined) (sets.push("seats = ?"), args.push(patch.seats));
  if (!sets.length) return;
  args.push(workspaceId);
  const c = await db();
  await c.execute({
    sql: `UPDATE workspaces SET ${sets.join(", ")} WHERE id = ?`,
    args: args as never,
  });
}

/* --------------------------- folders ------------------------------ */

export async function listFolders(workspaceId: string): Promise<Folder[]> {
  const c = await db();
  const r = await c.execute({
    sql: "SELECT * FROM folders WHERE workspace_id = ? ORDER BY sort_order, name",
    args: [workspaceId],
  });
  return r.rows.map((x) => {
    const row = x as Row;
    return {
      id: str(row.id),
      workspaceId: str(row.workspace_id),
      parentId: nullableStr(row.parent_id),
      name: str(row.name),
      order: num(row.sort_order),
    };
  });
}

/* -------------------------- documents ----------------------------- */

export async function listDocuments(workspaceId: string): Promise<Document[]> {
  const c = await db();
  const r = await c.execute({
    sql: `SELECT * FROM documents WHERE workspace_id = ?
          ORDER BY kind = 'memory' DESC, title`,
    args: [workspaceId],
  });
  return r.rows.map((x) => toDocument(x as Row));
}

export async function getDocument(
  workspaceId: string,
  documentId: string,
): Promise<Document | null> {
  const c = await db();
  const r = await c.execute({
    sql: "SELECT * FROM documents WHERE workspace_id = ? AND id = ?",
    args: [workspaceId, documentId],
  });
  return r.rows[0] ? toDocument(r.rows[0] as Row) : null;
}

export async function createDocument(input: {
  workspaceId: string;
  title: string;
  content: string;
  kind: DocKind;
  folderId?: string | null;
  createdBy: string;
}): Promise<Document> {
  const c = await db();
  const docId = id("doc");
  const ts = nowIso();
  await c.execute({
    sql: `INSERT INTO documents
            (id, workspace_id, folder_id, kind, title, content, status, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
    args: [
      docId,
      input.workspaceId,
      input.folderId ?? null,
      input.kind,
      input.title,
      input.content,
      input.createdBy,
      ts,
      ts,
    ],
  });
  await reindex(input.workspaceId, docId, "document", input.title, input.content);
  const doc = await getDocument(input.workspaceId, docId);
  if (!doc) throw new Error("Document vanished immediately after insert");
  return doc;
}

/** Snapshot when enough time has passed or the edit is substantial. */
const SNAPSHOT_MIN_INTERVAL_MS = 2 * 60 * 1000;
const SNAPSHOT_MIN_DELTA = 400;

export async function updateDocument(
  workspaceId: string,
  documentId: string,
  patch: {
    title?: string;
    content?: string;
    status?: DocStatus;
    updatedBy?: string;
    /** Set by callers that snapshot themselves (e.g. accepting a diff). */
    skipSnapshot?: boolean;
  },
): Promise<Document | null> {
  // Snapshot the *previous* content before overwriting it, so history holds
  // the state you'd want to return to.
  if (patch.content !== undefined && !patch.skipSnapshot) {
    const before = await getDocument(workspaceId, documentId);
    if (before && before.content !== patch.content) {
      const elapsed = Date.now() - (await lastSnapshotAt(documentId));
      const delta = Math.abs(patch.content.length - before.content.length);
      // Without this gate the 900ms autosave debounce would write a row per
      // burst of typing.
      if (elapsed > SNAPSHOT_MIN_INTERVAL_MS || delta >= SNAPSHOT_MIN_DELTA) {
        await snapshotDocument({
          workspaceId,
          documentId,
          content: before.content,
          origin: "manual",
          createdBy: patch.updatedBy ?? before.updatedBy ?? before.createdBy,
        });
      }
    }
  }

  const sets: string[] = ["updated_at = ?"];
  const args: unknown[] = [nowIso()];
  if (patch.title !== undefined) (sets.push("title = ?"), args.push(patch.title));
  if (patch.content !== undefined)
    (sets.push("content = ?"), args.push(patch.content));
  if (patch.status !== undefined)
    (sets.push("status = ?"), args.push(patch.status));
  if (patch.updatedBy !== undefined)
    (sets.push("updated_by = ?"), args.push(patch.updatedBy));
  args.push(workspaceId, documentId);

  const c = await db();
  await c.execute({
    sql: `UPDATE documents SET ${sets.join(", ")} WHERE workspace_id = ? AND id = ?`,
    args: args as never,
  });

  const doc = await getDocument(workspaceId, documentId);
  if (doc) await reindex(workspaceId, doc.id, "document", doc.title, doc.content);
  return doc;
}

export async function deleteDocument(workspaceId: string, documentId: string) {
  const c = await db();
  await c.execute({
    sql: "DELETE FROM documents WHERE workspace_id = ? AND id = ? AND kind != 'memory'",
    args: [workspaceId, documentId],
  });
  if (hasFts()) {
    await c.execute({
      sql: "DELETE FROM search_index WHERE entity_id = ?",
      args: [documentId],
    });
  }
}

/* --------------------------- sources ------------------------------ */

export async function listSources(workspaceId: string): Promise<Source[]> {
  const c = await db();
  const r = await c.execute({
    sql: "SELECT * FROM sources WHERE workspace_id = ? ORDER BY captured_at DESC",
    args: [workspaceId],
  });
  return r.rows.map((x) => toSource(x as Row));
}

export async function getSource(
  workspaceId: string,
  sourceId: string,
): Promise<Source | null> {
  const c = await db();
  const r = await c.execute({
    sql: "SELECT * FROM sources WHERE workspace_id = ? AND id = ?",
    args: [workspaceId, sourceId],
  });
  return r.rows[0] ? toSource(r.rows[0] as Row) : null;
}

export async function createSource(input: {
  workspaceId: string;
  kind: SourceKind;
  title: string;
  origin: string;
  content: string;
  meta?: Record<string, unknown>;
}): Promise<Source> {
  const c = await db();
  const srcId = id("src");
  await c.execute({
    sql: `INSERT INTO sources (id, workspace_id, kind, title, origin, content, meta, captured_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      srcId,
      input.workspaceId,
      input.kind,
      input.title,
      input.origin,
      input.content,
      JSON.stringify(input.meta ?? {}),
      nowIso(),
    ],
  });
  await reindex(input.workspaceId, srcId, "source", input.title, input.content);
  const s = await getSource(input.workspaceId, srcId);
  if (!s) throw new Error("Source vanished immediately after insert");
  return s;
}

/* ---------------------------- search ------------------------------ */

export interface SearchHit {
  id: string;
  type: "document" | "source";
  title: string;
  excerpt: string;
  score: number;
}

/**
 * FTS5 treats a lot of punctuation as operators, so user text is reduced to
 * bare terms and recombined as an OR of prefix matches.
 */
function toFtsQuery(raw: string): string {
  const terms = raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .slice(0, 12);
  if (!terms.length) return "";
  return terms.map((t) => `"${t}"*`).join(" OR ");
}

export async function searchWorkspace(
  workspaceId: string,
  query: string,
  limit = 8,
): Promise<SearchHit[]> {
  const c = await db();

  if (hasFts()) {
    const q = toFtsQuery(query);
    if (q) {
      try {
        const r = await c.execute({
          sql: `SELECT entity_id, entity_type, title,
                       snippet(search_index, 4, '', '', ' … ', 32) AS excerpt,
                       bm25(search_index) AS score
                FROM search_index
                WHERE search_index MATCH ? AND workspace_id = ?
                ORDER BY score LIMIT ?`,
          args: [q, workspaceId, limit],
        });
        if (r.rows.length) {
          return r.rows.map((x) => {
            const row = x as Row;
            return {
              id: str(row.entity_id),
              type: str(row.entity_type) as "document" | "source",
              title: str(row.title),
              excerpt: str(row.excerpt).replace(/\s+/g, " ").trim(),
              // bm25 returns negative numbers, lower is better.
              score: -num(row.score),
            };
          });
        }
      } catch {
        // Malformed MATCH expression — fall through to LIKE.
      }
    }
  }

  return likeSearch(workspaceId, query, limit);
}

async function likeSearch(
  workspaceId: string,
  query: string,
  limit: number,
): Promise<SearchHit[]> {
  const terms = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .slice(0, 6);
  if (!terms.length) return [];

  const c = await db();
  const [docs, srcs] = await Promise.all([
    c.execute({
      sql: "SELECT id, title, content FROM documents WHERE workspace_id = ?",
      args: [workspaceId],
    }),
    c.execute({
      sql: "SELECT id, title, content FROM sources WHERE workspace_id = ?",
      args: [workspaceId],
    }),
  ]);

  const scoreRow = (
    row: Row,
    type: "document" | "source",
  ): SearchHit | null => {
    const title = str(row.title);
    const body = str(row.content);
    const hay = `${title}\n${body}`.toLowerCase();
    let score = 0;
    let firstHit = -1;
    for (const t of terms) {
      const inTitle = title.toLowerCase().includes(t);
      const idx = hay.indexOf(t);
      if (idx === -1) continue;
      score += inTitle ? 5 : 1;
      if (firstHit === -1 || idx < firstHit) firstHit = idx;
    }
    if (!score) return null;
    const start = Math.max(0, firstHit - 60);
    return {
      id: str(row.id),
      type,
      title,
      excerpt:
        (start > 0 ? "… " : "") +
        body.slice(start, start + 220).replace(/\s+/g, " ").trim() +
        " …",
      score,
    };
  };

  return [
    ...docs.rows.map((r) => scoreRow(r as Row, "document")),
    ...srcs.rows.map((r) => scoreRow(r as Row, "source")),
  ]
    .filter((h): h is SearchHit => h !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

async function reindex(
  workspaceId: string,
  entityId: string,
  type: "document" | "source",
  title: string,
  body: string,
) {
  if (!hasFts()) return;
  const c = await db();
  await c.execute({
    sql: "DELETE FROM search_index WHERE entity_id = ?",
    args: [entityId],
  });
  await c.execute({
    sql: `INSERT INTO search_index (entity_id, workspace_id, entity_type, title, body)
          VALUES (?, ?, ?, ?, ?)`,
    args: [entityId, workspaceId, type, title, body],
  });
}

/* --------------------------- threads ------------------------------ */

export async function listThreads(workspaceId: string): Promise<Thread[]> {
  const c = await db();
  const r = await c.execute({
    sql: "SELECT * FROM threads WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT 50",
    args: [workspaceId],
  });
  return r.rows.map((x) => toThread(x as Row));
}

export async function createThread(input: {
  workspaceId: string;
  title?: string;
  mode: Thread["mode"];
  createdBy: string;
}): Promise<Thread> {
  const c = await db();
  const tid = id("thr");
  const ts = nowIso();
  await c.execute({
    sql: `INSERT INTO threads (id, workspace_id, title, mode, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [tid, input.workspaceId, input.title ?? "New chat", input.mode, input.createdBy, ts, ts],
  });
  return {
    id: tid,
    workspaceId: input.workspaceId,
    title: input.title ?? "New chat",
    mode: input.mode,
    createdBy: input.createdBy,
    createdAt: ts,
    updatedAt: ts,
  };
}

export async function touchThread(threadId: string, title?: string) {
  const c = await db();
  if (title) {
    await c.execute({
      sql: "UPDATE threads SET updated_at = ?, title = ? WHERE id = ?",
      args: [nowIso(), title, threadId],
    });
  } else {
    await c.execute({
      sql: "UPDATE threads SET updated_at = ? WHERE id = ?",
      args: [nowIso(), threadId],
    });
  }
}

export async function deleteThread(workspaceId: string, threadId: string) {
  const c = await db();
  await c.execute({
    sql: "DELETE FROM threads WHERE workspace_id = ? AND id = ?",
    args: [workspaceId, threadId],
  });
}

/* --------------------------- messages ----------------------------- */

export async function listMessages(threadId: string): Promise<Message[]> {
  const c = await db();
  const r = await c.execute({
    sql: "SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at, rowid",
    args: [threadId],
  });
  return r.rows.map((x) => toMessage(x as Row));
}

export async function createMessage(input: {
  threadId: string;
  role: MessageRole;
  content: string;
  tools?: ToolInvocation[];
  citations?: Citation[];
  attachments?: string[];
  inputTokens?: number;
  outputTokens?: number;
}): Promise<Message> {
  const c = await db();
  const mid = id("msg");
  const ts = nowIso();
  await c.execute({
    sql: `INSERT INTO messages
            (id, thread_id, role, content, tools, citations, attachments, input_tokens, output_tokens, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      mid,
      input.threadId,
      input.role,
      input.content,
      JSON.stringify(input.tools ?? []),
      JSON.stringify(input.citations ?? []),
      JSON.stringify(input.attachments ?? []),
      input.inputTokens ?? 0,
      input.outputTokens ?? 0,
      ts,
    ],
  });
  return {
    id: mid,
    threadId: input.threadId,
    role: input.role,
    content: input.content,
    tools: input.tools ?? [],
    citations: input.citations ?? [],
    attachments: input.attachments ?? [],
    inputTokens: input.inputTokens ?? 0,
    outputTokens: input.outputTokens ?? 0,
    createdAt: ts,
  };
}

export async function updateMessage(
  messageId: string,
  patch: {
    content?: string;
    tools?: ToolInvocation[];
    citations?: Citation[];
    inputTokens?: number;
    outputTokens?: number;
  },
) {
  const sets: string[] = [];
  const args: unknown[] = [];
  if (patch.content !== undefined)
    (sets.push("content = ?"), args.push(patch.content));
  if (patch.tools !== undefined)
    (sets.push("tools = ?"), args.push(JSON.stringify(patch.tools)));
  if (patch.citations !== undefined)
    (sets.push("citations = ?"), args.push(JSON.stringify(patch.citations)));
  if (patch.inputTokens !== undefined)
    (sets.push("input_tokens = ?"), args.push(patch.inputTokens));
  if (patch.outputTokens !== undefined)
    (sets.push("output_tokens = ?"), args.push(patch.outputTokens));
  if (!sets.length) return;
  args.push(messageId);
  const c = await db();
  await c.execute({
    sql: `UPDATE messages SET ${sets.join(", ")} WHERE id = ?`,
    args: args as never,
  });
}

/* ----------------------- proposed changes ------------------------- */

export async function listPendingChanges(
  workspaceId: string,
): Promise<ProposedChange[]> {
  const c = await db();
  const r = await c.execute({
    sql: `SELECT * FROM proposed_changes
          WHERE workspace_id = ? AND status = 'pending'
          ORDER BY created_at DESC`,
    args: [workspaceId],
  });
  return r.rows.map((x) => toChange(x as Row));
}

export async function getChange(
  workspaceId: string,
  changeId: string,
): Promise<ProposedChange | null> {
  const c = await db();
  const r = await c.execute({
    sql: "SELECT * FROM proposed_changes WHERE workspace_id = ? AND id = ?",
    args: [workspaceId, changeId],
  });
  return r.rows[0] ? toChange(r.rows[0] as Row) : null;
}

export async function createChange(input: {
  workspaceId: string;
  documentId: string;
  threadId: string | null;
  before: string | null;
  after: string;
  summary: string;
  createdBy?: "agent" | "inline";
}): Promise<ProposedChange> {
  const c = await db();
  const cid = id("chg");
  const ts = nowIso();
  await c.execute({
    sql: `INSERT INTO proposed_changes
            (id, workspace_id, document_id, thread_id, before, after, summary, status, created_by, created_at, resolved_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, NULL)`,
    args: [
      cid,
      input.workspaceId,
      input.documentId,
      input.threadId,
      input.before,
      input.after,
      input.summary,
      input.createdBy ?? "agent",
      ts,
    ],
  });
  return {
    id: cid,
    workspaceId: input.workspaceId,
    documentId: input.documentId,
    threadId: input.threadId,
    before: input.before,
    after: input.after,
    summary: input.summary,
    status: "pending",
    createdBy: input.createdBy ?? "agent",
    createdAt: ts,
    resolvedAt: null,
  };
}

/**
 * Resolve a change, writing `applied` onto the document when accepted.
 *
 * `applied` is passed in rather than read from `change.after` because the user
 * can accept a *subset* of hunks — the merged result is computed client-side,
 * and recording it keeps the audit trail honest about what actually landed.
 */
export async function resolveChangeWithContent(
  workspaceId: string,
  changeId: string,
  action: "accepted" | "rejected",
  applied: string,
  actorId?: string,
): Promise<{ change: ProposedChange; document: Document | null } | null> {
  const change = await getChange(workspaceId, changeId);
  if (!change || change.status !== "pending") return null;

  const ts = nowIso();
  const c = await db();
  await c.execute({
    sql: `UPDATE proposed_changes SET status = ?, resolved_at = ?, after = ?
          WHERE id = ? AND status = 'pending'`,
    args: [action, ts, action === "accepted" ? applied : change.after, changeId],
  });

  let document: Document | null;
  if (action === "accepted") {
    // Always snapshot before an AI change lands, bypassing the time/size gate
    // that throttles autosave — every accepted diff must be undoable.
    const before = await getDocument(workspaceId, change.documentId);
    if (before) {
      await snapshotDocument({
        workspaceId,
        documentId: change.documentId,
        content: before.content,
        origin: change.createdBy === "inline" ? "inline" : "agent",
        label: `Before: ${change.summary}`.slice(0, 120),
        createdBy: actorId ?? before.updatedBy ?? before.createdBy,
      });
    }
    document = await updateDocument(workspaceId, change.documentId, {
      content: applied,
      updatedBy: actorId,
      skipSnapshot: true,
    });
  } else {
    document = await getDocument(workspaceId, change.documentId);
  }

  return {
    change: {
      ...change,
      after: action === "accepted" ? applied : change.after,
      status: action,
      resolvedAt: ts,
    },
    document,
  };
}

/** Convenience wrapper that accepts or rejects a change wholesale. */
export async function resolveChange(
  workspaceId: string,
  changeId: string,
  action: "accepted" | "rejected",
) {
  const change = await getChange(workspaceId, changeId);
  if (!change) return null;
  return resolveChangeWithContent(workspaceId, changeId, action, change.after);
}

/* ------------------------- integrations --------------------------- */

export async function listIntegrations(
  workspaceId: string,
): Promise<Integration[]> {
  const c = await db();
  const r = await c.execute({
    sql: "SELECT * FROM integrations WHERE workspace_id = ? ORDER BY provider",
    args: [workspaceId],
  });
  return r.rows.map((x) => toIntegration(x as Row));
}

export async function upsertIntegration(input: {
  workspaceId: string;
  provider: IntegrationProvider;
  status: IntegrationStatus;
  accountLabel?: string | null;
  config?: Record<string, unknown>;
  lastError?: string | null;
}): Promise<Integration> {
  const c = await db();
  await c.execute({
    sql: `INSERT INTO integrations
            (id, workspace_id, provider, status, account_label, config, last_checked_at, last_error)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (workspace_id, provider) DO UPDATE SET
            status = excluded.status,
            account_label = excluded.account_label,
            config = excluded.config,
            last_checked_at = excluded.last_checked_at,
            last_error = excluded.last_error`,
    args: [
      `int_${input.provider}`,
      input.workspaceId,
      input.provider,
      input.status,
      input.accountLabel ?? null,
      JSON.stringify(input.config ?? {}),
      nowIso(),
      input.lastError ?? null,
    ],
  });
  const all = await listIntegrations(input.workspaceId);
  const found = all.find((i) => i.provider === input.provider);
  if (!found) throw new Error("Integration missing after upsert");
  return found;
}

/* --------------------------- tickets ------------------------------ */

export async function createTicketBatch(input: {
  workspaceId: string;
  documentId: string | null;
  threadId: string | null;
  tickets: DraftTicket[];
}): Promise<TicketBatch> {
  const c = await db();
  const bid = id("btc");
  const ts = nowIso();
  await c.execute({
    sql: `INSERT INTO ticket_batches
            (id, workspace_id, document_id, thread_id, tickets, status, provider, created_at)
          VALUES (?, ?, ?, ?, ?, 'draft', NULL, ?)`,
    args: [
      bid,
      input.workspaceId,
      input.documentId,
      input.threadId,
      JSON.stringify(input.tickets),
      ts,
    ],
  });
  return {
    id: bid,
    workspaceId: input.workspaceId,
    documentId: input.documentId,
    threadId: input.threadId,
    tickets: input.tickets,
    status: "draft",
    provider: null,
    createdAt: ts,
  };
}

export async function getTicketBatch(
  workspaceId: string,
  batchId: string,
): Promise<TicketBatch | null> {
  const c = await db();
  const r = await c.execute({
    sql: "SELECT * FROM ticket_batches WHERE workspace_id = ? AND id = ?",
    args: [workspaceId, batchId],
  });
  return r.rows[0] ? toBatch(r.rows[0] as Row) : null;
}

export async function listTicketBatches(
  workspaceId: string,
): Promise<TicketBatch[]> {
  const c = await db();
  const r = await c.execute({
    sql: "SELECT * FROM ticket_batches WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 25",
    args: [workspaceId],
  });
  return r.rows.map((x) => toBatch(x as Row));
}

export async function markBatchPushed(
  workspaceId: string,
  batchId: string,
  provider: IntegrationProvider,
  tickets: DraftTicket[],
) {
  const c = await db();
  await c.execute({
    sql: `UPDATE ticket_batches SET status = 'pushed', provider = ?, tickets = ?
          WHERE workspace_id = ? AND id = ?`,
    args: [provider, JSON.stringify(tickets), workspaceId, batchId],
  });
}

/* ---------------------------- audit ------------------------------- */

export async function audit(input: {
  workspaceId: string;
  actorId: string;
  actorName: string;
  action: string;
  target?: string;
  meta?: Record<string, unknown>;
}) {
  const c = await db();
  await c.execute({
    sql: `INSERT INTO audit_log (id, workspace_id, actor_id, actor_name, action, target, meta, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id("aud"),
      input.workspaceId,
      input.actorId,
      input.actorName,
      input.action,
      input.target ?? "",
      JSON.stringify(input.meta ?? {}),
      nowIso(),
    ],
  });
}

export async function listAudit(
  workspaceId: string,
  limit = 60,
): Promise<AuditEntry[]> {
  const c = await db();
  const r = await c.execute({
    sql: "SELECT * FROM audit_log WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?",
    args: [workspaceId, limit],
  });
  return r.rows.map((x) => {
    const row = x as Row;
    return {
      id: str(row.id),
      workspaceId: str(row.workspace_id),
      actorId: str(row.actor_id),
      actorName: str(row.actor_name),
      action: str(row.action),
      target: str(row.target),
      meta: json<Record<string, unknown>>(row.meta, {}),
      createdAt: str(row.created_at),
    };
  });
}

/* ---------------------------- usage ------------------------------- */

export async function recordUsage(input: {
  workspaceId: string;
  userId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}) {
  const c = await db();
  const day = nowIso().slice(0, 10);
  await c.execute({
    sql: `INSERT INTO usage_records
            (id, workspace_id, user_id, day, model, input_tokens, output_tokens, requests)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1)
          ON CONFLICT (workspace_id, user_id, day, model) DO UPDATE SET
            input_tokens = input_tokens + excluded.input_tokens,
            output_tokens = output_tokens + excluded.output_tokens,
            requests = requests + 1`,
    args: [
      `use_${input.userId}_${day}`,
      input.workspaceId,
      input.userId,
      day,
      input.model,
      input.inputTokens,
      input.outputTokens,
    ],
  });
}

export async function listUsage(
  workspaceId: string,
  days = 14,
): Promise<UsageRecord[]> {
  const c = await db();
  const r = await c.execute({
    sql: `SELECT * FROM usage_records WHERE workspace_id = ?
          ORDER BY day DESC LIMIT ?`,
    args: [workspaceId, days * 10],
  });
  return r.rows.map((x) => {
    const row = x as Row;
    return {
      id: str(row.id),
      workspaceId: str(row.workspace_id),
      userId: str(row.user_id),
      day: str(row.day),
      model: str(row.model),
      inputTokens: num(row.input_tokens),
      outputTokens: num(row.output_tokens),
      requests: num(row.requests),
    };
  });
}

/* ---------------------------- shares ------------------------------ */

export interface Share {
  id: string;
  workspaceId: string;
  documentId: string;
  token: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

const toShare = (r: Row): Share => ({
  id: str(r.id),
  workspaceId: str(r.workspace_id),
  documentId: str(r.document_id),
  token: str(r.token),
  createdBy: str(r.created_by),
  createdAt: str(r.created_at),
  expiresAt: nullableStr(r.expires_at),
  revokedAt: nullableStr(r.revoked_at),
});

export async function listShares(
  workspaceId: string,
  documentId: string,
): Promise<Share[]> {
  const c = await db();
  const r = await c.execute({
    sql: `SELECT * FROM shares WHERE workspace_id = ? AND document_id = ?
          ORDER BY created_at DESC`,
    args: [workspaceId, documentId],
  });
  return r.rows.map((x) => toShare(x as Row));
}

export async function createShare(input: {
  workspaceId: string;
  documentId: string;
  createdBy: string;
  expiresInDays?: number | null;
}): Promise<Share> {
  const c = await db();
  const sid = id("shr");
  // 32 chars of nanoid ≈ 190 bits — not guessable by enumeration.
  const token = nanoid(32);
  const ts = nowIso();
  const expires =
    input.expiresInDays && input.expiresInDays > 0
      ? new Date(Date.now() + input.expiresInDays * 86400000).toISOString()
      : null;

  await c.execute({
    sql: `INSERT INTO shares
            (id, workspace_id, document_id, token, created_by, created_at, expires_at, revoked_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
    args: [sid, input.workspaceId, input.documentId, token, input.createdBy, ts, expires],
  });

  return {
    id: sid,
    workspaceId: input.workspaceId,
    documentId: input.documentId,
    token,
    createdBy: input.createdBy,
    createdAt: ts,
    expiresAt: expires,
    revokedAt: null,
  };
}

export async function revokeShare(workspaceId: string, shareId: string) {
  const c = await db();
  await c.execute({
    sql: "UPDATE shares SET revoked_at = ? WHERE workspace_id = ? AND id = ?",
    args: [nowIso(), workspaceId, shareId],
  });
}

/**
 * Public resolution by token. Deliberately *not* workspace-scoped — the token
 * is the only credential — so it must enforce revocation and expiry itself.
 */
export async function resolveShare(
  token: string,
): Promise<{ document: Document; workspace: Workspace } | null> {
  if (!token || token.length < 16) return null;
  const c = await db();
  const r = await c.execute({
    sql: `SELECT d.*, s.expires_at AS s_expires, s.revoked_at AS s_revoked
          FROM shares s JOIN documents d ON d.id = s.document_id
          WHERE s.token = ?`,
    args: [token],
  });
  const row = r.rows[0] as Row | undefined;
  if (!row) return null;
  if (nullableStr(row.s_revoked)) return null;
  const expires = nullableStr(row.s_expires);
  if (expires && Date.parse(expires) < Date.now()) return null;

  const document = toDocument(row);
  const ws = await c.execute({
    sql: "SELECT * FROM workspaces WHERE id = ?",
    args: [document.workspaceId],
  });
  if (!ws.rows[0]) return null;
  return { document, workspace: toWorkspace(ws.rows[0] as Row) };
}

/* ------------------------ document versions ----------------------- */

export interface DocumentVersion {
  id: string;
  workspaceId: string;
  documentId: string;
  content: string;
  origin: "manual" | "agent" | "inline" | "restore";
  label: string;
  createdBy: string;
  createdAt: string;
}

const toVersion = (r: Row): DocumentVersion => ({
  id: str(r.id),
  workspaceId: str(r.workspace_id),
  documentId: str(r.document_id),
  content: str(r.content),
  origin: str(r.origin, "manual") as DocumentVersion["origin"],
  label: str(r.label),
  createdBy: str(r.created_by),
  createdAt: str(r.created_at),
});

const MAX_VERSIONS = 50;

/** Records a snapshot and prunes the document's history to MAX_VERSIONS. */
export async function snapshotDocument(input: {
  workspaceId: string;
  documentId: string;
  content: string;
  origin: DocumentVersion["origin"];
  label?: string;
  createdBy: string;
}): Promise<void> {
  const c = await db();
  await c.execute({
    sql: `INSERT INTO document_versions
            (id, workspace_id, document_id, content, origin, label, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id("ver"),
      input.workspaceId,
      input.documentId,
      input.content,
      input.origin,
      input.label ?? "",
      input.createdBy,
      nowIso(),
    ],
  });
  await c.execute({
    sql: `DELETE FROM document_versions
          WHERE document_id = ? AND id NOT IN (
            SELECT id FROM document_versions
            WHERE document_id = ? ORDER BY created_at DESC LIMIT ?
          )`,
    args: [input.documentId, input.documentId, MAX_VERSIONS],
  });
}

export async function listVersions(
  workspaceId: string,
  documentId: string,
): Promise<DocumentVersion[]> {
  const c = await db();
  const r = await c.execute({
    sql: `SELECT * FROM document_versions
          WHERE workspace_id = ? AND document_id = ?
          ORDER BY created_at DESC`,
    args: [workspaceId, documentId],
  });
  return r.rows.map((x) => toVersion(x as Row));
}

export async function getVersion(
  workspaceId: string,
  versionId: string,
): Promise<DocumentVersion | null> {
  const c = await db();
  const r = await c.execute({
    sql: "SELECT * FROM document_versions WHERE workspace_id = ? AND id = ?",
    args: [workspaceId, versionId],
  });
  return r.rows[0] ? toVersion(r.rows[0] as Row) : null;
}

/** Timestamp of the newest snapshot, used to rate-limit autosave snapshots. */
async function lastSnapshotAt(documentId: string): Promise<number> {
  const c = await db();
  const r = await c.execute({
    sql: `SELECT created_at FROM document_versions
          WHERE document_id = ? ORDER BY created_at DESC LIMIT 1`,
    args: [documentId],
  });
  const row = r.rows[0] as Row | undefined;
  return row ? Date.parse(str(row.created_at)) : 0;
}

/* --------------------------- comments ----------------------------- */

export interface Comment {
  id: string;
  workspaceId: string;
  documentId: string;
  parentId: string | null;
  authorId: string;
  body: string;
  anchorText: string;
  resolved: boolean;
  createdAt: string;
}

const toComment = (r: Row): Comment => ({
  id: str(r.id),
  workspaceId: str(r.workspace_id),
  documentId: str(r.document_id),
  parentId: nullableStr(r.parent_id),
  authorId: str(r.author_id),
  body: str(r.body),
  anchorText: str(r.anchor_text),
  resolved: num(r.resolved) === 1,
  createdAt: str(r.created_at),
});

export async function listComments(
  workspaceId: string,
  documentId: string,
): Promise<Comment[]> {
  const c = await db();
  const r = await c.execute({
    sql: `SELECT * FROM comments WHERE workspace_id = ? AND document_id = ?
          ORDER BY created_at`,
    args: [workspaceId, documentId],
  });
  return r.rows.map((x) => toComment(x as Row));
}

export async function listAllComments(workspaceId: string): Promise<Comment[]> {
  const c = await db();
  const r = await c.execute({
    sql: `SELECT * FROM comments WHERE workspace_id = ? AND resolved = 0
          ORDER BY created_at DESC LIMIT 200`,
    args: [workspaceId],
  });
  return r.rows.map((x) => toComment(x as Row));
}

export async function createComment(input: {
  workspaceId: string;
  documentId: string;
  parentId?: string | null;
  authorId: string;
  body: string;
  anchorText?: string;
}): Promise<Comment> {
  const c = await db();
  const cid = id("cmt");
  const ts = nowIso();
  await c.execute({
    sql: `INSERT INTO comments
            (id, workspace_id, document_id, parent_id, author_id, body, anchor_text, resolved, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    args: [
      cid,
      input.workspaceId,
      input.documentId,
      input.parentId ?? null,
      input.authorId,
      input.body,
      input.anchorText ?? "",
      ts,
    ],
  });
  return {
    id: cid,
    workspaceId: input.workspaceId,
    documentId: input.documentId,
    parentId: input.parentId ?? null,
    authorId: input.authorId,
    body: input.body,
    anchorText: input.anchorText ?? "",
    resolved: false,
    createdAt: ts,
  };
}

export async function setCommentResolved(
  workspaceId: string,
  commentId: string,
  resolved: boolean,
) {
  const c = await db();
  // Resolving a root comment resolves its replies too.
  await c.execute({
    sql: `UPDATE comments SET resolved = ?
          WHERE workspace_id = ? AND (id = ? OR parent_id = ?)`,
    args: [resolved ? 1 : 0, workspaceId, commentId, commentId],
  });
}

export async function deleteComment(workspaceId: string, commentId: string) {
  const c = await db();
  await c.execute({
    sql: "DELETE FROM comments WHERE workspace_id = ? AND (id = ? OR parent_id = ?)",
    args: [workspaceId, commentId, commentId],
  });
}

/* --------------------------- api keys ----------------------------- */

export async function listApiKeys(workspaceId: string): Promise<ApiKey[]> {
  const c = await db();
  const r = await c.execute({
    sql: "SELECT * FROM api_keys WHERE workspace_id = ? ORDER BY created_at DESC",
    args: [workspaceId],
  });
  return r.rows.map((x) => {
    const row = x as Row;
    return {
      id: str(row.id),
      workspaceId: str(row.workspace_id),
      name: str(row.name),
      prefix: str(row.prefix),
      createdBy: str(row.created_by),
      createdAt: str(row.created_at),
      lastUsedAt: nullableStr(row.last_used_at),
      revokedAt: nullableStr(row.revoked_at),
    };
  });
}

/** Returns the plaintext secret exactly once — it is never stored. */
export async function createApiKey(input: {
  workspaceId: string;
  name: string;
  createdBy: string;
}): Promise<{ key: ApiKey; secret: string }> {
  const secret = `prism_live_${nanoid(32)}`;
  const prefix = secret.slice(0, 12);
  const hash = await sha256(secret);
  const c = await db();
  const kid = id("key");
  const ts = nowIso();
  await c.execute({
    sql: `INSERT INTO api_keys (id, workspace_id, name, prefix, hash, created_by, created_at, last_used_at, revoked_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
    args: [kid, input.workspaceId, input.name, prefix, hash, input.createdBy, ts],
  });
  return {
    key: {
      id: kid,
      workspaceId: input.workspaceId,
      name: input.name,
      prefix,
      createdBy: input.createdBy,
      createdAt: ts,
      lastUsedAt: null,
      revokedAt: null,
    },
    secret,
  };
}

export async function revokeApiKey(workspaceId: string, keyId: string) {
  const c = await db();
  await c.execute({
    sql: "UPDATE api_keys SET revoked_at = ? WHERE workspace_id = ? AND id = ?",
    args: [nowIso(), workspaceId, keyId],
  });
}

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
