import * as repo from "@/lib/db/repo";
import { HttpError, handle, requireRole, requireSession } from "@/lib/session";
import type { DocStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUSES: DocStatus[] = ["draft", "in_review", "approved", "shipped"];

type Ctx = { params: Promise<{ slug: string; id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { slug, id } = await params;
  return handle(async () => {
    const session = await requireSession(slug);
    const doc = await repo.getDocument(session.workspace.id, id);
    if (!doc) throw new HttpError(404, "Document not found");
    return { document: doc };
  });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { slug, id } = await params;
  return handle(async () => {
    const session = await requireSession(slug);
    requireRole(session, "editor");

    const body = (await req.json().catch(() => ({}))) as {
      title?: string;
      content?: string;
      status?: string;
    };

    const patch: {
      title?: string;
      content?: string;
      status?: DocStatus;
      updatedBy?: string;
    } = { updatedBy: session.user.id };
    if (typeof body.title === "string") patch.title = body.title;
    if (typeof body.content === "string") patch.content = body.content;
    if (STATUSES.includes(body.status as DocStatus)) {
      patch.status = body.status as DocStatus;
    }

    const doc = await repo.updateDocument(session.workspace.id, id, patch);
    if (!doc) throw new HttpError(404, "Document not found");

    // Status transitions are governance events; content autosave is not.
    if (patch.status) {
      await repo.audit({
        workspaceId: session.workspace.id,
        actorId: session.user.id,
        actorName: session.user.name,
        action: "document.status_changed",
        target: doc.title,
        meta: { documentId: doc.id, status: patch.status },
      });
    }

    return { document: doc };
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { slug, id } = await params;
  return handle(async () => {
    const session = await requireSession(slug);
    requireRole(session, "admin");

    const doc = await repo.getDocument(session.workspace.id, id);
    if (!doc) throw new HttpError(404, "Document not found");
    if (doc.kind === "memory") {
      throw new HttpError(400, "Product Memory cannot be deleted");
    }

    await repo.deleteDocument(session.workspace.id, id);
    await repo.audit({
      workspaceId: session.workspace.id,
      actorId: session.user.id,
      actorName: session.user.name,
      action: "document.deleted",
      target: doc.title,
      meta: { documentId: id },
    });
    return { ok: true };
  });
}
