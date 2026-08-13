import Anthropic from "@anthropic-ai/sdk";
import * as repo from "@/lib/db/repo";
import { requireRole, requireSession, HttpError } from "@/lib/session";
import { buildInlinePrompt } from "@/lib/agent/prompts";
import { DEFAULT_MODEL, MODELS, hasApiKey } from "@/lib/agent/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Cmd+K inline edit: rewrites a selection in place and streams the replacement
 * back as plain text. No tools, no persistence — the client turns the result
 * into a diff the user accepts or rejects.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  let session;
  try {
    session = await requireSession(slug);
    requireRole(session, "editor");
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unauthorized";
    return Response.json({ error: message }, { status });
  }

  const body = (await req.json().catch(() => ({}))) as {
    documentId?: string;
    selection?: string;
    instruction?: string;
    model?: string;
  };

  const selection = body.selection ?? "";
  const instruction = (body.instruction ?? "").trim();
  if (!instruction) {
    return Response.json({ error: "instruction is required" }, { status: 400 });
  }

  const doc = body.documentId
    ? await repo.getDocument(session.workspace.id, body.documentId)
    : null;
  if (!doc) {
    return Response.json({ error: "document not found" }, { status: 404 });
  }

  const docs = await repo.listDocuments(session.workspace.id);
  const memory = docs.find((d) => d.kind === "memory")?.content ?? "";

  const encoder = new TextEncoder();
  const model = MODELS.some((m) => m.id === body.model)
    ? (body.model as string)
    : DEFAULT_MODEL;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (text: string) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ delta: text })}\n\n`),
        );
      };

      try {
        if (!hasApiKey()) {
          await demoRewrite(selection, instruction, send);
        } else {
          const client = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY,
          });
          const system = buildInlinePrompt({
            documentTitle: doc.title,
            memory,
            fullDocument: doc.content,
            selection,
          });
          const msg = client.messages.stream(
            {
              model,
              max_tokens: 4000,
              system,
              messages: [{ role: "user", content: instruction }],
            },
            { signal: req.signal },
          );
          for await (const event of msg) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              send(event.delta.text);
            }
          }
          const final = await msg.finalMessage();
          await repo.recordUsage({
            workspaceId: session.workspace.id,
            userId: session.user.id,
            model,
            inputTokens: final.usage.input_tokens ?? 0,
            outputTokens: final.usage.output_tokens ?? 0,
          });
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Inline edit failed";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`),
        );
      } finally {
        try {
          controller.close();
        } catch {
          /* client already gone */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

/**
 * Keyless fallback. Applies a few real transformations so the Cmd+K flow can
 * still be demonstrated and tested end to end.
 */
async function demoRewrite(
  selection: string,
  instruction: string,
  send: (t: string) => void,
) {
  const lower = instruction.toLowerCase();
  let out: string;

  if (/shorter|tighten|concise|trim|cut/.test(lower)) {
    out = selection
      .split(/\n\n+/)
      .map((para) => {
        const sentences = para.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [para];
        return sentences.slice(0, Math.max(1, Math.ceil(sentences.length * 0.6)))
          .join("")
          .trim();
      })
      .join("\n\n")
      .replace(/\b(very|really|quite|simply|just|actually|basically)\s+/gi, "");
  } else if (/bullet|list/.test(lower)) {
    out = selection
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => `- ${s.replace(/[.]$/, "")}`)
      .join("\n");
  } else if (/table/.test(lower)) {
    const rows = selection
      .split("\n")
      .map((l) => l.replace(/^[-*]\s*/, "").trim())
      .filter(Boolean);
    out = ["| Item | Detail |", "| --- | --- |"]
      .concat(
        rows.map((r) => {
          const [head, ...rest] = r.split(/[:—-]\s*/);
          return `| ${head.trim()} | ${rest.join(" ").trim() || "—"} |`;
        }),
      )
      .join("\n");
  } else if (/question|clarif|open/.test(lower)) {
    out = `${selection.trimEnd()}\n\n**Open question:** what evidence would change this conclusion, and who owns getting it?`;
  } else {
    out =
      `${selection.trimEnd()}\n\n` +
      `> _Demo mode — no ANTHROPIC_API_KEY configured, so this is a canned ` +
      `transformation rather than a real rewrite. Try "make this shorter", ` +
      `"turn this into bullets", or "make this a table" to see the inline ` +
      `diff flow work properly._`;
  }

  const tokens = out.match(/\S+\s*/g) ?? [out];
  for (const t of tokens) {
    send(t);
    await new Promise((r) => setTimeout(r, 14));
  }
}
