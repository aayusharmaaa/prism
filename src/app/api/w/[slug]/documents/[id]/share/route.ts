import * as repo from "@/lib/db/repo";
import { HttpError, handle, requireRole, requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string; id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { slug, id } = await params;
  return handle(async () => {
    const session = await requireSession(slug);
    return { shares: await repo.listShares(session.workspace.id, id) };
  });
}

/** Mint a read-only public link. */
export async function POST(req: Request, { params }: Ctx) {
  const { slug, id } = await params;
  return handle(async () => {
    const session = await requireSession(slug);
    // Publishing outside the workspace is a real disclosure, so it needs more
    // than read access.
    requireRole(session, "editor");

    const doc = await repo.getDocument(session.workspace.id, id);
    if (!doc) throw new HttpError(404, "Document not found");

    const body = (await req.json().catch(() => ({}))) as {
      expiresInDays?: number;
    };

    const share = await repo.createShare({
      workspaceId: session.workspace.id,
      documentId: id,
      createdBy: session.user.id,
      expiresInDays: body.expiresInDays ?? null,
    });

    await repo.audit({
      workspaceId: session.workspace.id,
      actorId: session.user.id,
      actorName: session.user.name,
      action: "document.shared",
      target: doc.title,
      meta: { shareId: share.id, expiresAt: share.expiresAt },
    });

    return { share };
  });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { slug, id } = await params;
  return handle(async () => {
    const session = await requireSession(slug);
    requireRole(session, "editor");

    const shareId = new URL(req.url).searchParams.get("shareId");
    if (!shareId) throw new HttpError(400, "shareId is required");

    await repo.revokeShare(session.workspace.id, shareId);
    await repo.audit({
      workspaceId: session.workspace.id,
      actorId: session.user.id,
      actorName: session.user.name,
      action: "document.unshared",
      target: id,
      meta: { shareId },
    });

    return { shares: await repo.listShares(session.workspace.id, id) };
  });
}
