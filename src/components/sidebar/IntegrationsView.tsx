"use client";

import { useState } from "react";
import { useWorkspace } from "@/store/workspace";
import { SidebarHeader, SidebarIconButton } from "@/components/shell/Sidebar";
import { PROVIDERS } from "@/lib/integrations";
import { cn, relativeTime } from "@/lib/format";
import type { Integration, IntegrationStatus } from "@/lib/types";
import { ExternalLink, RefreshCw, TriangleAlert } from "lucide-react";

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

export function IntegrationsView() {
  const { integrations, slug, setIntegration, openPane, toast, role } =
    useWorkspace();
  const [checking, setChecking] = useState<string | null>(null);

  const byProvider = new Map(integrations.map((i) => [i.provider, i]));

  const check = async (provider: string) => {
    if (role === "viewer" || role === "editor") {
      toast("error", "Only admins can manage integrations");
      return;
    }
    setChecking(provider);
    try {
      const res = await fetch(`/api/w/${slug}/integrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, action: "check" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast("error", err.error ?? "Health check failed");
        return;
      }
      const { integration } = (await res.json()) as { integration: Integration };
      setIntegration(integration);
      toast(
        integration.status === "connected" ? "ok" : "info",
        `${provider}: ${LABEL[integration.status]}`,
      );
    } finally {
      setChecking(null);
    }
  };

  const unhealthy = integrations.filter(
    (i) => i.status === "degraded" || i.status === "error",
  );

  return (
    <div className="flex h-full flex-col">
      <SidebarHeader
        title="Integrations"
        actions={
          <SidebarIconButton
            onClick={() => openPane("integrations")}
            title="Open full settings"
          >
            <ExternalLink size={13} />
          </SidebarIconButton>
        }
      />

      {unhealthy.length > 0 && (
        <div className="mx-2 mb-2 flex gap-2 rounded-md border border-warn/30 bg-warn/5 p-2">
          <TriangleAlert size={13} className="mt-px shrink-0 text-warn" />
          <p className="text-[11px] leading-relaxed text-warn">
            {unhealthy.length} connection{unhealthy.length === 1 ? "" : "s"} need
            attention. Pushes are blocked until fixed — better a loud failure
            than a silent one.
          </p>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-4">
        {PROVIDERS.map((p) => {
          const int = byProvider.get(p.id);
          const status = int?.status ?? "disconnected";
          return (
            <div
              key={p.id}
              className="group mb-1 rounded-md px-2 py-1.5 transition-colors hover:bg-hover"
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT[status])}
                />
                <span className="text-[12.5px] font-medium">{p.name}</span>
                <button
                  onClick={() => void check(p.id)}
                  title="Run health check"
                  className="ml-auto hidden shrink-0 rounded p-0.5 text-fg-dim transition-colors hover:text-fg group-hover:block"
                >
                  <RefreshCw
                    size={11}
                    className={cn(checking === p.id && "animate-spin")}
                  />
                </button>
              </div>
              <div className="pl-3.5">
                <div className="text-[10.5px] text-fg-dim">
                  {int?.accountLabel ?? p.capability}
                </div>
                <div
                  className={cn(
                    "text-[10px]",
                    status === "connected" && "text-ok",
                    status === "degraded" && "text-warn",
                    status === "error" && "text-danger",
                    status === "disconnected" && "text-fg-dim",
                  )}
                >
                  {LABEL[status]}
                  {int?.lastCheckedAt && status !== "disconnected"
                    ? ` · checked ${relativeTime(int.lastCheckedAt)}`
                    : ""}
                </div>
                {int?.lastError && (
                  <div className="mt-0.5 text-[10px] leading-snug text-warn">
                    {int.lastError}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
