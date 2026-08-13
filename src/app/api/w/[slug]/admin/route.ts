import * as repo from "@/lib/db/repo";
import { HttpError, handle, requireRole, requireSession } from "@/lib/session";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

const ROLES: Role[] = ["owner", "admin", "editor", "viewer"];

/** Members, audit log, usage, and API keys for the settings surface. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  return handle(async () => {
    const session = await requireSession(slug);
    requireRole(session, "admin");
    const ws = session.workspace.id;

    const [members, auditEntries, usage, apiKeys, batches] = await Promise.all([
      repo.listMembers(ws),
      repo.listAudit(ws, 80),
      repo.listUsage(ws, 14),
      repo.listApiKeys(ws),
      repo.listTicketBatches(ws),
    ]);

    return {
      workspace: session.workspace,
      members,
      auditEntries,
      usage,
      apiKeys,
      batches,
    };
  });
}

/** Actions: `set_role`, `update_workspace`, `create_key`, `revoke_key`. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  return handle(async () => {
    const session = await requireSession(slug);
    requireRole(session, "admin");

    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      userId?: string;
      role?: string;
      name?: string;
      plan?: string;
      seats?: number;
      keyId?: string;
    };

    switch (body.action) {
      case "set_role": {
        requireRole(session, "owner");
        if (!body.userId || !ROLES.includes(body.role as Role)) {
          throw new HttpError(400, "userId and a valid role are required");
        }
        if (body.userId === session.user.id) {
          throw new HttpError(400, "You cannot change your own role");
        }
        await repo.setMemberRole(
          session.workspace.id,
          body.userId,
          body.role as Role,
        );
        await repo.audit({
          workspaceId: session.workspace.id,
          actorId: session.user.id,
          actorName: session.user.name,
          action: "member.role_changed",
          target: body.userId,
          meta: { role: body.role },
        });
        return { members: await repo.listMembers(session.workspace.id) };
      }

      case "update_workspace": {
        requireRole(session, "owner");
        await repo.updateWorkspace(session.workspace.id, {
          name: body.name,
          plan: body.plan,
          seats: body.seats,
        });
        await repo.audit({
          workspaceId: session.workspace.id,
          actorId: session.user.id,
          actorName: session.user.name,
          action: "workspace.updated",
          target: body.name ?? session.workspace.name,
        });
        return { ok: true };
      }

      case "create_key": {
        const { key, secret } = await repo.createApiKey({
          workspaceId: session.workspace.id,
          name: (body.name ?? "Untitled key").trim(),
          createdBy: session.user.id,
        });
        await repo.audit({
          workspaceId: session.workspace.id,
          actorId: session.user.id,
          actorName: session.user.name,
          action: "apikey.created",
          target: key.name,
        });
        // The secret is returned exactly once and never stored in plaintext.
        return { key, secret };
      }

      case "revoke_key": {
        if (!body.keyId) throw new HttpError(400, "keyId is required");
        await repo.revokeApiKey(session.workspace.id, body.keyId);
        await repo.audit({
          workspaceId: session.workspace.id,
          actorId: session.user.id,
          actorName: session.user.name,
          action: "apikey.revoked",
          target: body.keyId,
        });
        return { keys: await repo.listApiKeys(session.workspace.id) };
      }

      default:
        throw new HttpError(400, `Unknown action '${body.action}'`);
    }
  });
}
