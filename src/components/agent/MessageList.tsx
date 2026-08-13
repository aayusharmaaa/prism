"use client";

import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useWorkspace } from "@/store/workspace";
import { useAgent } from "@/store/agent";
import { ToolCard } from "./ToolCard";
import { avatarStyle, cn, initials } from "@/lib/format";
import type { Citation, Message } from "@/lib/types";
import { BookOpen, Bot, MessageSquareQuote, TriangleAlert } from "lucide-react";

export function MessageList() {
  const { messages, streaming, streamText, streamTools, streamCitations, error } =
    useAgent();
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  // Follow the stream, but stop fighting the user if they scroll up to read.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (pinned.current) {
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
  }, [messages.length, streamText, streamTools.length]);

  const empty = !messages.length && !streaming;

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
      {empty && <EmptyState />}

      {messages.map((m) => (
        <MessageRow key={m.id} message={m} />
      ))}

      {streaming && (
        <div className="mb-4">
          <AssistantHeader />
          {streamTools.length > 0 && (
            <div className="mb-2 space-y-1">
              {streamTools.map((t) => (
                <ToolCard key={t.id} tool={t} />
              ))}
            </div>
          )}
          {streamText ? (
            <div className="prose-prism text-[12.5px]">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamText}</ReactMarkdown>
              <span className="caret" />
            </div>
          ) : (
            !streamTools.length && (
              <div className="flex items-center gap-1.5 text-[12px] text-fg-dim">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                Thinking…
              </div>
            )
          )}
          {streamCitations.length > 0 && <Citations citations={streamCitations} />}
        </div>
      )}

      {error && (
        <div className="mb-3 flex gap-2 rounded-md border border-danger/30 bg-danger/5 p-2.5">
          <TriangleAlert size={13} className="mt-px shrink-0 text-danger" />
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-danger">Request failed</p>
            <p className="mt-0.5 break-words text-[11.5px] leading-relaxed text-fg-muted">
              {error}
            </p>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

function MessageRow({ message }: { message: Message }) {
  const user = useWorkspace((s) => s.user);

  if (message.role === "user") {
    return (
      <div className="mb-4 flex gap-2">
        {user && (
          <div
            style={avatarStyle(user.avatarHue)}
            className="mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full text-[8.5px] font-bold text-white"
          >
            {initials(user.name)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="whitespace-pre-wrap break-words rounded-lg rounded-tl-sm bg-elevated px-2.5 py-2 text-[12.5px] leading-relaxed">
            {renderMentions(message.content)}
          </div>
          {message.attachments.length > 0 && (
            <AttachmentChips ids={message.attachments} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <AssistantHeader />
      {message.tools.length > 0 && (
        <div className="mb-2 space-y-1">
          {message.tools.map((t) => (
            <ToolCard key={t.id} tool={t} />
          ))}
        </div>
      )}
      {message.content && (
        <div className="prose-prism text-[12.5px]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        </div>
      )}
      {message.citations.length > 0 && <Citations citations={message.citations} />}
    </div>
  );
}

const AssistantHeader = () => (
  <div className="mb-1.5 flex items-center gap-1.5">
    <div className="grid h-5 w-5 place-items-center rounded-full bg-accent/15">
      <Bot size={12} className="text-accent" />
    </div>
    <span className="text-[11px] font-semibold text-fg-muted">Prism</span>
  </div>
);

function Citations({ citations }: { citations: Citation[] }) {
  const { openDocument, openSource } = useWorkspace();
  // The model may cite the same entity for several claims.
  const unique = citations.filter(
    (c, i) => citations.findIndex((x) => x.id === c.id && x.excerpt === c.excerpt) === i,
  );

  return (
    <div className="mt-2.5 border-l-2 border-line pl-2.5">
      <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-wide text-fg-dim">
        Grounded in {unique.length} source{unique.length === 1 ? "" : "s"}
      </div>
      <div className="space-y-1">
        {unique.map((c, i) => (
          <button
            key={`${c.id}-${i}`}
            onClick={() =>
              c.kind === "document" ? openDocument(c.id) : openSource(c.id)
            }
            className="group block w-full rounded border border-line bg-elevated/50 px-2 py-1.5 text-left transition-colors hover:border-accent/40 hover:bg-accent-soft"
          >
            <div className="flex items-center gap-1.5">
              {c.kind === "document" ? (
                <BookOpen size={10} className="shrink-0 text-fg-dim" />
              ) : (
                <MessageSquareQuote size={10} className="shrink-0 text-fg-dim" />
              )}
              <span className="truncate text-[10.5px] font-medium text-fg-muted group-hover:text-fg">
                {c.title}
              </span>
            </div>
            <p className="mt-0.5 line-clamp-2 text-[10.5px] italic leading-snug text-fg-dim">
              “{c.excerpt}”
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

function AttachmentChips({ ids }: { ids: string[] }) {
  const { documents, sources, openDocument, openSource } = useWorkspace();
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {ids.map((id) => {
        const doc = documents.find((d) => d.id === id);
        const src = sources.find((s) => s.id === id);
        const title = doc?.title ?? src?.title;
        if (!title) return null;
        return (
          <button
            key={id}
            onClick={() => (doc ? openDocument(id) : openSource(id))}
            className="rounded border border-line bg-elevated px-1.5 py-px text-[10px] text-fg-dim transition-colors hover:text-fg"
          >
            @{truncate(title)}
          </button>
        );
      })}
    </div>
  );
}

const truncate = (s: string, n = 28) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Renders `@[Title](id)` mentions as inline chips inside user messages. */
function renderMentions(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /@\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(
      <span
        key={key++}
        className={cn(
          "rounded bg-accent/20 px-1 py-px text-[11.5px] font-medium text-fg",
        )}
      >
        @{match[1]}
      </span>,
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : text;
}

function EmptyState() {
  const { documents, setAgentOpen } = useWorkspace();
  const send = useAgent((s) => s.send);
  const setMode = useAgent((s) => s.setMode);
  const liveModel = useWorkspace((s) => s.config.liveModel);

  const prompts: { label: string; text: string; mode: "ask" | "agent" | "plan" }[] = [
    {
      label: "What should we build next quarter?",
      text: "What should we build next quarter? Weigh the evidence and tell me where you'd push back on the current roadmap.",
      mode: "ask",
    },
    {
      label: "Break the saved-views PRD into tickets",
      text: "Break the saved views PRD into engineering tickets with acceptance criteria.",
      mode: "agent",
    },
    {
      label: "Tighten the evidence in the SSO PRD",
      text: "The SSO PRD's evidence section is thin. Ground it in what's actually in the workspace and fix anything the interviews contradict.",
      mode: "agent",
    },
    {
      label: "Plan the time-to-first-insight work",
      text: "Plan how we'd cut time-to-first-insight in half this half.",
      mode: "plan",
    },
  ];

  return (
    <div className="px-1 py-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="grid h-7 w-7 place-items-center rounded-lg bg-accent/15">
          <Bot size={15} className="text-accent" />
        </div>
        <div>
          <h3 className="text-[13px] font-semibold">Prism</h3>
          <p className="text-[11px] text-fg-dim">
            {documents.length} documents ·{" "}
            {liveModel ? "live model" : "demo mode"}
          </p>
        </div>
      </div>

      <p className="mb-3 text-[12px] leading-relaxed text-fg-muted">
        I can search your workspace, cite the evidence behind a claim, propose
        document edits as reviewable diffs, and draft tickets. Everything I
        change lands as a proposal you accept or reject.
      </p>

      <div className="space-y-1.5">
        {prompts.map((p) => (
          <button
            key={p.label}
            onClick={() => {
              setMode(p.mode);
              setAgentOpen(true);
              void send(p.text);
            }}
            className="group block w-full rounded-md border border-line bg-elevated/50 px-2.5 py-2 text-left transition-colors hover:border-accent/40 hover:bg-accent-soft"
          >
            <span className="text-[12px] text-fg-muted group-hover:text-fg">
              {p.label}
            </span>
            <span className="ml-1.5 text-[9.5px] uppercase tracking-wide text-fg-dim">
              {p.mode}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
