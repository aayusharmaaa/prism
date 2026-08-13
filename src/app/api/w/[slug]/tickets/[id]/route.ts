import * as repo from "@/lib/db/repo";
import { HttpError, handle, requireRole, requireSession } from "@/lib/session";
import { PROVIDERS, providerMeta, pushTickets } from "@/lib/integrations";
import type { DraftTicket, IntegrationProvider } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string; id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { slug, id } = await params;
  return handle(async () => {
    const session = await requireSession(slug);
    const batch = await repo.getTicketBatch(session.workspace.id, id);
    if (!batch) throw new HttpError(404, "Ticket batch not found");
    return { batch };
  });
}

/** Push a drafted batch to a tracker. */
export async function POST(req: Request, { params }: Ctx) {
  const { slug, id } = await params;
  return handle(async () => {
    const session = await requireSession(slug);
    requireRole(session, "editor");

    const body = (await req.json().catch(() => ({}))) as {
      provider?: string;
      tickets?: DraftTicket[];
    };

    const provider = body.provider as IntegrationProvider;
    const meta = PROVIDERS.find((p) => p.id === provider);
    if (!meta?.canReceiveTickets) {
      throw new HttpError(400, "That provider cannot receive tickets");
    }

    const batch = await repo.getTicketBatch(session.workspace.id, id);
    if (!batch) throw new HttpError(404, "Ticket batch not found");
    if (batch.status === "pushed") {
      throw new HttpError(409, "This batch was already pushed");
    }

    const integration = (await repo.listIntegrations(session.workspace.id)).find(
      (i) => i.provider === provider,
    );
    if (!integration || integration.status === "disconnected") {
      throw new HttpError(
        400,
        `${meta.name} is not connected. Connect it in Integrations first.`,
      );
    }
    // Refusing on a degraded connection is the whole point — a silent failure
    // here is exactly the MCP problem this product exists to avoid.
    if (integration.status !== "connected") {
      throw new HttpError(
        409,
        `${meta.name} is ${integration.status}: ${integration.lastError ?? "connection needs attention"}. ` +
          `Re-authenticate before pushing, or tickets may be silently dropped.`,
      );
    }

    // The client may have edited titles/criteria in the review panel.
    const tickets = Array.isArray(body.tickets) && body.tickets.length
      ? body.tickets
      : batch.tickets;

    const result = await pushTickets(provider, tickets, integration.config);
    await repo.markBatchPushed(
      session.workspace.id,
      id,
      provider,
      result.tickets,
    );
    await repo.audit({
      workspaceId: session.workspace.id,
      actorId: session.user.id,
      actorName: session.user.name,
      action: "tickets.pushed",
      target: `${providerMeta(provider).name} · ${result.tickets.length} issues`,
      meta: { batchId: id, keys: result.tickets.map((t) => t.externalKey) },
    });

    return {
      batch: await repo.getTicketBatch(session.workspace.id, id),
      url: result.url,
    };
  });
}
