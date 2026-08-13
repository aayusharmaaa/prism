import * as repo from "@/lib/db/repo";
import { requireRole, requireSession, HttpError } from "@/lib/session";
import { DEFAULT_MODEL, MODELS, runAgent } from "@/lib/agent/runner";
import { deriveThreadTitle } from "@/lib/agent/prompts";
import type { AgentEvent, AgentMode } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MODES: AgentMode[] = ["ask", "agent", "plan"];

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  let session;
  try {
    session = await requireSession(slug);
    // Viewers can ask questions but cannot run tools that mutate.
    requireRole(session, "viewer");
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    return Response.json({ error: String(err) }, { status });
  }

  const body = (await req.json().catch(() => ({}))) as {
    threadId?: string;
    mode?: string;
    model?: string;
    message?: string;
    attachments?: string[];
  };

  const message = (body.message ?? "").trim();
  if (!message) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  let mode: AgentMode = MODES.includes(body.mode as AgentMode)
    ? (body.mode as AgentMode)
    : "agent";
  // Read-only members can't be handed mutating tools regardless of UI state.
  if (session.role === "viewer") mode = "ask";

  const model = MODELS.some((m) => m.id === body.model)
    ? (body.model as string)
    : DEFAULT_MODEL;

  const encoder = new TextEncoder();
  const controllerAbort = new AbortController();
  req.signal.addEventListener("abort", () => controllerAbort.abort());

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: AgentEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };

      try {
        const thread =
          (body.threadId &&
            (await repo.listThreads(session.workspace.id)).find(
              (t) => t.id === body.threadId,
            )) ||
          (await repo.createThread({
            workspaceId: session.workspace.id,
            title: deriveThreadTitle(message),
            mode,
            createdBy: session.user.id,
          }));

        send({ type: "thread", threadId: thread.id });

        await repo.createMessage({
          threadId: thread.id,
          role: "user",
          content: message,
          attachments: body.attachments ?? [],
        });

        const history = await repo.listMessages(thread.id);
        const placeholder = await repo.createMessage({
          threadId: thread.id,
          role: "assistant",
          content: "",
        });
        send({ type: "message_start", messageId: placeholder.id });

        const result = await runAgent({
          workspaceId: session.workspace.id,
          workspaceName: session.workspace.name,
          userId: session.user.id,
          userName: session.user.name,
          threadId: thread.id,
          mode,
          model,
          history,
          emit: send,
          signal: controllerAbort.signal,
        });

        await repo.updateMessage(placeholder.id, {
          content: result.text,
          tools: result.tools,
          citations: result.citations,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        });
        await repo.touchThread(thread.id);
        await repo.recordUsage({
          workspaceId: session.workspace.id,
          userId: session.user.id,
          model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        });

        send({ type: "done", messageId: placeholder.id });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        console.error("[prism/agent]", err);
        send({
          type: "error",
          message: controllerAbort.signal.aborted ? "Stopped." : detail,
        });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed by the client disconnecting */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
