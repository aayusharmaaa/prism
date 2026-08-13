import * as repo from "@/lib/db/repo";
import { handle, requireSession } from "@/lib/session";
import { DEFAULT_MODEL, MODELS, hasApiKey } from "@/lib/agent/runner";

export const dynamic = "force-dynamic";

/** Everything the IDE shell needs to render, in one round trip. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  return handle(async () => {
    const session = await requireSession(slug);
    const ws = session.workspace.id;

    const [documents, sources, folders, threads, integrations, changes, members] =
      await Promise.all([
        repo.listDocuments(ws),
        repo.listSources(ws),
        repo.listFolders(ws),
        repo.listThreads(ws),
        repo.listIntegrations(ws),
        repo.listPendingChanges(ws),
        repo.listMembers(ws),
      ]);

    return {
      workspace: session.workspace,
      user: session.user,
      role: session.role,
      members,
      folders,
      documents,
      sources,
      threads,
      integrations,
      pendingChanges: changes,
      config: {
        models: MODELS,
        defaultModel: DEFAULT_MODEL,
        liveModel: hasApiKey(),
      },
    };
  });
}
