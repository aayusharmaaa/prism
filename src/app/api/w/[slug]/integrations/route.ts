import * as repo from "@/lib/db/repo";
import { HttpError, handle, requireRole, requireSession } from "@/lib/session";
import { PROVIDERS, checkHealth, providerMeta } from "@/lib/integrations";
import type { IntegrationProvider } from "@/lib/types";

export const dynamic = "force-dynamic";

const isProvider = (v: unknown): v is IntegrationProvider =>
  PROVIDERS.some((p) => p.id === v);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  return handle(async () => {
    const session = await requireSession(slug);
    return {
      integrations: await repo.listIntegrations(session.workspace.id),
      providers: PROVIDERS,
    };
  });
}

/** Actions: `connect`, `disconnect`, `check`. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  return handle(async () => {
    const session = await requireSession(slug);
    requireRole(session, "admin");

    const body = (await req.json().catch(() => ({}))) as {
      provider?: string;
      action?: string;
      config?: Record<string, unknown>;
    };
    if (!isProvider(body.provider)) {
      throw new HttpError(400, "Unknown provider");
    }
    const provider = body.provider;
    const meta = providerMeta(provider);

    const existing = (await repo.listIntegrations(session.workspace.id)).find(
      (i) => i.provider === provider,
    );

    if (body.action === "disconnect") {
      const updated = await repo.upsertIntegration({
        workspaceId: session.workspace.id,
        provider,
        status: "disconnected",
        accountLabel: null,
        config: {},
        lastError: null,
      });
      await repo.audit({
        workspaceId: session.workspace.id,
        actorId: session.user.id,
        actorName: session.user.name,
        action: "integration.disconnected",
        target: meta.name,
      });
      return { integration: updated };
    }

    if (body.action === "check") {
      const health = await checkHealth(provider, {
        status: existing?.status ?? "disconnected",
        accountLabel: existing?.accountLabel ?? null,
        error: existing?.lastError ?? null,
      });
      const updated = await repo.upsertIntegration({
        workspaceId: session.workspace.id,
        provider,
        status: health.status,
        accountLabel: health.accountLabel,
        config: existing?.config ?? {},
        lastError: health.error,
      });
      return { integration: updated };
    }

    // connect
    const updated = await repo.upsertIntegration({
      workspaceId: session.workspace.id,
      provider,
      status: "connected",
      accountLabel:
        typeof body.config?.accountLabel === "string"
          ? body.config.accountLabel
          : `${meta.name} workspace`,
      config: body.config ?? {},
      lastError: null,
    });
    await repo.audit({
      workspaceId: session.workspace.id,
      actorId: session.user.id,
      actorName: session.user.name,
      action: "integration.connected",
      target: meta.name,
    });
    return { integration: updated };
  });
}
