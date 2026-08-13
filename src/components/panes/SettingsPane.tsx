"use client";

import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/store/workspace";
import { avatarStyle, cn, compactNumber, initials, relativeTime } from "@/lib/format";
import type { ApiKey, AuditEntry, Member, Role, UsageRecord } from "@/lib/types";
import {
  Copy,
  KeyRound,
  Loader2,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
  Zap,
} from "lucide-react";

interface AdminData {
  members: Member[];
  auditEntries: AuditEntry[];
  usage: UsageRecord[];
  apiKeys: ApiKey[];
}

const TABS = [
  { id: "members", label: "Members", icon: Users },
  { id: "usage", label: "Usage", icon: Zap },
  { id: "keys", label: "API keys", icon: KeyRound },
  { id: "audit", label: "Audit log", icon: ScrollText },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function SettingsPane() {
  const { slug, workspace, role, user, members, toast } = useWorkspace();
  const [tab, setTab] = useState<TabId>("members");
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  const isAdmin = role === "owner" || role === "admin";

  const load = useMemo(
    () => async () => {
      if (!isAdmin) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const res = await fetch(`/api/w/${slug}/admin`, { cache: "no-store" });
      if (res.ok) setData((await res.json()) as AdminData);
      setLoading(false);
    },
    [slug, isAdmin],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch(`/api/w/${slug}/admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast("error", json.error ?? "Action failed");
      return null;
    }
    return json;
  };

  if (!isAdmin) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-8">
          <h1 className="mb-2 flex items-center gap-2 text-[17px] font-semibold">
            <Settings size={16} className="text-accent" /> Workspace settings
          </h1>
          <div className="rounded-lg border border-line bg-elevated p-4">
            <div className="mb-1.5 flex items-center gap-2 text-fg-muted">
              <ShieldCheck size={14} />
              <span className="text-[13px] font-medium">Restricted</span>
            </div>
            <p className="text-[12.5px] leading-relaxed text-fg-muted">
              You are signed in as a <strong>{role}</strong>. Members, usage,
              API keys, and the audit log are visible to owners and admins.
            </p>
            <div className="mt-3 border-t border-line pt-3">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-dim">
                Team
              </p>
              <div className="flex flex-wrap gap-2">
                {members.map((m) => (
                  <span
                    key={m.id}
                    className="flex items-center gap-1.5 rounded border border-line px-2 py-1 text-[11.5px]"
                  >
                    <span
                      style={avatarStyle(m.avatarHue)}
                      className="grid h-4 w-4 place-items-center rounded-full text-[7.5px] font-bold text-white"
                    >
                      {initials(m.name)}
                    </span>
                    {m.name}
                    <span className="text-fg-dim">{m.role}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-6">
        <header className="mb-4">
          <h1 className="flex items-center gap-2 text-[17px] font-semibold">
            <Settings size={16} className="text-accent" /> Workspace settings
          </h1>
          <p className="mt-1 text-[12.5px] text-fg-muted">
            {workspace?.name} · {workspace?.plan} plan · {members.length} of{" "}
            {workspace?.seats} seats used
          </p>
        </header>

        <div className="mb-4 flex gap-0.5 border-b border-line">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-[12.5px] transition-colors",
                tab === t.id
                  ? "border-accent text-fg"
                  : "border-transparent text-fg-dim hover:text-fg-muted",
              )}
            >
              <t.icon size={12} />
              {t.label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex items-center gap-2 py-8 text-[12.5px] text-fg-dim">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        )}

        {!loading && data && (
          <>
            {tab === "members" && (
              <MembersTab
                members={data.members}
                seats={workspace?.seats ?? 0}
                currentUserId={user?.id ?? ""}
                canEditRoles={role === "owner"}
                onSetRole={async (userId, newRole) => {
                  const res = await post({ action: "set_role", userId, role: newRole });
                  if (res) {
                    setData({ ...data, members: res.members });
                    toast("ok", "Role updated");
                  }
                }}
              />
            )}

            {tab === "usage" && <UsageTab usage={data.usage} members={data.members} />}

            {tab === "keys" && (
              <KeysTab
                keys={data.apiKeys}
                newSecret={newSecret}
                onDismissSecret={() => setNewSecret(null)}
                onCreate={async (name) => {
                  const res = await post({ action: "create_key", name });
                  if (res) {
                    setNewSecret(res.secret);
                    void load();
                    toast("ok", "API key created");
                  }
                }}
                onRevoke={async (keyId) => {
                  const res = await post({ action: "revoke_key", keyId });
                  if (res) {
                    setData({ ...data, apiKeys: res.keys });
                    toast("info", "Key revoked");
                  }
                }}
              />
            )}

            {tab === "audit" && <AuditTab entries={data.auditEntries} />}
          </>
        )}
      </div>
    </div>
  );
}

/* ----------------------------- Members ---------------------------- */

const ROLES: Role[] = ["owner", "admin", "editor", "viewer"];

const ROLE_HINT: Record<Role, string> = {
  owner: "Full control, including billing and roles",
  admin: "Manage integrations, members, and settings",
  editor: "Create and edit documents, review AI changes",
  viewer: "Read-only. Ask mode only, cannot accept changes",
};

function MembersTab({
  members,
  seats,
  currentUserId,
  canEditRoles,
  onSetRole,
}: {
  members: Member[];
  seats: number;
  currentUserId: string;
  canEditRoles: boolean;
  onSetRole: (userId: string, role: Role) => Promise<void>;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between rounded-lg border border-line bg-elevated px-3.5 py-2.5">
        <div>
          <p className="text-[12.5px] font-medium">
            {members.length} of {seats} seats used
          </p>
          <p className="text-[11px] text-fg-dim">
            Viewers are free and don&apos;t consume a seat on paid plans.
          </p>
        </div>
        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-hover">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${Math.min(100, (members.length / Math.max(seats, 1)) * 100)}%` }}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-line">
        {members.map((m, i) => (
          <div
            key={m.id}
            className={cn(
              "flex items-center gap-3 bg-elevated px-3.5 py-2.5",
              i > 0 && "border-t border-line",
            )}
          >
            <span
              style={avatarStyle(m.avatarHue)}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
            >
              {initials(m.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-medium">
                {m.name}
                {m.id === currentUserId && (
                  <span className="ml-1.5 text-[10px] text-fg-dim">you</span>
                )}
              </p>
              <p className="truncate text-[11px] text-fg-dim">{m.email}</p>
            </div>
            <span className="hidden shrink-0 text-[10.5px] text-fg-dim sm:block">
              {m.lastActiveAt ? `active ${relativeTime(m.lastActiveAt)}` : "never active"}
            </span>
            {canEditRoles && m.id !== currentUserId ? (
              <select
                value={m.role}
                onChange={(e) => void onSetRole(m.id, e.target.value as Role)}
                title={ROLE_HINT[m.role]}
                className="shrink-0 rounded border border-line bg-app px-2 py-1 text-[11.5px] outline-none focus:border-accent"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            ) : (
              <span
                title={ROLE_HINT[m.role]}
                className="shrink-0 rounded border border-line px-2 py-1 text-[11px] text-fg-muted"
              >
                {m.role}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ Usage ----------------------------- */

function UsageTab({ usage, members }: { usage: UsageRecord[]; members: Member[] }) {
  const byDay = useMemo(() => {
    const map = new Map<string, { input: number; output: number; requests: number }>();
    for (const u of usage) {
      const cur = map.get(u.day) ?? { input: 0, output: 0, requests: 0 };
      cur.input += u.inputTokens;
      cur.output += u.outputTokens;
      cur.requests += u.requests;
      map.set(u.day, cur);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-14);
  }, [usage]);

  const byUser = useMemo(() => {
    const map = new Map<string, { input: number; output: number; requests: number }>();
    for (const u of usage) {
      const cur = map.get(u.userId) ?? { input: 0, output: 0, requests: 0 };
      cur.input += u.inputTokens;
      cur.output += u.outputTokens;
      cur.requests += u.requests;
      map.set(u.userId, cur);
    }
    return [...map.entries()].sort((a, b) => b[1].requests - a[1].requests);
  }, [usage]);

  const max = Math.max(...byDay.map(([, v]) => v.input + v.output), 1);
  const totals = byDay.reduce(
    (acc, [, v]) => ({
      input: acc.input + v.input,
      output: acc.output + v.output,
      requests: acc.requests + v.requests,
    }),
    { input: 0, output: 0, requests: 0 },
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2.5">
        <Stat label="Requests" value={totals.requests.toLocaleString()} sub="last 14 days" />
        <Stat label="Input tokens" value={compactNumber(totals.input)} sub="last 14 days" />
        <Stat label="Output tokens" value={compactNumber(totals.output)} sub="last 14 days" />
      </div>

      <div className="rounded-lg border border-line bg-elevated p-3.5">
        <h3 className="mb-3 text-[12px] font-semibold">Daily token consumption</h3>
        <div className="flex h-28 items-end gap-1">
          {byDay.map(([day, v]) => {
            const total = v.input + v.output;
            return (
              <div
                key={day}
                title={`${day}\n${v.requests} requests\n${compactNumber(v.input)} in · ${compactNumber(v.output)} out`}
                className="group flex flex-1 flex-col justify-end gap-px"
              >
                <div
                  className="rounded-t bg-accent/45 transition-colors group-hover:bg-accent/70"
                  style={{ height: `${(v.output / max) * 100}%` }}
                />
                <div
                  className="bg-accent transition-colors group-hover:bg-accent-hover"
                  style={{ height: `${(v.input / max) * 100}%` }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex items-center gap-3 text-[10px] text-fg-dim">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-accent" /> input
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-accent/45" /> output
          </span>
          <span className="ml-auto">
            {byDay[0]?.[0]} → {byDay[byDay.length - 1]?.[0]}
          </span>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-line">
        <div className="border-b border-line bg-hover px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-fg-dim">
          By member
        </div>
        {byUser.map(([userId, v]) => {
          const member = members.find((m) => m.id === userId);
          return (
            <div
              key={userId}
              className="flex items-center gap-3 border-b border-line bg-elevated px-3.5 py-2 last:border-0"
            >
              <span className="min-w-0 flex-1 truncate text-[12px]">
                {member?.name ?? userId}
              </span>
              <span className="shrink-0 text-[11px] text-fg-dim">
                {v.requests} requests
              </span>
              <span className="shrink-0 font-mono text-[11px] text-fg-muted">
                {compactNumber(v.input + v.output)} tok
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const Stat = ({ label, value, sub }: { label: string; value: string; sub: string }) => (
  <div className="rounded-lg border border-line bg-elevated p-3">
    <div className="text-[10.5px] uppercase tracking-wide text-fg-dim">{label}</div>
    <div className="mt-0.5 text-[19px] font-semibold tabular-nums">{value}</div>
    <div className="text-[10.5px] text-fg-dim">{sub}</div>
  </div>
);

/* ---------------------------- API keys ---------------------------- */

function KeysTab({
  keys,
  newSecret,
  onDismissSecret,
  onCreate,
  onRevoke,
}: {
  keys: ApiKey[];
  newSecret: string | null;
  onDismissSecret: () => void;
  onCreate: (name: string) => Promise<void>;
  onRevoke: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-3">
      {newSecret && (
        <div className="rounded-lg border border-ok/35 bg-ok/5 p-3">
          <p className="mb-1.5 text-[12px] font-medium text-ok">
            Copy this key now — it is not stored and cannot be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-app px-2 py-1.5 font-mono text-[11.5px]">
              {newSecret}
            </code>
            <button
              onClick={() => void navigator.clipboard?.writeText(newSecret)}
              className="flex shrink-0 items-center gap-1 rounded border border-line px-2 py-1.5 text-[11.5px] transition-colors hover:bg-hover"
            >
              <Copy size={11} /> Copy
            </button>
            <button
              onClick={onDismissSecret}
              className="shrink-0 rounded px-2 py-1.5 text-[11.5px] text-fg-dim transition-colors hover:text-fg"
            >
              Done
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Key name, e.g. “CI — nightly PRD lint”"
          className="flex-1 rounded border border-line bg-elevated px-2.5 py-1.5 text-[12.5px] outline-none placeholder:text-fg-dim focus:border-accent"
        />
        <button
          onClick={async () => {
            if (!name.trim() || busy) return;
            setBusy(true);
            await onCreate(name.trim());
            setName("");
            setBusy(false);
          }}
          disabled={!name.trim() || busy}
          className="rounded bg-accent px-3 py-1.5 text-[12px] font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-40"
        >
          Create key
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-line">
        {!keys.length && (
          <p className="bg-elevated px-3.5 py-4 text-center text-[12px] text-fg-dim">
            No API keys yet.
          </p>
        )}
        {keys.map((k, i) => (
          <div
            key={k.id}
            className={cn(
              "flex items-center gap-3 bg-elevated px-3.5 py-2.5",
              i > 0 && "border-t border-line",
            )}
          >
            <KeyRound size={13} className="shrink-0 text-fg-dim" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-medium">
                {k.name}
                {k.revokedAt && (
                  <span className="ml-1.5 text-[10px] text-danger">revoked</span>
                )}
              </p>
              <p className="truncate font-mono text-[10.5px] text-fg-dim">
                {k.prefix}••••••••••••
              </p>
            </div>
            <span className="hidden shrink-0 text-[10.5px] text-fg-dim sm:block">
              {k.lastUsedAt ? `used ${relativeTime(k.lastUsedAt)}` : "never used"}
            </span>
            {!k.revokedAt && (
              <button
                onClick={() => void onRevoke(k.id)}
                className="shrink-0 rounded border border-line px-2 py-1 text-[11px] text-fg-muted transition-colors hover:border-danger/40 hover:text-danger"
              >
                Revoke
              </button>
            )}
          </div>
        ))}
      </div>

      <p className="text-[11px] leading-relaxed text-fg-dim">
        Keys are stored as SHA-256 hashes; only the display prefix is retained.
        Scope them per-integration so a leak can be revoked without downtime.
      </p>
    </div>
  );
}

/* ---------------------------- Audit log --------------------------- */

const ACTION_TONE: Record<string, string> = {
  "change.accepted": "text-ok",
  "change.rejected": "text-fg-dim",
  "change.proposed": "text-accent",
  "document.deleted": "text-danger",
  "apikey.revoked": "text-danger",
  "integration.disconnected": "text-warn",
};

function AuditTab({ entries }: { entries: AuditEntry[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      {!entries.length && (
        <p className="bg-elevated px-3.5 py-6 text-center text-[12px] text-fg-dim">
          No activity recorded yet.
        </p>
      )}
      {entries.map((e, i) => (
        <div
          key={e.id}
          className={cn(
            "flex items-baseline gap-3 bg-elevated px-3.5 py-2",
            i > 0 && "border-t border-line",
          )}
        >
          <span className="w-28 shrink-0 truncate text-[11.5px] text-fg-muted">
            {e.actorName}
          </span>
          <span
            className={cn(
              "w-44 shrink-0 truncate font-mono text-[11px]",
              ACTION_TONE[e.action] ?? "text-fg-dim",
            )}
          >
            {e.action}
          </span>
          <span className="min-w-0 flex-1 truncate text-[11.5px] text-fg-muted">
            {e.target}
          </span>
          <span className="shrink-0 text-[10.5px] text-fg-dim">
            {relativeTime(e.createdAt)}
          </span>
        </div>
      ))}
    </div>
  );
}
