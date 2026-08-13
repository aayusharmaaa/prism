import { db } from "@/lib/db/client";
import { seedIfEmpty } from "@/lib/db/seed";
import { hasFts } from "@/lib/db/client";
import { handle, requireRole, requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Wipe and re-seed the demo workspace.
 *
 * Exists so a pitch can be run twice in a row without restarting the server.
 * Owner-only, and it drops *everything* — uploads, comments, history, shares —
 * not just the rows the seed happens to overwrite, because a half-reset
 * workspace is worse than no reset at all.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  return handle(async () => {
    const session = await requireSession(slug);
    requireRole(session, "owner");

    const c = await db();

    // Ordered so children go before parents; `workspaces` last cascades the
    // rest, but being explicit keeps this correct if cascades are ever off.
    const tables = [
      "messages",
      "threads",
      "proposed_changes",
      "document_versions",
      "comments",
      "shares",
      "ticket_batches",
      "audit_log",
      "usage_records",
      "api_keys",
      "integrations",
      "documents",
      "folders",
      "sources",
      "memberships",
      "workspaces",
      "users",
    ];
    for (const t of tables) {
      await c.execute(`DELETE FROM ${t}`);
    }
    if (hasFts()) await c.execute("DELETE FROM search_index");

    await seedIfEmpty(c, hasFts());

    return { ok: true, reseeded: true };
  });
}
