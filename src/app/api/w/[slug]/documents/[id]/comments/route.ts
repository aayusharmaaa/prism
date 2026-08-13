import * as repo from "@/lib/db/repo";
import { HttpError, handle, requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string; id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { slug, id } = await params;
  return handle(async () => {
    const session = await requireSession(slug);
    return { comments: await repo.listComments(session.workspace.id, id) };
  });
}

/**
 * Post a comment or a reply.
 *
 * Deliberately available to **viewers**: the whole point of the role is
 * stakeholder review, and review that can't leave feedback is just reading.
 * Viewers still cannot change the document itself.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { slug, id } = await params;
  return handle(async () => {
    const session = await requireSession(slug);

    const doc = await repo.getDocument(session.workspace.id, id);
    if (!doc) throw new HttpError(404, "Document not found");

    const body = (await req.json().catch(() => ({}))) as {
      body?: string;
      parentId?: string;
      anchorText?: string;
    };

    const text = (body.body ?? "").trim();
    if (!text) throw new HttpError(400, "Comment body is required");
    if (text.length > 4000) throw new HttpError(400, "Comment is too long");

    const comment = await repo.createComment({
      workspaceId: session.workspace.id,
      documentId: id,
      parentId: body.parentId ?? null,
      authorId: session.user.id,
      body: text,
      anchorText: (body.anchorText ?? "").slice(0, 300),
    });

    await repo.audit({
      workspaceId: session.workspace.id,
      actorId: session.user.id,
      actorName: session.user.name,
      action: body.parentId ? "comment.replied" : "comment.added",
      target: doc.title,
      meta: { documentId: id, commentId: comment.id },
    });

    return { comment };
  });
}

/** Resolve/unresolve or delete. */
export async function PATCH(req: Request, { params }: Ctx) {
  const { slug, id } = await params;
  return handle(async () => {
    const session = await requireSession(slug);

    const body = (await req.json().catch(() => ({}))) as {
      commentId?: string;
      resolved?: boolean;
      action?: "delete";
    };
    if (!body.commentId) throw new HttpError(400, "commentId is required");

    const existing = (await repo.listComments(session.workspace.id, id)).find(
      (c) => c.id === body.commentId,
    );
    if (!existing) throw new HttpError(404, "Comment not found");

    if (body.action === "delete") {
      // Authors can remove their own; admins can remove anyone's.
      const privileged = session.role === "owner" || session.role === "admin";
      if (existing.authorId !== session.user.id && !privileged) {
        throw new HttpError(403, "You can only delete your own comments");
      }
      await repo.deleteComment(session.workspace.id, body.commentId);
    } else {
      await repo.setCommentResolved(
        session.workspace.id,
        body.commentId,
        body.resolved !== false,
      );
    }

    return { comments: await repo.listComments(session.workspace.id, id) };
  });
}
