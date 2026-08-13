import { cookies } from "next/headers";
import { db, str, type Row } from "@/lib/db/client";
import * as repo from "@/lib/db/repo";
import type { Member, Role, Workspace } from "@/lib/types";

/**
 * Session resolution.
 *
 * This build ships without an auth provider — the seam is here, deliberately
 * isolated, so wiring WorkOS/Auth0/NextAuth means replacing `currentSession`
 * and nothing else. Every route already calls `requireSession` and every
 * repository read is workspace-scoped, so authorisation is enforced at the
 * boundary rather than sprinkled through handlers.
 */

export interface Session {
  user: Member;
  workspace: Workspace;
  role: Role;
}

const ROLE_RANK: Record<Role, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
  owner: 3,
};

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The signed-in user, falling back to the workspace owner in demo mode. */
async function resolveUserId(workspaceId: string): Promise<string> {
  const jar = await cookies();
  const impersonated = jar.get("prism_user")?.value;
  if (impersonated) {
    const c = await db();
    const r = await c.execute({
      sql: "SELECT user_id FROM memberships WHERE workspace_id = ? AND user_id = ?",
      args: [workspaceId, impersonated],
    });
    if (r.rows[0]) return str((r.rows[0] as Row).user_id);
  }
  const c = await db();
  const r = await c.execute({
    sql: `SELECT user_id FROM memberships WHERE workspace_id = ?
          ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END
          LIMIT 1`,
    args: [workspaceId],
  });
  if (!r.rows[0]) throw new HttpError(403, "No membership in this workspace");
  return str((r.rows[0] as Row).user_id);
}

export async function getSession(slug: string): Promise<Session | null> {
  const workspace = await repo.getWorkspaceBySlug(slug);
  if (!workspace) return null;

  const userId = await resolveUserId(workspace.id);
  const members = await repo.listMembers(workspace.id);
  const user = members.find((m) => m.id === userId);
  if (!user) return null;

  return { user, workspace, role: user.role };
}

export async function requireSession(slug: string): Promise<Session> {
  const session = await getSession(slug);
  if (!session) throw new HttpError(404, `No workspace '${slug}'`);
  return session;
}

/** Throws unless the session's role meets `minimum`. */
export function requireRole(session: Session, minimum: Role): void {
  if (ROLE_RANK[session.role] < ROLE_RANK[minimum]) {
    throw new HttpError(
      403,
      `This action requires the ${minimum} role or higher. You are a ${session.role}.`,
    );
  }
}

/** Wraps a handler so HttpError becomes a proper response instead of a 500. */
export function handle<T>(
  fn: () => Promise<T>,
): Promise<Response> {
  return fn()
    .then((data) => Response.json(data as object))
    .catch((err: unknown) => {
      if (err instanceof HttpError) {
        return Response.json({ error: err.message }, { status: err.status });
      }
      const message = err instanceof Error ? err.message : "Unexpected error";
      console.error("[prism]", err);
      return Response.json({ error: message }, { status: 500 });
    });
}
