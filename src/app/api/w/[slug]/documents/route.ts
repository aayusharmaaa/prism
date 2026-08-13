import * as repo from "@/lib/db/repo";
import { handle, requireRole, requireSession } from "@/lib/session";
import type { DocKind } from "@/lib/types";

export const dynamic = "force-dynamic";

const KINDS: DocKind[] = ["prd", "spec", "onepager", "research", "roadmap", "note"];

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  return handle(async () => {
    const session = await requireSession(slug);
    return { documents: await repo.listDocuments(session.workspace.id) };
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  return handle(async () => {
    const session = await requireSession(slug);
    requireRole(session, "editor");

    const body = (await req.json().catch(() => ({}))) as {
      title?: string;
      kind?: string;
      content?: string;
      folderId?: string | null;
    };

    const kind = KINDS.includes(body.kind as DocKind)
      ? (body.kind as DocKind)
      : "note";
    const title = (body.title ?? "").trim() || "Untitled";

    const doc = await repo.createDocument({
      workspaceId: session.workspace.id,
      title,
      kind,
      content: body.content ?? starter(kind, title),
      folderId: body.folderId ?? null,
      createdBy: session.user.id,
    });

    await repo.audit({
      workspaceId: session.workspace.id,
      actorId: session.user.id,
      actorName: session.user.name,
      action: "document.created",
      target: doc.title,
      meta: { documentId: doc.id },
    });

    return { document: doc };
  });
}

/** Templates so a new document opens with structure instead of a blank page. */
function starter(kind: DocKind, title: string): string {
  const heading = `# ${title}\n\n`;
  switch (kind) {
    case "prd":
      return (
        heading +
        `**Status:** Draft · **Owner:** · **Target:**\n\n` +
        `## Problem\n\nWhat is broken, for whom, and why it matters now.\n\n` +
        `## Evidence\n\nCite sources. No "customers have told us" without a link.\n\n` +
        `## Non-goals\n\nWhat this explicitly does not do, and why.\n\n` +
        `## Solution\n\n` +
        `## Success metrics\n\n| Metric | Baseline | Target |\n| --- | --- | --- |\n|  |  |  |\n\n` +
        `Counter-metric:\n\n` +
        `## Rollout\n\n1. \n\n## Open questions\n\n- `
      );
    case "onepager":
      return (
        heading +
        `## The claim\n\n## The number\n\n## Why it's true\n\n` +
        `## The bets\n\n| Bet | Attacks | Size | Owner |\n| --- | --- | --- | --- |\n|  |  |  |  |\n\n` +
        `## What I'd cut to fund it\n\n`
      );
    case "research":
      return (
        heading +
        `**Method:**\n\n## Headline\n\n## Finding 1\n\n## Finding 2\n\n` +
        `## Recommendations\n\n1. \n\n## What would change our mind\n\n`
      );
    case "roadmap":
      return (
        heading +
        `## Now — in build\n\n| Item | Size | Owner | Attacks |\n| --- | --- | --- | --- |\n|  |  |  |  |\n\n` +
        `## Next — committed\n\n## Later — believed, unproven\n\n## Not doing, and why\n\n`
      );
    case "spec":
      return heading + `## Overview\n\n## Behaviour\n\n## Edge cases\n\n## Telemetry\n\n`;
    default:
      return heading;
  }
}
