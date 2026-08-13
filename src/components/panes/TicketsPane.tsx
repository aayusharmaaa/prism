"use client";

import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/store/workspace";
import { PROVIDERS } from "@/lib/integrations";
import { cn } from "@/lib/format";
import type { DraftTicket, IntegrationProvider, TicketBatch } from "@/lib/types";
import {
  Check,
  CircleDot,
  ExternalLink,
  Layers,
  Loader2,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";

const TYPE_STYLE: Record<DraftTicket["type"], string> = {
  epic: "bg-accent/20 text-accent border-accent/35",
  story: "bg-info/15 text-info border-info/30",
  bug: "bg-danger/15 text-danger border-danger/30",
  task: "bg-hover text-fg-muted border-line",
};

/** Reviewable ticket batch: edit before it reaches the tracker. */
export function TicketsPane({ batchId }: { batchId: string }) {
  const { ticketBatches, updateTicketBatch, slug, integrations, toast, role } =
    useWorkspace();

  const [batch, setBatch] = useState<TicketBatch | null>(
    () => ticketBatches.find((b) => b.id === batchId) ?? null,
  );
  const [pushing, setPushing] = useState(false);
  const [pushedUrl, setPushedUrl] = useState<string | null>(null);

  // Batches created in a previous session aren't in memory; fetch on demand.
  useEffect(() => {
    if (batch) return;
    void (async () => {
      const res = await fetch(`/api/w/${slug}/tickets/${batchId}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as { batch: TicketBatch };
        setBatch(data.batch);
      }
    })();
  }, [batch, batchId, slug]);

  const targets = useMemo(
    () =>
      PROVIDERS.filter((p) => p.canReceiveTickets).map((p) => ({
        ...p,
        integration: integrations.find((i) => i.provider === p.id),
      })),
    [integrations],
  );

  const [provider, setProvider] = useState<IntegrationProvider>("linear");

  if (!batch) {
    return (
      <div className="grid flex-1 place-items-center text-[13px] text-fg-dim">
        <Loader2 size={15} className="animate-spin" />
      </div>
    );
  }

  const readOnly = batch.status === "pushed" || role === "viewer";

  const mutate = (tickets: DraftTicket[]) => {
    const next = { ...batch, tickets };
    setBatch(next);
    updateTicketBatch(next);
  };

  const patch = (id: string, field: Partial<DraftTicket>) =>
    mutate(batch.tickets.map((t) => (t.id === id ? { ...t, ...field } : t)));

  const push = async () => {
    const target = targets.find((t) => t.id === provider);
    if (target?.integration?.status !== "connected") {
      toast(
        "error",
        `${target?.name ?? provider} is ${target?.integration?.status ?? "not connected"} — fix the connection first`,
      );
      return;
    }
    setPushing(true);
    try {
      const res = await fetch(`/api/w/${slug}/tickets/${batchId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, tickets: batch.tickets }),
      });
      const data = (await res.json()) as {
        batch?: TicketBatch;
        url?: string;
        error?: string;
      };
      if (!res.ok || !data.batch) {
        toast("error", data.error ?? "Push failed");
        return;
      }
      setBatch(data.batch);
      updateTicketBatch(data.batch);
      setPushedUrl(data.url ?? null);
      toast("ok", `Pushed ${data.batch.tickets.length} issues to ${provider}`);
    } finally {
      setPushing(false);
    }
  };

  const epics = batch.tickets.filter((t) => t.type === "epic");
  const orphans = batch.tickets.filter((t) => t.type !== "epic" && !t.parentId);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <Layers size={15} className="shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <h1 className="text-[14px] font-semibold">
            Ticket draft · {batch.tickets.length} issues
          </h1>
          <p className="text-[10.5px] text-fg-dim">
            {batch.status === "pushed"
              ? `Pushed to ${batch.provider}`
              : "Edit before pushing — nothing leaves Prism until you do"}
          </p>
        </div>

        {batch.status !== "pushed" && !readOnly && (
          <>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as IntegrationProvider)}
              className="rounded border border-line bg-elevated px-2 py-1 text-[11.5px] outline-none focus:border-accent"
            >
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.integration?.status !== "connected"
                    ? ` (${t.integration?.status ?? "not connected"})`
                    : ""}
                </option>
              ))}
            </select>
            <button
              onClick={() => void push()}
              disabled={pushing}
              className="flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-[11.5px] font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {pushing ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <ExternalLink size={12} />
              )}
              Push to {targets.find((t) => t.id === provider)?.name}
            </button>
          </>
        )}

        {batch.status === "pushed" && (
          <span className="flex items-center gap-1 rounded border border-ok/35 bg-ok/10 px-2 py-1 text-[11.5px] text-ok">
            <Check size={12} /> Pushed
          </span>
        )}
      </div>

      {pushedUrl && (
        <div className="shrink-0 border-b border-line bg-ok/5 px-4 py-1.5 text-[11.5px] text-ok">
          Created in {batch.provider}.{" "}
          <span className="font-mono text-fg-muted">{pushedUrl}</span>
        </div>
      )}

      {targets.some(
        (t) => t.id === provider && t.integration?.status !== "connected",
      ) &&
        batch.status !== "pushed" && (
          <div className="flex shrink-0 items-start gap-2 border-b border-warn/25 bg-warn/5 px-4 py-2">
            <TriangleAlert size={13} className="mt-px shrink-0 text-warn" />
            <p className="text-[11.5px] leading-relaxed text-warn">
              {targets.find((t) => t.id === provider)?.name} is not healthy.
              Pushing is blocked deliberately — a silent partial write is worse
              than a visible refusal.
            </p>
          </div>
        )}

      {/* Tickets */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-3xl space-y-3">
          {epics.map((epic) => (
            <div key={epic.id}>
              <TicketCard
                ticket={epic}
                readOnly={readOnly}
                onChange={(f) => patch(epic.id, f)}
                onDelete={() =>
                  mutate(
                    batch.tickets.filter(
                      (t) => t.id !== epic.id && t.parentId !== epic.id,
                    ),
                  )
                }
              />
              <div className="mt-2 space-y-2 border-l-2 border-line pl-4">
                {batch.tickets
                  .filter((t) => t.parentId === epic.id)
                  .map((child) => (
                    <TicketCard
                      key={child.id}
                      ticket={child}
                      readOnly={readOnly}
                      onChange={(f) => patch(child.id, f)}
                      onDelete={() =>
                        mutate(batch.tickets.filter((t) => t.id !== child.id))
                      }
                    />
                  ))}
              </div>
            </div>
          ))}

          {orphans.map((t) => (
            <TicketCard
              key={t.id}
              ticket={t}
              readOnly={readOnly}
              onChange={(f) => patch(t.id, f)}
              onDelete={() => mutate(batch.tickets.filter((x) => x.id !== t.id))}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function TicketCard({
  ticket,
  readOnly,
  onChange,
  onDelete,
}: {
  ticket: DraftTicket;
  readOnly: boolean;
  onChange: (patch: Partial<DraftTicket>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="group rounded-lg border border-line bg-elevated p-3">
      <div className="mb-1.5 flex items-center gap-2">
        <span
          className={cn(
            "shrink-0 rounded border px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide",
            TYPE_STYLE[ticket.type],
          )}
        >
          {ticket.type}
        </span>
        {ticket.externalKey && (
          <span className="shrink-0 rounded bg-hover px-1.5 py-px font-mono text-[10px] text-fg-muted">
            {ticket.externalKey}
          </span>
        )}
        {ticket.estimate && (
          <span className="shrink-0 rounded border border-line px-1.5 py-px text-[9.5px] font-medium text-fg-dim">
            {ticket.estimate}
          </span>
        )}
        {ticket.labels.map((l) => (
          <span key={l} className="shrink-0 text-[10px] text-fg-dim">
            #{l}
          </span>
        ))}
        {!readOnly && (
          <button
            onClick={onDelete}
            title="Remove ticket"
            className="ml-auto hidden shrink-0 rounded p-0.5 text-fg-dim transition-colors hover:text-danger group-hover:block"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      <input
        value={ticket.title}
        readOnly={readOnly}
        onChange={(e) => onChange({ title: e.target.value })}
        className="mb-1 w-full bg-transparent text-[13px] font-medium outline-none focus:text-fg"
      />

      <textarea
        value={ticket.description}
        readOnly={readOnly}
        onChange={(e) => onChange({ description: e.target.value })}
        rows={Math.min(4, Math.max(2, Math.ceil(ticket.description.length / 90)))}
        className="mb-2 w-full resize-none bg-transparent text-[11.5px] leading-relaxed text-fg-muted outline-none"
      />

      {ticket.acceptanceCriteria.length > 0 && (
        <div>
          <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-wide text-fg-dim">
            Acceptance criteria
          </div>
          <ul className="space-y-1">
            {ticket.acceptanceCriteria.map((ac, i) => (
              <li key={i} className="flex gap-1.5">
                <CircleDot size={10} className="mt-1 shrink-0 text-fg-dim" />
                <textarea
                  value={ac}
                  readOnly={readOnly}
                  onChange={(e) => {
                    const next = [...ticket.acceptanceCriteria];
                    next[i] = e.target.value;
                    onChange({ acceptanceCriteria: next });
                  }}
                  rows={Math.max(1, Math.ceil(ac.length / 80))}
                  className="w-full resize-none bg-transparent text-[11.5px] leading-relaxed text-fg-muted outline-none focus:text-fg"
                />
                {!readOnly && (
                  <button
                    onClick={() =>
                      onChange({
                        acceptanceCriteria: ticket.acceptanceCriteria.filter(
                          (_, j) => j !== i,
                        ),
                      })
                    }
                    className="shrink-0 self-start pt-0.5 text-fg-dim opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                  >
                    <Trash2 size={10} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!readOnly && (
        <button
          onClick={() =>
            onChange({
              acceptanceCriteria: [
                ...ticket.acceptanceCriteria,
                "Given …, when …, then …",
              ],
            })
          }
          className="mt-1.5 flex items-center gap-1 text-[10.5px] text-fg-dim transition-colors hover:text-accent"
        >
          <Plus size={10} /> Add criterion
        </button>
      )}
    </div>
  );
}
