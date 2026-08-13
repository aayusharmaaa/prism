import type { DraftTicket, IntegrationProvider, IntegrationStatus } from "@/lib/types";

/**
 * Integration adapters.
 *
 * Prism's answer to "MCP servers disconnect and fail silently": every
 * provider implements `check()`, connection health is stored and surfaced in
 * the UI, and a degraded connection blocks pushes loudly instead of letting
 * the agent hallucinate a success.
 *
 * The adapters below are stubs with the real shape. Swapping in live API calls
 * means implementing `check` and `pushTickets` against the provider SDK —
 * nothing above this file changes.
 */

export interface ProviderMeta {
  id: IntegrationProvider;
  name: string;
  blurb: string;
  /** What the PM gets out of it, shown on the card. */
  capability: string;
  setup: "low" | "medium" | "high";
  /** Whether this provider can receive drafted tickets. */
  canReceiveTickets: boolean;
  credentialLabel: string;
}

export const PROVIDERS: ProviderMeta[] = [
  {
    id: "jira",
    name: "Jira",
    blurb: "Atlassian issue tracking",
    capability: "Read tickets, create epics and stories, sync status",
    setup: "medium",
    canReceiveTickets: true,
    credentialLabel: "API token + site URL",
  },
  {
    id: "linear",
    name: "Linear",
    blurb: "Issue tracking for product teams",
    capability: "Create issues from drafts, pull open bugs by impact",
    setup: "low",
    canReceiveTickets: true,
    credentialLabel: "API key",
  },
  {
    id: "notion",
    name: "Notion",
    blurb: "Team knowledge base",
    capability: "Pull wiki context into prompts, publish finished PRDs",
    setup: "medium",
    canReceiveTickets: false,
    credentialLabel: "Internal integration secret",
  },
  {
    id: "posthog",
    name: "PostHog",
    blurb: "Product analytics",
    capability: "Query funnels and retention as evidence for specs",
    setup: "medium",
    canReceiveTickets: false,
    credentialLabel: "Personal API key + project id",
  },
  {
    id: "figma",
    name: "Figma",
    blurb: "Design files",
    capability: "Pull frame context and design decisions into PRDs",
    setup: "medium",
    canReceiveTickets: false,
    credentialLabel: "Personal access token",
  },
  {
    id: "slack",
    name: "Slack",
    blurb: "Team chat",
    capability: "Post drafts for review, capture decisions back into memory",
    setup: "low",
    canReceiveTickets: false,
    credentialLabel: "Bot token",
  },
];

export const providerMeta = (id: IntegrationProvider): ProviderMeta =>
  PROVIDERS.find((p) => p.id === id) ?? {
    id,
    name: id,
    blurb: "",
    capability: "",
    setup: "medium",
    canReceiveTickets: false,
    credentialLabel: "Credential",
  };

export interface HealthResult {
  status: IntegrationStatus;
  accountLabel: string | null;
  error: string | null;
}

/**
 * Health probe. Real implementations call a cheap authenticated endpoint;
 * this one reports the stored state so seeded degraded/error connections stay
 * visible in the UI rather than being healed by a fake check.
 */
export async function checkHealth(
  provider: IntegrationProvider,
  current: { status: IntegrationStatus; accountLabel: string | null; error: string | null },
): Promise<HealthResult> {
  await new Promise((r) => setTimeout(r, 220 + Math.random() * 380));

  if (current.status === "disconnected") {
    return {
      status: "disconnected",
      accountLabel: null,
      error: null,
    };
  }
  if (current.status === "degraded" || current.status === "error") {
    return {
      status: current.status,
      accountLabel: current.accountLabel,
      error:
        current.error ??
        `${providerMeta(provider).name} responded, but the credential needs attention.`,
    };
  }
  return { status: "connected", accountLabel: current.accountLabel, error: null };
}

export interface PushResult {
  tickets: DraftTicket[];
  url: string;
}

/** Assigns external keys to a batch. Real adapters call the provider's API. */
export async function pushTickets(
  provider: IntegrationProvider,
  tickets: DraftTicket[],
  config: Record<string, unknown>,
): Promise<PushResult> {
  await new Promise((r) => setTimeout(r, 500 + Math.random() * 500));

  const key =
    typeof config.projectKey === "string" ? config.projectKey : provider === "linear" ? "MER" : "PROD";
  let seq = 3000 + Math.floor(Math.random() * 400);

  const withKeys = tickets.map((t) => ({ ...t, externalKey: `${key}-${seq++}` }));
  const base =
    provider === "linear"
      ? `https://linear.app/${key.toLowerCase()}/issue/`
      : `https://${String(config.site ?? "meridian.atlassian.net")}/browse/`;

  return { tickets: withKeys, url: `${base}${withKeys[0]?.externalKey ?? ""}` };
}
