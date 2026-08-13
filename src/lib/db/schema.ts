/**
 * Multi-tenant schema. Every tenant-scoped table carries `workspace_id` and is
 * always queried through it — the repository layer never exposes a read that
 * isn't workspace-scoped, which is what keeps this honest as a B2B product.
 */
export const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS workspaces (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  plan        TEXT NOT NULL DEFAULT 'trial',
  seats       INTEGER NOT NULL DEFAULT 5,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  avatar_hue  INTEGER NOT NULL DEFAULT 250
);

CREATE TABLE IF NOT EXISTS memberships (
  workspace_id   TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role           TEXT NOT NULL DEFAULT 'editor',
  joined_at      TEXT NOT NULL,
  last_active_at TEXT,
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS folders (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  parent_id    TEXT REFERENCES folders(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  sort_order   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_folders_ws ON folders(workspace_id);

CREATE TABLE IF NOT EXISTS documents (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  folder_id    TEXT REFERENCES folders(id) ON DELETE SET NULL,
  kind         TEXT NOT NULL DEFAULT 'note',
  title        TEXT NOT NULL,
  content      TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'draft',
  created_by   TEXT NOT NULL,
  updated_by   TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_ws ON documents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_id);

CREATE TABLE IF NOT EXISTS sources (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,
  title        TEXT NOT NULL,
  origin       TEXT NOT NULL DEFAULT '',
  content      TEXT NOT NULL DEFAULT '',
  meta         TEXT NOT NULL DEFAULT '{}',
  captured_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sources_ws ON sources(workspace_id);

CREATE TABLE IF NOT EXISTS threads (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title        TEXT NOT NULL DEFAULT 'New chat',
  mode         TEXT NOT NULL DEFAULT 'agent',
  created_by   TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_threads_ws ON threads(workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id            TEXT PRIMARY KEY,
  thread_id     TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  role          TEXT NOT NULL,
  content       TEXT NOT NULL DEFAULT '',
  tools         TEXT NOT NULL DEFAULT '[]',
  citations     TEXT NOT NULL DEFAULT '[]',
  attachments   TEXT NOT NULL DEFAULT '[]',
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, created_at);

CREATE TABLE IF NOT EXISTS proposed_changes (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_id  TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  thread_id    TEXT,
  before       TEXT,
  after        TEXT NOT NULL,
  summary      TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'pending',
  created_by   TEXT NOT NULL DEFAULT 'agent',
  created_at   TEXT NOT NULL,
  resolved_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_changes_doc ON proposed_changes(document_id, status);
CREATE INDEX IF NOT EXISTS idx_changes_ws ON proposed_changes(workspace_id, status);

CREATE TABLE IF NOT EXISTS integrations (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'disconnected',
  account_label   TEXT,
  config          TEXT NOT NULL DEFAULT '{}',
  last_checked_at TEXT,
  last_error      TEXT,
  UNIQUE (workspace_id, provider)
);

CREATE TABLE IF NOT EXISTS ticket_batches (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_id  TEXT,
  thread_id    TEXT,
  tickets      TEXT NOT NULL DEFAULT '[]',
  status       TEXT NOT NULL DEFAULT 'draft',
  provider     TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_batches_ws ON ticket_batches(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_log (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id     TEXT NOT NULL,
  actor_name   TEXT NOT NULL,
  action       TEXT NOT NULL,
  target       TEXT NOT NULL DEFAULT '',
  meta         TEXT NOT NULL DEFAULT '{}',
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_ws ON audit_log(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS usage_records (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL,
  day           TEXT NOT NULL,
  model         TEXT NOT NULL,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  requests      INTEGER NOT NULL DEFAULT 0,
  UNIQUE (workspace_id, user_id, day, model)
);
CREATE INDEX IF NOT EXISTS idx_usage_ws ON usage_records(workspace_id, day DESC);

CREATE TABLE IF NOT EXISTS shares (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_id  TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  token        TEXT NOT NULL UNIQUE,
  created_by   TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  expires_at   TEXT,
  revoked_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_shares_doc ON shares(document_id);

CREATE TABLE IF NOT EXISTS document_versions (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_id  TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  origin       TEXT NOT NULL DEFAULT 'manual',
  label        TEXT NOT NULL DEFAULT '',
  created_by   TEXT NOT NULL,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_versions_doc
  ON document_versions(document_id, created_at DESC);

CREATE TABLE IF NOT EXISTS comments (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_id  TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  parent_id    TEXT REFERENCES comments(id) ON DELETE CASCADE,
  author_id    TEXT NOT NULL,
  body         TEXT NOT NULL,
  anchor_text  TEXT NOT NULL DEFAULT '',
  resolved     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_doc
  ON comments(document_id, created_at);

CREATE TABLE IF NOT EXISTS api_keys (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  prefix       TEXT NOT NULL,
  hash         TEXT NOT NULL,
  created_by   TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_keys_ws ON api_keys(workspace_id);
`;

/**
 * Additive column migrations.
 *
 * `CREATE TABLE IF NOT EXISTS` never alters an existing table, so columns added
 * after a database was first created need an explicit ALTER. SQLite has no
 * `ADD COLUMN IF NOT EXISTS`, so each statement is run independently and a
 * "duplicate column" error is treated as already-applied.
 *
 * This is deliberately minimal — a real deployment wants numbered, ordered
 * migrations — but it stops an existing local database from silently breaking.
 */
export const MIGRATIONS: string[] = [
  `ALTER TABLE documents ADD COLUMN updated_by TEXT`,
];

/**
 * Full-text search over documents + sources. Kept separate because FTS5 may be
 * unavailable in some libSQL builds; callers fall back to LIKE scanning.
 */
export const FTS_SCHEMA = `
CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
  entity_id UNINDEXED,
  workspace_id UNINDEXED,
  entity_type UNINDEXED,
  title,
  body,
  tokenize = 'porter unicode61'
);
`;
