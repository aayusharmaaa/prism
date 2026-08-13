import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { resolveShare } from "@/lib/db/repo";
import { DOC_KIND_LABEL, STATUS_LABEL } from "@/lib/format";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

/**
 * Public read-only view of a shared document.
 *
 * No session: the token *is* the credential, so `resolveShare` enforces
 * revocation and expiry itself. Nothing here links back into the workspace —
 * a stakeholder with this link gets exactly one document and no navigation
 * into the tenant.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const shared = await resolveShare(token);
  return {
    title: shared ? `${shared.document.title} — shared via Prism` : "Link unavailable",
    // A leaked link shouldn't end up in a search index.
    robots: { index: false, follow: false },
  };
}

export default async function SharedDocumentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const shared = await resolveShare(token);
  if (!shared) notFound();

  const { document: doc, workspace } = shared;

  return (
    <div className="h-full overflow-y-auto bg-editor">
      <header className="border-b border-line bg-app">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 px-6 py-3">
          <svg
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.1}
            strokeLinejoin="round"
            className="shrink-0"
            aria-hidden
          >
            <path d="M12 2.6L2.6 20.4L12 13.4Z" fill="currentColor" />
            <path d="M12 2.6L21.4 20.4L2.6 20.4Z" />
          </svg>
          <span className="text-[12.5px] font-semibold">Prism</span>
          <span className="h-3.5 w-px bg-line-strong" aria-hidden />
          <span className="text-[12.5px] text-fg-muted">{workspace.name}</span>
          <span className="ml-auto rounded border border-line px-1.5 py-px text-[10px] uppercase tracking-wide text-fg-dim">
            Read-only
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-5 flex flex-wrap items-center gap-2 border-b border-line pb-4">
          <h1 className="min-w-0 flex-1 text-[19px] font-semibold">{doc.title}</h1>
          <span className="rounded border border-line px-1.5 py-px text-[10px] uppercase tracking-wide text-fg-dim">
            {DOC_KIND_LABEL[doc.kind]}
          </span>
          <span className="rounded border border-line px-1.5 py-px text-[10px] uppercase tracking-wide text-fg-dim">
            {STATUS_LABEL[doc.status]}
          </span>
        </div>

        <article className="prose-prism pb-16">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.content}</ReactMarkdown>
        </article>
      </main>

      <footer className="border-t border-line px-6 py-4 text-center text-[11px] text-fg-dim">
        Shared from Prism · this is a snapshot of a living document and may have
        changed since the link was created.
      </footer>
    </div>
  );
}
