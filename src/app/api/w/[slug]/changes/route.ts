import * as repo from "@/lib/db/repo";
import { handle, requireRole, requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  return handle(async () => {
    const session = await requireSession(slug);
    return { changes: await repo.listPendingChanges(session.workspace.id) };
  });
}

/** Used by the Cmd+K inline edit to register its result as a reviewable diff. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  return handle(async () => {
    const session = await requireSession(slug);
    requireRole(session, "editor");

    const body = (await req.json().catch(() => ({}))) as {
      documentId?: string;
      after?: string;
      summary?: string;
    };

    const doc = body.documentId
      ? await repo.getDocument(session.workspace.id, body.documentId)
      : null;
    if (!doc) {
      return { error: "Document not found" };
    }

    const change = await repo.createChange({
      workspaceId: session.workspace.id,
      documentId: doc.id,
      threadId: null,
      before: doc.content,
      after: body.after ?? doc.content,
      summary: body.summary ?? "Inline edit",
      createdBy: "inline",
    });

    return { change };
  });
}
