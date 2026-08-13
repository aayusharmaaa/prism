import * as repo from "@/lib/db/repo";
import { handle, requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Workspace activity, readable by any member.
 *
 * The `/admin` route also exposes the audit log, but requires the admin role
 * because it's bundled with billing, keys, and member management. Team
 * visibility is a different concern from governance, so it gets its own
 * endpoint rather than loosening that one.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  return handle(async () => {
    const session = await requireSession(slug);
    const [entries, openComments] = await Promise.all([
      repo.listAudit(session.workspace.id, 100),
      repo.listAllComments(session.workspace.id),
    ]);
    return { entries, openComments };
  });
}
