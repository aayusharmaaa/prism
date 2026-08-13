import * as repo from "@/lib/db/repo";
import { HttpError, handle, requireRole, requireSession } from "@/lib/session";
import { parseCsv } from "@/lib/csv";
import type { SourceKind } from "@/lib/types";

export const dynamic = "force-dynamic";

const KINDS: SourceKind[] = [
  "interview",
  "feedback",
  "ticket",
  "metric",
  "competitor",
  "transcript",
];

/** Uploads are held in memory and stored as text, so cap them. */
const MAX_BYTES = 2 * 1024 * 1024;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  return handle(async () => {
    const session = await requireSession(slug);
    return { sources: await repo.listSources(session.workspace.id) };
  });
}

/**
 * Create a source from pasted text or an uploaded file.
 *
 * Accepts JSON (paste) or multipart/form-data (upload). Tabular content is
 * parsed so the shape is known up front — column names and types go into the
 * existing `meta` JSON column, which powers both the table preview and the
 * `analyze_source` agent tool.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  return handle(async () => {
    const session = await requireSession(slug);
    requireRole(session, "editor");

    let title = "";
    let origin = "";
    let content = "";
    let kind: SourceKind = "feedback";
    let filename = "";

    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        throw new HttpError(400, "No file provided");
      }
      if (file.size > MAX_BYTES) {
        throw new HttpError(
          413,
          `File is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is 2 MB.`,
        );
      }
      content = await file.text();
      filename = file.name;
      title = String(form.get("title") ?? "").trim() || stripExt(file.name);
      origin = String(form.get("origin") ?? "").trim() || "Upload";
      const k = String(form.get("kind") ?? "");
      if (KINDS.includes(k as SourceKind)) kind = k as SourceKind;
    } else {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      content = typeof body.content === "string" ? body.content : "";
      title = String(body.title ?? "").trim();
      origin = String(body.origin ?? "").trim() || "Pasted";
      const k = String(body.kind ?? "");
      if (KINDS.includes(k as SourceKind)) kind = k as SourceKind;
    }

    if (!content.trim()) throw new HttpError(400, "Content is empty");
    if (content.length > MAX_BYTES) {
      throw new HttpError(413, "Content exceeds the 2 MB limit");
    }
    if (!title) title = firstLine(content);

    // Detect tabular content by extension or by successfully parsing a grid.
    const meta: Record<string, unknown> = { filename: filename || undefined };
    const looksTabular =
      /\.(csv|tsv)$/i.test(filename) || isProbablyTabular(content);

    if (looksTabular) {
      const parsed = parseCsv(content);
      if (parsed.headers.length > 1 && parsed.rows.length > 0) {
        meta.format = "table";
        meta.delimiter = parsed.delimiter;
        meta.rowCount = parsed.rows.length;
        meta.truncated = parsed.truncated;
        meta.columns = parsed.columns;
        if (kind === "feedback" && /\.(csv|tsv)$/i.test(filename)) {
          // A spreadsheet of rows is evidence; keep the default but record it.
          meta.inferredFrom = "file-extension";
        }
      }
    }

    const source = await repo.createSource({
      workspaceId: session.workspace.id,
      kind,
      title,
      origin,
      content,
      meta,
    });

    await repo.audit({
      workspaceId: session.workspace.id,
      actorId: session.user.id,
      actorName: session.user.name,
      action: "source.added",
      target: source.title,
      meta: { sourceId: source.id, format: meta.format ?? "text" },
    });

    return { source };
  });
}

const stripExt = (name: string) => name.replace(/\.[^.]+$/, "");

function firstLine(text: string): string {
  const line = text.split("\n").find((l) => l.trim())?.trim() ?? "Untitled";
  return line.length > 70 ? `${line.slice(0, 70)}…` : line;
}

/** Cheap sniff: several lines that all split into the same field count. */
function isProbablyTabular(text: string): boolean {
  const lines = text.split(/\r?\n/).filter(Boolean).slice(0, 6);
  if (lines.length < 2) return false;
  for (const d of [",", "\t", ";"]) {
    const counts = lines.map((l) => l.split(d).length);
    if (counts[0] >= 2 && counts.every((c) => c === counts[0])) return true;
  }
  return false;
}
