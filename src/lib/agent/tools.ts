import * as repo from "@/lib/db/repo";
import type { AgentEvent, AgentMode, Citation, DraftTicket } from "@/lib/types";
import { crosstab, crosstabToMarkdown, parseCsv } from "@/lib/csv";
import { nanoid } from "nanoid";

export interface ToolContext {
  workspaceId: string;
  userId: string;
  userName: string;
  threadId: string;
  mode: AgentMode;
  emit: (event: AgentEvent) => void;
}

export interface ToolSpec {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  /** Modes in which this tool is offered to the model. */
  modes: AgentMode[];
  /** Short label rendered in the tool card while running. */
  label: (input: Record<string, unknown>) => string;
  run: (
    input: Record<string, unknown>,
    ctx: ToolContext,
  ) => Promise<{ summary: string; result: unknown }>;
}

const s = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;

/* ------------------------------------------------------------------ */

export const TOOLS: ToolSpec[] = [
  {
    name: "search_workspace",
    description:
      "Full-text search across every document and source in the workspace. " +
      "Returns ranked snippets with entity ids. Start here when you need to " +
      "find evidence — it is much cheaper than reading entities blindly. " +
      "Search with distinctive nouns from the domain rather than full questions.",
    modes: ["ask", "agent", "plan"],
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Keywords to search for, e.g. 'saved views retention'",
        },
        limit: {
          type: "integer",
          description: "Max results (default 8, max 20)",
        },
      },
      required: ["query"],
    },
    label: (i) => `Searching “${s(i.query)}”`,
    async run(input, ctx) {
      const limit = Math.min(Math.max(Number(input.limit) || 8, 1), 20);
      const hits = await repo.searchWorkspace(
        ctx.workspaceId,
        s(input.query),
        limit,
      );
      return {
        summary: hits.length
          ? `${hits.length} result${hits.length === 1 ? "" : "s"}`
          : "No results",
        result: hits.map((h) => ({
          id: h.id,
          type: h.type,
          title: h.title,
          excerpt: h.excerpt,
        })),
      };
    },
  },

  {
    name: "read_entity",
    description:
      "Read the full content of a document (id starts with `doc_`) or a source " +
      "(id starts with `src_`). Use this before quoting, citing, or editing " +
      "anything — search snippets are too short to reason from reliably.",
    modes: ["ask", "agent", "plan"],
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Entity id, e.g. `doc_saved_views` or `src_int_northwind`",
        },
      },
      required: ["id"],
    },
    label: (i) => `Reading ${s(i.id)}`,
    async run(input, ctx) {
      const entityId = s(input.id);
      if (entityId.startsWith("src_")) {
        const src = await repo.getSource(ctx.workspaceId, entityId);
        if (!src) throw new Error(`No source with id '${entityId}'.`);
        return {
          summary: src.title,
          result: {
            id: src.id,
            type: "source",
            kind: src.kind,
            title: src.title,
            origin: src.origin,
            capturedAt: src.capturedAt,
            meta: src.meta,
            content: src.content,
          },
        };
      }
      const doc = await repo.getDocument(ctx.workspaceId, entityId);
      if (!doc) {
        throw new Error(
          `No document with id '${entityId}'. Use search_workspace to find the right id.`,
        );
      }
      return {
        summary: doc.title,
        result: {
          id: doc.id,
          type: "document",
          kind: doc.kind,
          title: doc.title,
          status: doc.status,
          updatedAt: doc.updatedAt,
          content: doc.content,
        },
      };
    },
  },

  {
    name: "analyze_source",
    description:
      "Aggregate a tabular source (an uploaded CSV, a support export, a ticket " +
      "dump) into a pivot table — the severity × frequency matrix a PM would " +
      "otherwise build by hand in a spreadsheet.\n\n" +
      "Group by `row_field`. Add `col_field` for a second dimension. By default " +
      "rows are counted; set `measure_field` to sum a numeric column instead " +
      "(e.g. sum ARR by tag rather than counting tickets — volume and revenue " +
      "usually rank differently, and the gap between them is often the " +
      "finding). Call `read_entity` first if you need the exact column names.",
    modes: ["ask", "agent", "plan"],
    input_schema: {
      type: "object",
      properties: {
        source_id: { type: "string", description: "Tabular source id (`src_…`)" },
        row_field: {
          type: "string",
          description: "Column to group rows by, e.g. 'tag'",
        },
        col_field: {
          type: "string",
          description: "Optional second dimension, e.g. 'severity'",
        },
        measure_field: {
          type: "string",
          description:
            "Optional numeric column to sum instead of counting rows, e.g. 'arr'",
        },
        limit: {
          type: "integer",
          description: "Max rows to return (default 25)",
        },
      },
      required: ["source_id", "row_field"],
    },
    label: (i) =>
      `Analysing ${s(i.row_field)}${i.col_field ? ` × ${s(i.col_field)}` : ""}`,
    async run(input, ctx) {
      const source = await repo.getSource(ctx.workspaceId, s(input.source_id));
      if (!source) throw new Error(`No source with id '${s(input.source_id)}'.`);

      const parsed = parseCsv(source.content);
      if (parsed.headers.length < 2 || !parsed.rows.length) {
        throw new Error(
          `'${source.title}' is not tabular, so it can't be aggregated. ` +
            `Use read_entity to read it as text instead.`,
        );
      }

      // Surfacing valid columns in the error lets the model self-correct
      // instead of guessing again.
      const known = parsed.headers.join(", ");
      const check = (name: string, label: string) => {
        if (!name) return;
        if (!parsed.headers.some((h) => h.toLowerCase() === name.toLowerCase())) {
          throw new Error(
            `${label} '${name}' is not a column in '${source.title}'. ` +
              `Available columns: ${known}.`,
          );
        }
      };
      check(s(input.row_field), "row_field");
      check(s(input.col_field), "col_field");
      check(s(input.measure_field), "measure_field");

      const table = crosstab(
        parsed,
        s(input.row_field),
        s(input.col_field) || null,
        s(input.measure_field) || null,
      );

      const limit = Math.min(Math.max(Number(input.limit) || 25, 1), 100);
      const trimmed = { ...table, rows: table.rows.slice(0, limit) };

      return {
        summary: `${table.rows.length} groups · ${parsed.rows.length} rows`,
        result: {
          source: source.title,
          rowsAnalysed: parsed.rows.length,
          groups: table.rows.length,
          measure: table.measure,
          grandTotal: table.grandTotal,
          table: crosstabToMarkdown(trimmed),
          truncated: table.rows.length > limit,
        },
      };
    },
  },

  {
    name: "cite",
    description:
      "Record a citation backing a claim you are making. The excerpt must be " +
      "copied verbatim from an entity you have actually read — do not " +
      "paraphrase it. Citations render as chips the PM can click to verify. " +
      "Cite the specific evidence for load-bearing claims, not every sentence.",
    modes: ["ask", "agent", "plan"],
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Entity id being cited" },
        excerpt: {
          type: "string",
          description:
            "Verbatim fragment (under ~240 chars) that supports the claim",
        },
      },
      required: ["id", "excerpt"],
    },
    label: () => "Citing evidence",
    async run(input, ctx) {
      const entityId = s(input.id);
      const isSource = entityId.startsWith("src_");
      const entity = isSource
        ? await repo.getSource(ctx.workspaceId, entityId)
        : await repo.getDocument(ctx.workspaceId, entityId);
      if (!entity) throw new Error(`No entity with id '${entityId}'.`);

      const citation: Citation = {
        id: entityId,
        kind: isSource ? "source" : "document",
        title: entity.title,
        excerpt: s(input.excerpt).slice(0, 400),
      };
      ctx.emit({ type: "citation", citation });
      return { summary: entity.title, result: { recorded: true } };
    },
  },

  {
    name: "propose_edit",
    description:
      "Propose changes to an existing document. The edit arrives in the PM's " +
      "editor as a reviewable diff they accept or reject per hunk — it is not " +
      "applied automatically, so be decisive rather than asking permission.\n\n" +
      "Provide targeted find/replace pairs, not the whole rewritten document. " +
      "Each `find` string must appear EXACTLY ONCE in the current content — " +
      "include enough surrounding context to be unique. To delete a passage, " +
      "use an empty `replace`. To add a new section at the end, use `append` " +
      "instead of `edits`.",
    modes: ["agent"],
    input_schema: {
      type: "object",
      properties: {
        document_id: { type: "string", description: "Target document id" },
        summary: {
          type: "string",
          description:
            "One line describing the change, shown above the diff, e.g. " +
            "'Add SCIM deprovisioning to non-goals and success metrics'",
        },
        edits: {
          type: "array",
          description: "Find/replace pairs applied in order",
          items: {
            type: "object",
            properties: {
              find: {
                type: "string",
                description: "Exact existing text, unique within the document",
              },
              replace: {
                type: "string",
                description: "Replacement text (empty string deletes)",
              },
            },
            required: ["find", "replace"],
          },
        },
        append: {
          type: "string",
          description: "Text to append to the end of the document instead",
        },
      },
      required: ["document_id", "summary"],
    },
    label: (i) => `Editing ${s(i.document_id)}`,
    async run(input, ctx) {
      const docId = s(input.document_id);
      const doc = await repo.getDocument(ctx.workspaceId, docId);
      if (!doc) {
        throw new Error(
          `No document with id '${docId}'. Use search_workspace to find it.`,
        );
      }

      let after = doc.content;
      const edits = Array.isArray(input.edits)
        ? (input.edits as { find?: unknown; replace?: unknown }[])
        : [];
      const appendText = s(input.append);

      if (!edits.length && !appendText) {
        throw new Error("Provide either `edits` or `append`.");
      }

      edits.forEach((edit, idx) => {
        const find = s(edit.find);
        const replace = s(edit.replace);
        if (!find) throw new Error(`edits[${idx}].find must be a non-empty string.`);
        const first = after.indexOf(find);
        if (first === -1) {
          throw new Error(
            `edits[${idx}].find not found in '${doc.title}'. The text must match ` +
              `the current content exactly, including whitespace. Re-read the ` +
              `document and retry with an exact excerpt.`,
          );
        }
        if (after.indexOf(find, first + find.length) !== -1) {
          throw new Error(
            `edits[${idx}].find appears more than once in '${doc.title}'. Add ` +
              `surrounding context to make it unique.`,
          );
        }
        after = after.slice(0, first) + replace + after.slice(first + find.length);
      });

      if (appendText) {
        after = `${after.replace(/\s+$/, "")}\n\n${appendText.trim()}\n`;
      }

      if (after === doc.content) {
        throw new Error("The edits produced no change to the document.");
      }

      const change = await repo.createChange({
        workspaceId: ctx.workspaceId,
        documentId: docId,
        threadId: ctx.threadId,
        before: doc.content,
        after,
        summary: s(input.summary, "Proposed edit"),
      });
      ctx.emit({ type: "change", change });
      await repo.audit({
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        actorName: "Prism agent",
        action: "change.proposed",
        target: doc.title,
        meta: { changeId: change.id, documentId: docId },
      });

      return {
        summary: `Diff ready for ${doc.title}`,
        result: {
          changeId: change.id,
          documentTitle: doc.title,
          status: "pending_review",
          note:
            "The diff is now open in the PM's editor awaiting accept/reject. " +
            "Do not repeat the edited content in your reply — just say what " +
            "changed and why.",
        },
      };
    },
  },

  {
    name: "create_document",
    description:
      "Create a new document in the workspace — a PRD, one-pager, research " +
      "writeup, or plan. Write the full markdown body. Follow the PRD " +
      "structure in Product Memory when the kind is `prd`.",
    modes: ["agent", "plan"],
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        kind: {
          type: "string",
          enum: ["prd", "spec", "onepager", "research", "roadmap", "note"],
        },
        content: { type: "string", description: "Full markdown body" },
      },
      required: ["title", "kind", "content"],
    },
    label: (i) => `Creating “${s(i.title)}”`,
    async run(input, ctx) {
      const doc = await repo.createDocument({
        workspaceId: ctx.workspaceId,
        title: s(input.title, "Untitled"),
        kind: s(input.kind, "note") as never,
        content: s(input.content),
        folderId: null,
        createdBy: ctx.userId,
      });
      ctx.emit({ type: "invalidate", scope: "documents" });
      await repo.audit({
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        actorName: "Prism agent",
        action: "document.created",
        target: doc.title,
        meta: { documentId: doc.id },
      });
      return {
        summary: doc.title,
        result: { documentId: doc.id, title: doc.title, opened: true },
      };
    },
  },

  {
    name: "draft_tickets",
    description:
      "Break work into engineering tickets with acceptance criteria. Produces " +
      "a reviewable batch the PM can edit and push to Jira or Linear.\n\n" +
      "Write acceptance criteria as Given/When/Then per Product Memory. Use " +
      "t-shirt estimates (S/M/L/XL), never story points. Create one epic and " +
      "hang stories off it via `parent_ref` when the work is more than ~3 " +
      "tickets. Ground every ticket in the source document — do not invent " +
      "scope that isn't there.",
    modes: ["agent"],
    input_schema: {
      type: "object",
      properties: {
        document_id: {
          type: "string",
          description: "Source document these tickets come from, if any",
        },
        tickets: {
          type: "array",
          items: {
            type: "object",
            properties: {
              ref: {
                type: "string",
                description:
                  "Short local id, e.g. 'epic1' — referenced by parent_ref",
              },
              type: { type: "string", enum: ["epic", "story", "bug", "task"] },
              title: { type: "string" },
              description: { type: "string" },
              acceptance_criteria: {
                type: "array",
                items: { type: "string" },
                description: "Given/When/Then statements",
              },
              estimate: { type: "string", enum: ["S", "M", "L", "XL"] },
              labels: { type: "array", items: { type: "string" } },
              parent_ref: {
                type: "string",
                description: "`ref` of the parent epic, if this is a child",
              },
            },
            required: ["ref", "type", "title", "description"],
          },
        },
      },
      required: ["tickets"],
    },
    label: (i) =>
      `Drafting ${Array.isArray(i.tickets) ? i.tickets.length : 0} tickets`,
    async run(input, ctx) {
      const raw = Array.isArray(input.tickets)
        ? (input.tickets as Record<string, unknown>[])
        : [];
      if (!raw.length) throw new Error("`tickets` must contain at least one ticket.");

      // Map the model's local refs onto generated ids so parents resolve.
      const idByRef = new Map<string, string>();
      for (const t of raw) idByRef.set(s(t.ref), `tkt_${nanoid(8)}`);

      const tickets: DraftTicket[] = raw.map((t) => ({
        id: idByRef.get(s(t.ref)) ?? `tkt_${nanoid(8)}`,
        type: (s(t.type, "story") as DraftTicket["type"]) ?? "story",
        title: s(t.title, "Untitled ticket"),
        description: s(t.description),
        acceptanceCriteria: Array.isArray(t.acceptance_criteria)
          ? (t.acceptance_criteria as unknown[]).map((a) => s(a)).filter(Boolean)
          : [],
        estimate: t.estimate ? s(t.estimate) : null,
        labels: Array.isArray(t.labels)
          ? (t.labels as unknown[]).map((l) => s(l)).filter(Boolean)
          : [],
        parentId: t.parent_ref ? (idByRef.get(s(t.parent_ref)) ?? null) : null,
        externalKey: null,
      }));

      const batch = await repo.createTicketBatch({
        workspaceId: ctx.workspaceId,
        documentId: input.document_id ? s(input.document_id) : null,
        threadId: ctx.threadId,
        tickets,
      });
      ctx.emit({ type: "tickets", batch });

      const epics = tickets.filter((t) => t.type === "epic").length;
      return {
        summary: `${tickets.length} tickets${epics ? ` · ${epics} epic${epics === 1 ? "" : "s"}` : ""}`,
        result: {
          batchId: batch.id,
          count: tickets.length,
          note:
            "The batch is open in the PM's review panel. Do not list the " +
            "tickets again in your reply — summarise the shape of the " +
            "breakdown and flag anything you were unsure about.",
        },
      };
    },
  },

  {
    name: "generate_status_report",
    description:
      "Gather what actually happened in the workspace over a period — documents " +
      "touched, AI changes accepted or rejected, tickets drafted and pushed, " +
      "comments raised — so a status report can be written from evidence " +
      "rather than memory.\n\n" +
      "This returns raw activity, not prose. Read it, then write the report " +
      "yourself with `create_document` and organise it by what shipped, " +
      "what's in flight, what's blocked, and what needs a decision. Do not " +
      "simply list the events back.",
    modes: ["agent", "plan"],
    input_schema: {
      type: "object",
      properties: {
        days: {
          type: "integer",
          description: "How many days back to cover (default 7, max 90)",
        },
      },
    },
    label: (i) => `Gathering ${Number(i.days) || 7}d of activity`,
    async run(input, ctx) {
      const days = Math.min(Math.max(Number(input.days) || 7, 1), 90);
      const since = new Date(Date.now() - days * 86400000).toISOString();

      const [documents, audit, batches, comments] = await Promise.all([
        repo.listDocuments(ctx.workspaceId),
        repo.listAudit(ctx.workspaceId, 300),
        repo.listTicketBatches(ctx.workspaceId),
        repo.listAllComments(ctx.workspaceId),
      ]);

      const inWindow = audit.filter((a) => a.createdAt >= since);
      const touched = documents
        .filter((d) => d.updatedAt >= since && d.kind !== "memory")
        .map((d) => ({
          id: d.id,
          title: d.title,
          kind: d.kind,
          status: d.status,
          updatedAt: d.updatedAt,
        }));

      const count = (prefix: string) =>
        inWindow.filter((a) => a.action.startsWith(prefix)).length;

      return {
        summary: `${inWindow.length} events · ${touched.length} docs`,
        result: {
          period: { days, since },
          documentsTouched: touched,
          // Status distribution across the whole workspace gives the report
          // somewhere to anchor "what's in flight" against.
          statusBreakdown: documents.reduce<Record<string, number>>((acc, d) => {
            if (d.kind === "memory") return acc;
            acc[d.status] = (acc[d.status] ?? 0) + 1;
            return acc;
          }, {}),
          activity: {
            changesProposed: count("change.proposed"),
            changesAccepted: count("change.accepted"),
            changesRejected: count("change.rejected"),
            documentsCreated: count("document.created"),
            sourcesAdded: count("source.added"),
            ticketsPushed: count("tickets.pushed"),
          },
          ticketBatches: batches
            .filter((b) => b.createdAt >= since)
            .map((b) => ({
              id: b.id,
              status: b.status,
              provider: b.provider,
              count: b.tickets.length,
              titles: b.tickets.slice(0, 8).map((t) => t.title),
            })),
          openQuestions: comments.slice(0, 20).map((c) => ({
            documentId: c.documentId,
            body: c.body.slice(0, 240),
            anchor: c.anchorText.slice(0, 160),
          })),
          events: inWindow.slice(0, 60).map((a) => ({
            actor: a.actorName,
            action: a.action,
            target: a.target,
            at: a.createdAt,
          })),
        },
      };
    },
  },

  {
    name: "remember",
    description:
      "Append a durable fact to Product Memory — the context injected into " +
      "every future request in this workspace.\n\n" +
      "Use this for decisions, guardrails, vocabulary, and strategy that " +
      "should outlive this conversation. Do NOT use it for transient state, " +
      "task status, or anything already written in a document. Keep entries " +
      "to one or two lines. This is the workspace's most valuable file — " +
      "adding noise to it degrades every future answer.",
    modes: ["agent"],
    input_schema: {
      type: "object",
      properties: {
        section: {
          type: "string",
          description:
            "Existing `##` heading to append under, e.g. 'Guardrails'. " +
            "A new section is created if it doesn't exist.",
        },
        fact: {
          type: "string",
          description: "The durable fact, as one or two lines of markdown",
        },
      },
      required: ["section", "fact"],
    },
    label: (i) => `Remembering: ${s(i.fact).slice(0, 44)}…`,
    async run(input, ctx) {
      const docs = await repo.listDocuments(ctx.workspaceId);
      const memory = docs.find((d) => d.kind === "memory");
      if (!memory) throw new Error("This workspace has no Product Memory document.");

      const section = s(input.section, "Notes").replace(/^#+\s*/, "").trim();
      const fact = s(input.fact).trim();
      if (!fact) throw new Error("`fact` must not be empty.");

      const bullet = fact.startsWith("-") ? fact : `- ${fact}`;
      const heading = `## ${section}`;
      let content = memory.content;

      const at = content.indexOf(heading);
      if (at === -1) {
        content = `${content.replace(/\s+$/, "")}\n\n${heading}\n\n${bullet}\n`;
      } else {
        // Insert at the end of the section, before the next `## ` heading.
        const rest = content.slice(at + heading.length);
        const nextRel = rest.search(/\n## /);
        const end = nextRel === -1 ? content.length : at + heading.length + nextRel;
        content = `${content.slice(0, end).replace(/\s+$/, "")}\n${bullet}\n${content.slice(end)}`;
      }

      const change = await repo.createChange({
        workspaceId: ctx.workspaceId,
        documentId: memory.id,
        threadId: ctx.threadId,
        before: memory.content,
        after: content,
        summary: `Remember: ${fact.slice(0, 70)}${fact.length > 70 ? "…" : ""}`,
      });
      ctx.emit({ type: "change", change });

      return {
        summary: `Queued for “${section}”`,
        result: {
          changeId: change.id,
          note:
            "Memory changes are reviewed like any other edit — the PM must " +
            "accept the diff before it takes effect.",
        },
      };
    },
  },
];

export const toolsForMode = (mode: AgentMode): ToolSpec[] =>
  TOOLS.filter((t) => t.modes.includes(mode));

export const findTool = (name: string): ToolSpec | undefined =>
  TOOLS.find((t) => t.name === name);
