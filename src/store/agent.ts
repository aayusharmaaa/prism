"use client";

import { create } from "zustand";
import { useWorkspace } from "./workspace";
import type {
  AgentEvent,
  AgentMode,
  Citation,
  Message,
  ToolInvocation,
} from "@/lib/types";

interface AgentState {
  threadId: string | null;
  messages: Message[];
  mode: AgentMode;
  model: string;

  streaming: boolean;
  streamText: string;
  streamTools: ToolInvocation[];
  streamCitations: Citation[];
  error: string | null;

  /** Entity ids attached to the next message via @-mention. */
  attachments: string[];
  /** Set by Cmd+L; the composer picks it up and clears it. */
  pendingInsert: string | null;

  setMode: (mode: AgentMode) => void;
  setModel: (model: string) => void;
  addAttachment: (id: string) => void;
  removeAttachment: (id: string) => void;
  queueInsert: (text: string) => void;
  consumeInsert: () => string | null;

  newThread: () => void;
  loadThread: (threadId: string) => Promise<void>;
  send: (text: string) => Promise<void>;
  stop: () => void;
}

let controller: AbortController | null = null;

export const useAgent = create<AgentState>((set, get) => ({
  threadId: null,
  messages: [],
  mode: "agent",
  model: "claude-opus-5",

  streaming: false,
  streamText: "",
  streamTools: [],
  streamCitations: [],
  error: null,

  attachments: [],
  pendingInsert: null,

  setMode: (mode) => set({ mode }),
  setModel: (model) => set({ model }),

  addAttachment: (id) => {
    const { attachments } = get();
    if (!attachments.includes(id)) set({ attachments: [...attachments, id] });
  },
  removeAttachment: (id) =>
    set({ attachments: get().attachments.filter((a) => a !== id) }),

  queueInsert: (text) => set({ pendingInsert: text }),
  consumeInsert: () => {
    const t = get().pendingInsert;
    if (t) set({ pendingInsert: null });
    return t;
  },

  newThread: () => {
    controller?.abort();
    set({
      threadId: null,
      messages: [],
      streaming: false,
      streamText: "",
      streamTools: [],
      streamCitations: [],
      error: null,
      attachments: [],
    });
  },

  async loadThread(threadId) {
    const { slug } = useWorkspace.getState();
    set({ threadId, messages: [], error: null });
    const res = await fetch(`/api/w/${slug}/threads/${threadId}`, {
      cache: "no-store",
    });
    if (!res.ok) return;
    const data = (await res.json()) as { messages: Message[] };
    set({ messages: data.messages ?? [] });
  },

  stop() {
    controller?.abort();
    controller = null;
    set({ streaming: false });
  },

  async send(text) {
    const trimmed = text.trim();
    if (!trimmed || get().streaming) return;

    const ws = useWorkspace.getState();
    const { threadId, mode, model, attachments } = get();

    // Optimistic user message so the UI responds immediately.
    const optimistic: Message = {
      id: `local_${Date.now()}`,
      threadId: threadId ?? "pending",
      role: "user",
      content: trimmed,
      tools: [],
      citations: [],
      attachments,
      createdAt: new Date().toISOString(),
    };

    set({
      messages: [...get().messages, optimistic],
      streaming: true,
      streamText: "",
      streamTools: [],
      streamCitations: [],
      error: null,
      attachments: [],
    });

    controller = new AbortController();

    try {
      const res = await fetch(`/api/w/${ws.slug}/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, mode, model, message: trimmed, attachments }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        set({ error: err.error ?? `Request failed (${res.status})`, streaming: false });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line.
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          try {
            handleEvent(JSON.parse(line.slice(6)) as AgentEvent, set, get);
          } catch {
            /* skip malformed frame */
          }
        }
      }
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        set({ error: err instanceof Error ? err.message : "Stream failed" });
      }
    } finally {
      // Fold whatever streamed into a real assistant message.
      const { streamText, streamTools, streamCitations, threadId: tid } = get();
      if (streamText || streamTools.length) {
        set({
          messages: [
            ...get().messages,
            {
              id: `asst_${Date.now()}`,
              threadId: tid ?? "pending",
              role: "assistant",
              content: streamText,
              tools: streamTools,
              citations: streamCitations,
              attachments: [],
              createdAt: new Date().toISOString(),
            },
          ],
        });
      }
      set({
        streaming: false,
        streamText: "",
        streamTools: [],
        streamCitations: [],
      });
      controller = null;
      void useWorkspace.getState().refresh("all");
    }
  },
}));

type Setter = (partial: Partial<AgentState>) => void;
type Getter = () => AgentState;

function handleEvent(event: AgentEvent, set: Setter, get: Getter) {
  const ws = useWorkspace.getState();

  switch (event.type) {
    case "thread":
      set({ threadId: event.threadId });
      break;

    case "text":
      set({ streamText: get().streamText + event.delta });
      break;

    case "tool_start":
      set({ streamTools: [...get().streamTools, event.tool] });
      break;

    case "tool_end":
      set({
        streamTools: get().streamTools.map((t) =>
          t.id === event.tool.id ? event.tool : t,
        ),
      });
      break;

    case "citation":
      set({ streamCitations: [...get().streamCitations, event.citation] });
      break;

    case "change":
      ws.addChange(event.change);
      break;

    case "tickets":
      ws.addTicketBatch(event.batch);
      break;

    case "invalidate":
      void ws.refresh(event.scope === "memory" ? "documents" : event.scope);
      break;

    case "error":
      set({ error: event.message });
      break;

    default:
      break;
  }
}
