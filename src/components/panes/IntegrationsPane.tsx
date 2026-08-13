"use client";

import { useState } from "react";
import { useWorkspace } from "@/store/workspace";
import { PROVIDERS } from "@/lib/integrations";
import { cn, relativeTime } from "@/lib/format";
import type { Integration, IntegrationStatus } from "@/lib/types";
import { Loader2, Plug, RefreshCw, TriangleAlert } from "lucide-react";

const DOT: Record<IntegrationStatus, string> = {
  connected: "bg-ok",
  degraded: "bg-warn",
  error: "bg-danger",
  disconnected: "bg-fg-dim",
};

const LABEL: Record<IntegrationStatus, string> = {
  connected: "Connected",
  degraded: "Needs attention",
  error: "Failing",
  disconnected: "Not connected",
};

const SETUP_LABEL = { low: "Low", medium: "Medium", high: "High" } as const;

export function IntegrationsPane() {
  const { integrations, slug, setIntegration, toast, role } = useWorkspace();
  const [busy, setBusy] = useState<string | null>(null);

  const canManage = role === "owner" || role === "admin";
  const byProvider = new Map(integrations.map((i) => [i.provider, i]));

  const act = async (provider: string, action: "connect" | "disconnect" | "check") => {
    if (!canManage) {
      toast("error", "Only owners and admins can manage integrations");
      return;
    }
    setBusy(provider);
    try {
      const res = await fetch(`/api/w/${slug}/integrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, action }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast("error", err.error ?? "Action failed");
        return;
      }
      const { integration } = (await res.json()) as { integration: Integration };
      setIntegration(integration);
      toast(
        integration.status === "connected" ? "ok" : "info",
        `${provider}: ${LABEL[integration.status]}`,
      );
    } finally {
      setBusy(null);
    }
  };

  const unhealthy = integrations.filter(
    (i) => i.status === "degraded" || i.status === "error",
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-6">
        <header className="mb-5">
          <h1 className="flex items-center gap-2 text-[17px] font-semibold">
            <Plug size={16} className="text-accent" /> Integrations
          </h1>
          <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-fg-muted">
            Connections are health-checked and their status is stored, not
            assumed. A degraded connection blocks pushes with an error instead
            of letting the agent report a success that never happened.
          </p>
        </header>

        {unhealthy.length > 0 && (
          <div className="mb-4 flex gap-2.5 rounded-lg border border-warn/30 bg-warn/5 p-3">
            <TriangleAlert size={15} className="mt-px shrink-0 text-warn" />
            <div>
              <p className="text-[12.5px] font-medium text-warn">
                {unhealthy.length} connection
                {unhealthy.length === 1 ? "" : "s"} need attention
              </p>
              <ul className="mt-1 space-y-0.5">
                {unhealthy.map((i) => (
                  <li key={i.provider} className="text-[11.5px] text-fg-muted">
                    <span className="font-medium capitalize">{i.provider}</span>
                    {i.lastError ? ` — ${i.lastError}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="grid gap-2.5 sm:grid-cols-2">
          {PROVIDERS.map((p) => {
            const int = byProvider.get(p.id);
            const status = int?.status ?? "disconnected";
            const working = busy === p.id;

            return (
              <div
                key={p.id}
                className="rounded-lg border border-line bg-elevated p-3.5"
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", DOT[status])} />
                  <h3 className="text-[13px] font-semibold">{p.name}</h3>
                  <span className="ml-auto text-[10px] text-fg-dim">
                    {SETUP_LABEL[p.setup]} setup
                  </span>
                </div>

                <p className="mb-2 text-[11.5px] leading-relaxed text-fg-muted">
                  {p.capability}
                </p>

                <dl className="mb-3 space-y-0.5 text-[10.5px]">
                  <div className="flex gap-1.5">
                    <dt className="text-fg-dim">Status</dt>
                    <dd
                      className={cn(
                        "font-medium",
                        status === "connected" && "text-ok",
                        status === "degraded" && "text-warn",
                        status === "error" && "text-danger",
                        status === "disconnected" && "text-fg-dim",
                      )}
                    >
                      {LABEL[status]}
                    </dd>
                  </div>
                  {int?.accountLabel && (
                    <div className="flex gap-1.5">
                      <dt className="text-fg-dim">Account</dt>
                      <dd className="truncate text-fg-muted">{int.accountLabel}</dd>
                    </div>
                  )}
                  <div className="flex gap-1.5">
                    <dt className="text-fg-dim">Credential</dt>
                    <dd className="text-fg-muted">{p.credentialLabel}</dd>
                  </div>
                  {int?.lastCheckedAt && (
                    <div className="flex gap-1.5">
                      <dt className="text-fg-dim">Checked</dt>
                      <dd className="text-fg-muted">
                        {relativeTime(int.lastCheckedAt)}
                      </dd>
                    </div>
                  )}
                </dl>

                {int?.lastError && (
                  <p className="mb-2.5 rounded border border-warn/25 bg-warn/5 px-2 py-1.5 text-[10.5px] leading-snug text-warn">
                    {int.lastError}
                  </p>
                )}

                <div className="flex gap-1.5">
                  {status === "disconnected" ? (
                    <button
                      onClick={() => void act(p.id, "connect")}
                      disabled={working || !canManage}
                      className="flex-1 rounded bg-accent px-2 py-1.5 text-[11.5px] font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-40"
                    >
                      {working ? "Connecting…" : "Connect"}
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => void act(p.id, "check")}
                        disabled={working || !canManage}
                        className="flex flex-1 items-center justify-center gap-1 rounded border border-line px-2 py-1.5 text-[11.5px] text-fg-muted transition-colors hover:bg-hover hover:text-fg disabled:opacity-40"
                      >
                        {working ? (
                          <Loader2 size={11} className="animate-spin" />
                        ) : (
                          <RefreshCw size={11} />
                        )}
                        Test
                      </button>
                      <button
                        onClick={() => void act(p.id, "disconnect")}
                        disabled={working || !canManage}
                        className="rounded border border-line px-2 py-1.5 text-[11.5px] text-fg-muted transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-40"
                      >
                        Disconnect
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-5 text-[11px] leading-relaxed text-fg-dim">
          Adapters live in{" "}
          <code className="rounded bg-hover px-1 py-px font-mono">
            src/lib/integrations.ts
          </code>
          . Each provider implements <code className="font-mono">check()</code> and{" "}
          <code className="font-mono">pushTickets()</code>; swapping the stubs for
          real API calls changes nothing above that file.
        </p>
      </div>
    </div>
  );
}
