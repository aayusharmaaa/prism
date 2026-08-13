import * as repo from "@/lib/db/repo";
import { HttpError, handle, requireRole, requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string; id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { slug, id } = await params;
  return handle(async () => {
    const session = await requireSession(slug);
    const doc = await repo.getDocument(session.workspace.id, id);
    if (!doc) throw new HttpError(404, "Document not found");

    const versions = await repo.listVersions(session.workspace.id, id);
    return {
      // The live document is the implicit newest entry in the timeline.
      current: { content: doc.content, updatedAt: doc.updatedAt, updatedBy: doc.updatedBy },
      versions,
    };
  });
}

/**
 * Restore a previous version.
 *
 * Restoring is additive: the current content is snapshotted first, so the
 * restore itself can be undone. Nothing is ever destroyed.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { slug, id } = await params;
  return handle(async () => {
    const session = await requireSession(slug);
    requireRole(session, "editor");

    const body = (await req.json().catch(() => ({}))) as { versionId?: string };
    if (!body.versionId) throw new HttpError(400, "versionId is required");

    const version = await repo.getVersion(session.workspace.id, body.versionId);
    if (!version || version.documentId !== id) {
      throw new HttpError(404, "Version not found for this document");
    }

    const doc = await repo.getDocument(session.workspace.id, id);
    if (!doc) throw new HttpError(404, "Document not found");

    if (doc.content === version.content) {
      throw new HttpError(409, "That version is identical to the current content");
    }

    await repo.snapshotDocument({
      workspaceId: session.workspace.id,
      documentId: id,
      content: doc.content,
      origin: "restore",
      label: `Before restoring ${new Date(version.createdAt).toISOString().slice(0, 16).replace("T", " ")}`,
      createdBy: session.user.id,
    });

    const updated = await repo.updateDocument(session.workspace.id, id, {
      content: version.content,
      updatedBy: session.user.id,
      skipSnapshot: true,
    });

    await repo.audit({
      workspaceId: session.workspace.id,
      actorId: session.user.id,
      actorName: session.user.name,
      action: "document.restored",
      target: doc.title,
      meta: { versionId: version.id, versionAt: version.createdAt },
    });

    return { document: updated };
  });
}
