import * as repo from "@/lib/db/repo";
import { HttpError, handle, requireRole, requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string; id: string }> };

/**
 * Accept or reject a proposed change.
 *
 * `content` lets the client submit a partially-accepted result — the user may
 * have taken some hunks and left others, so the accepted text is not
 * necessarily the change's `after`.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { slug, id } = await params;
  return handle(async () => {
    const session = await requireSession(slug);
    requireRole(session, "editor");

    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      content?: string;
    };
    const action = body.action === "reject" ? "rejected" : "accepted";

    const change = await repo.getChange(session.workspace.id, id);
    if (!change) throw new HttpError(404, "Change not found");
    if (change.status !== "pending") {
      throw new HttpError(409, `This change was already ${change.status}.`);
    }

    // Partial accept: the user may have taken some hunks and left others, so
    // what gets written is the client's merged text, not the change's `after`.
    const applied =
      action === "accepted" && typeof body.content === "string"
        ? body.content
        : change.after;

    const resolved = await repo.resolveChangeWithContent(
      session.workspace.id,
      id,
      action,
      applied,
      session.user.id,
    );
    if (!resolved) throw new HttpError(409, "Change is no longer pending");

    await repo.audit({
      workspaceId: session.workspace.id,
      actorId: session.user.id,
      actorName: session.user.name,
      action: action === "accepted" ? "change.accepted" : "change.rejected",
      target: resolved.document?.title ?? change.documentId,
      meta: {
        changeId: id,
        partial: applied !== change.after,
        source: change.createdBy,
      },
    });

    return { change: resolved.change, document: resolved.document };
  });
}
