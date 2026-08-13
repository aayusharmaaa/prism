import { createClient, type Client } from "@libsql/client";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { SCHEMA, FTS_SCHEMA, MIGRATIONS } from "./schema";
import { seedIfEmpty } from "./seed";

/**
 * Single shared connection.
 *
 * Local dev points at a file; production points at Turso (or any libSQL
 * server) by setting DATABASE_URL + DATABASE_AUTH_TOKEN. Nothing else in the
 * codebase changes between the two.
 */
declare global {
  // eslint-disable-next-line no-var
  var __prismDb: { client: Client; ready: Promise<void> } | undefined;
}

let ftsAvailable = true;
export const hasFts = () => ftsAvailable;

const DEFAULT_URL = "file:./.data/prism.db";

/**
 * libSQL will not create the parent directory of a `file:` database, and
 * `.data/` is gitignored — so a fresh clone would fail to boot with a bare
 * SQLITE_CANTOPEN. Create it before connecting.
 */
function ensureLocalDir(url: string) {
  if (!url.startsWith("file:")) return;
  const path = url.slice("file:".length).replace(/^\/{2,}/, "/");
  try {
    mkdirSync(dirname(path), { recursive: true });
  } catch (err) {
    // Surface a cause the reader can act on, rather than "code 14".
    throw new Error(
      `Could not create the database directory '${dirname(path)}': ` +
        `${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function create(): { client: Client; ready: Promise<void> } {
  const url = process.env.DATABASE_URL ?? DEFAULT_URL;
  ensureLocalDir(url);

  const client = createClient({
    url,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });

  const ready = (async () => {
    // executeMultiple runs the DDL as one script.
    await client.executeMultiple(SCHEMA);

    for (const sql of MIGRATIONS) {
      try {
        await client.execute(sql);
      } catch (err) {
        // Already applied is the expected case; anything else is a real fault.
        const message = err instanceof Error ? err.message : String(err);
        if (!/duplicate column name/i.test(message)) throw err;
      }
    }

    try {
      await client.executeMultiple(FTS_SCHEMA);
    } catch {
      // FTS5 not compiled in — search falls back to LIKE scanning.
      ftsAvailable = false;
    }
    await seedIfEmpty(client, ftsAvailable);
  })();

  return { client, ready };
}

/** Returns the connection, guaranteeing migrations + seed have completed. */
export async function db(): Promise<Client> {
  if (!globalThis.__prismDb) globalThis.__prismDb = create();
  const handle = globalThis.__prismDb;
  try {
    await handle.ready;
  } catch (err) {
    // Let the next request retry rather than caching a poisoned promise.
    globalThis.__prismDb = undefined;
    throw err;
  }
  return handle.client;
}

/* --------------------------- row helpers -------------------------- */

export type Row = Record<string, unknown>;

export const str = (v: unknown, fallback = ""): string =>
  v === null || v === undefined ? fallback : String(v);

export const nullableStr = (v: unknown): string | null =>
  v === null || v === undefined ? null : String(v);

export const num = (v: unknown, fallback = 0): number => {
  if (v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Parses a JSON column, tolerating legacy/blank values. */
export function json<T>(v: unknown, fallback: T): T {
  if (v === null || v === undefined || v === "") return fallback;
  if (typeof v === "object") return v as T;
  try {
    const parsed = JSON.parse(String(v));
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

export const nowIso = () => new Date().toISOString();
