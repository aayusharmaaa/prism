import * as repo from "@/lib/db/repo";
import { handle, requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string; id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { slug, id } = await params;
  return handle(async () => {
    const session = await requireSession(slug);
    const threads = await repo.listThreads(session.workspace.id);
    const thread = threads.find((t) => t.id === id);
    if (!thread) return { thread: null, messages: [] };
    return { thread, messages: await repo.listMessages(id) };
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { slug, id } = await params;
  return handle(async () => {
    const session = await requireSession(slug);
    await repo.deleteThread(session.workspace.id, id);
    return { ok: true };
  });
}
