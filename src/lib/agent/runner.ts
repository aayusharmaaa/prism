import Anthropic from "@anthropic-ai/sdk";
import * as repo from "@/lib/db/repo";
import { buildSystemPrompt } from "./prompts";
import { findTool, toolsForMode, type ToolContext } from "./tools";
import { runDemoAgent } from "./demo";
import type { AgentEvent, AgentMode, Citation, Message, ToolInvocation } from "@/lib/types";

export const MODELS = [
  { id: "claude-opus-5", label: "Opus 5", hint: "Deepest reasoning" },
  { id: "claude-sonnet-5", label: "Sonnet 5", hint: "Balanced" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", hint: "Fastest" },
] as const;

export const DEFAULT_MODEL = MODELS[0].id;

export const hasApiKey = () => Boolean(process.env.ANTHROPIC_API_KEY);

/** Tool results are replayed into history; cap them so context stays sane. */
const MAX_HISTORY_RESULT = 4000;
const MAX_TURNS = 10;

export interface RunOptions {
  workspaceId: string;
  workspaceName: string;
  userId: string;
  userName: string;
  threadId: string;
  mode: AgentMode;
  model: string;
  history: Message[];
  emit: (event: AgentEvent) => void;
  signal?: AbortSignal;
}

export interface RunResult {
  text: string;
  tools: ToolInvocation[];
  citations: Citation[];
  inputTokens: number;
  outputTokens: number;
}

/**
 * Runs the agent loop, streaming events as it goes.
 *
 * Falls back to a scripted-but-real demo agent when no API key is configured,
 * so the product is always demoable. The demo agent executes genuine tool
 * calls against the workspace — only the prose is canned.
 */
export async function runAgent(opts: RunOptions): Promise<RunResult> {
  if (!hasApiKey()) return runDemoAgent(opts);

  const [documents, sources] = await Promise.all([
    repo.listDocuments(opts.workspaceId),
    repo.listSources(opts.workspaceId),
  ]);
  const memory = documents.find((d) => d.kind === "memory");

  const system = buildSystemPrompt({
    mode: opts.mode,
    memory: memory?.content ?? "(no product memory configured)",
    documents,
    sources,
    userName: opts.userName,
    workspaceName: opts.workspaceName,
  });

  const specs = toolsForMode(opts.mode);
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const citations: Citation[] = [];
  const toolLog: ToolInvocation[] = [];
  const ctx: ToolContext = {
    workspaceId: opts.workspaceId,
    userId: opts.userId,
    userName: opts.userName,
    threadId: opts.threadId,
    mode: opts.mode,
    emit: (e) => {
      if (e.type === "citation") citations.push(e.citation);
      opts.emit(e);
    },
  };

  const messages: Anthropic.MessageParam[] = toAnthropicHistory(opts.history);

  let finalText = "";
  let inputTokens = 0;
  let outputTokens = 0;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (opts.signal?.aborted) break;

    const stream = client.messages.stream(
      {
        model: opts.model,
        max_tokens: 8000,
        system,
        messages,
        ...(specs.length
          ? {
              tools: specs.map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: t.input_schema as Anthropic.Tool.InputSchema,
              })),
            }
          : {}),
      },
      { signal: opts.signal },
    );

    let turnText = "";
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        turnText += event.delta.text;
        opts.emit({ type: "text", delta: event.delta.text });
      }
    }

    const final = await stream.finalMessage();
    inputTokens += final.usage.input_tokens ?? 0;
    outputTokens += final.usage.output_tokens ?? 0;
    if (turnText) finalText += (finalText ? "\n\n" : "") + turnText;

    const toolUses = final.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    if (final.stop_reason !== "tool_use" || !toolUses.length) break;

    messages.push({ role: "assistant", content: final.content });

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      const spec = findTool(use.name);
      const input = (use.input ?? {}) as Record<string, unknown>;

      const invocation: ToolInvocation = {
        id: use.id,
        name: use.name,
        input,
        status: "running",
        summary: spec ? spec.label(input) : use.name,
      };
      opts.emit({ type: "tool_start", tool: invocation });

      const started = Date.now();
      if (!spec) {
        const done: ToolInvocation = {
          ...invocation,
          status: "error",
          summary: `Unknown tool '${use.name}'`,
          durationMs: 0,
        };
        toolLog.push(done);
        opts.emit({ type: "tool_end", tool: done });
        results.push({
          type: "tool_result",
          tool_use_id: use.id,
          is_error: true,
          content: `No tool named '${use.name}' exists.`,
        });
        continue;
      }

      try {
        const { summary, result } = await spec.run(input, ctx);
        const done: ToolInvocation = {
          ...invocation,
          status: "ok",
          summary,
          result,
          durationMs: Date.now() - started,
        };
        toolLog.push(done);
        opts.emit({ type: "tool_end", tool: done });
        results.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: truncate(JSON.stringify(result)),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const done: ToolInvocation = {
          ...invocation,
          status: "error",
          summary: message.slice(0, 160),
          durationMs: Date.now() - started,
        };
        toolLog.push(done);
        opts.emit({ type: "tool_end", tool: done });
        // Errors go back to the model so it can correct itself.
        results.push({
          type: "tool_result",
          tool_use_id: use.id,
          is_error: true,
          content: message,
        });
      }
    }

    messages.push({ role: "user", content: results });
  }

  opts.emit({ type: "usage", inputTokens, outputTokens });
  return { text: finalText, tools: toolLog, citations, inputTokens, outputTokens };
}

/* ------------------------------------------------------------------ */

function truncate(text: string): string {
  return text.length > MAX_HISTORY_RESULT
    ? `${text.slice(0, MAX_HISTORY_RESULT)}\n…[truncated]`
    : text;
}

/**
 * Rebuilds the Anthropic message list from stored history, including
 * tool_use/tool_result pairs so the model retains what it did earlier.
 */
function toAnthropicHistory(history: Message[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];

  for (const m of history) {
    if (m.role === "system") continue;

    if (m.role === "user") {
      const text = m.content.trim();
      if (text) out.push({ role: "user", content: text });
      continue;
    }

    const blocks: Anthropic.ContentBlockParam[] = [];
    if (m.content.trim()) blocks.push({ type: "text", text: m.content });
    for (const t of m.tools) {
      if (t.status === "running") continue;
      blocks.push({
        type: "tool_use",
        id: t.id,
        name: t.name,
        input: t.input,
      });
    }
    if (!blocks.length) continue;
    out.push({ role: "assistant", content: blocks });

    const results: Anthropic.ToolResultBlockParam[] = m.tools
      .filter((t) => t.status !== "running")
      .map((t) => ({
        type: "tool_result" as const,
        tool_use_id: t.id,
        is_error: t.status === "error",
        content: truncate(
          t.status === "error"
            ? (t.summary ?? "Tool failed")
            : JSON.stringify(t.result ?? { ok: true }),
        ),
      }));
    if (results.length) out.push({ role: "user", content: results });
  }

  // The API requires the conversation to start with a user turn.
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}
