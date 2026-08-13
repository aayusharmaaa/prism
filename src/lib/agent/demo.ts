import { findTool, type ToolContext } from "./tools";
import type { Citation, ToolInvocation } from "@/lib/types";
import type { RunOptions, RunResult } from "./runner";

/**
 * Demo agent used when ANTHROPIC_API_KEY is absent.
 *
 * The tool calls are real — it genuinely searches, reads, cites, edits, and
 * drafts against the live workspace, and every mutation lands in the review
 * queue exactly as the model's would. Only the prose is scripted. That keeps
 * the whole product demoable (and e2e-testable) with no key configured.
 */

interface Step {
  tool: string;
  input: Record<string, unknown>;
}

interface Scenario {
  match: RegExp;
  modes?: ReadonlyArray<string>;
  steps: Step[];
  reply: string;
}

/**
 * Ordered most-specific first: the first regex to match wins, so an explicit
 * "remember …" must be tested before the broader ticket/edit patterns it would
 * otherwise fall into.
 */
const SCENARIOS: Scenario[] = [
  {
    match: /\b(remember|memoris|memoriz|from now on|going forward|always do|as a rule)\b/i,
    steps: [
      { tool: "read_entity", input: { id: "doc_memory" } },
      {
        tool: "remember",
        input: {
          section: "Conventions",
          fact: "Ticket breakdowns ship with their instrumentation task in the same batch — rollout gates that depend on uninstrumented metrics can't be evaluated.",
        },
      },
    ],
    reply: `Added to Product Memory under **Conventions** — it's queued as a diff for you to accept.

I kept it to one line and phrased it as a rule rather than a description of what happened, so it stays useful when the context around it is forgotten. Memory entries are the highest-leverage text in the workspace and the fastest thing to pollute, so I'd rather add one tight line than three loose ones.

It'll be injected into every future request in this workspace once you accept it.`,
  },

  {
    match: /\b(status report|weekly update|standup|stand-up|what happened|progress update|digest)\b/i,
    steps: [
      { tool: "generate_status_report", input: { days: 7 } },
      {
        tool: "create_document",
        input: {
          title: "Status — week of review",
          kind: "note",
          content: `# Status — this week

**Owner:** Aayush Sharma · Generated from workspace activity

## Shipped

Nothing shipped to customers this week. Both in-flight items are still pre-build.

## In flight

| Item | State | Owner | Note |
| --- | --- | --- | --- |
| Saved Views & Shared Dashboards | PRD in review | Priya | Blocked on a permissions decision, see below |
| SSO & SCIM for Enterprise | PRD draft, evidence tightened | Aayush | Deprovisioning split out from provisioning |

## Decisions needed from someone else

1. **Does \`viewer\` on a collection imply access to the underlying raw events?**
   Raised on the Saved Views PRD and still open. This is a security question,
   it needs Dan, and the \`Shared collections\` estimate is soft until it's
   answered.
2. **Does the SSO target date survive contact with sales?** The PRD says Q4
   2026; Cardinal's budget holds only if it lands this quarter. Those may
   already be in conflict.

## Risks

- Three concurrent bets (saved views, event debugger, SSO) against a team this
  size means all three land late. Sequencing is not yet agreed.
- The H2 strategy rests on activation being *causal*. The 71% vs 34% split is
  correlational and nothing in the workspace tests it.

## What I'd flag to leadership

The enterprise-auth theme is split across two backlog tags (\`sso-saml\` and
\`scim-provisioning\`), which understates it. Treated as one item it is the
largest revenue exposure in the support data.
`,
        },
      },
    ],
    reply: `Pulled the week's activity and wrote it up — the report is open in a new tab.

I organised it by **shipped / in flight / decisions needed / risks** rather than by document, because nothing actually shipped this week and a list of documents-touched would have obscured that.

Two things I'd draw your attention to:

**The report is mostly "decisions needed", not "progress".** Both in-flight PRDs are blocked on questions owned by other people — the \`viewer\` permissions question needs Dan, and the SSO date needs sales. That's the real status, and a report organised by activity would have hidden it behind a healthy-looking list of edits.

**I did not claim anything shipped.** There's activity in the workspace — accepted diffs, a pushed ticket batch — but none of it reached customers. Status reports that count internal motion as progress are how a quarter disappears.

Worth checking before you send it: I inferred owners from the PRD headers, and the risk about three concurrent bets is my read of the roadmap rather than something anyone has said out loud.`,
  },

  {
    match: /\b(analy[sz]e|pivot|crosstab|cross-tab|matrix|csv|breakdown by|group by|spreadsheet)\b/i,
    steps: [
      { tool: "read_entity", input: { id: "src_support_csv" } },
      {
        tool: "analyze_source",
        input: {
          source_id: "src_support_csv",
          row_field: "tag",
          col_field: "severity",
        },
      },
      {
        tool: "analyze_source",
        input: {
          source_id: "src_support_csv",
          row_field: "tag",
          measure_field: "arr",
        },
      },
      {
        tool: "cite",
        input: {
          id: "src_posthog",
          excerpt:
            "Activated (3+ reports in 14d) | 1,690 | 71% … Not activated | 1,420 | 34%",
        },
      },
    ],
    reply: `Pivoted it by volume and by ARR. The ranking barely moves — but the *density* does, and that's where the finding is.

\`saved-views\` leads both: 11 of 40 tickets and ~$803k touched. It spans smb, mid-market and enterprise, and it accounts for 5 of the 9 re-opened tickets. It isn't a loud-minority artifact.

**The density matters more than the rank.** \`sso-saml\` reaches ~$667k across just 5 tickets — roughly $133k per ticket against saved-views' $73k. Enterprise accounts file *once* and expect an answer; smb accounts file repeatedly. Ticket counts systematically under-weight the accounts paying you the most.

**Treating \`sso-saml\` and \`scim-provisioning\` as separate tags hides the real number.** They're one theme — enterprise auth — raised by the same three accounts. Combined that's 9 tickets and the largest ARR exposure in the export, ahead of saved-views. Your tag taxonomy is splitting a single buying blocker into two backlog items.

**The quiet one:** \`event-debugging\` is 6 tickets and only ~$259k — the lowest ARR among the top five tags. But one of those came from Voltaic at **$0 ARR**: a trial that churned. Accounts that never convert contribute nothing to an ARR pivot precisely *because* they churned, so this ranking is blind to exactly the population the activation data says you're losing.

**Caveat on method, before this goes anywhere:** summing ARR per ticket double-counts. Cardinal appears in four rows, so its $240k is counted four times, and the $3.1M grand total is not real revenue. The ranking is directionally sound; the totals are not. A distinct-accounts-per-tag pivot would fix it.`,
  },

  {
    // "what should we build next", "prioritise", "roadmap"
    match: /priorit|what should we (build|do)|next quarter|roadmap|focus on/i,
    steps: [
      { tool: "search_workspace", input: { query: "retention activation churn saved views" } },
      { tool: "read_entity", input: { id: "src_posthog" } },
      { tool: "read_entity", input: { id: "src_feedback_q3" } },
      { tool: "read_entity", input: { id: "doc_churn" } },
      {
        tool: "cite",
        input: {
          id: "src_posthog",
          excerpt:
            "Activated (3+ reports in 14d) | 1,690 | 71% … Not activated | 1,420 | 34%",
        },
      },
      {
        tool: "cite",
        input: {
          id: "src_feedback_q3",
          excerpt:
            "saved-views | 187 | 94 | $1.42M | High — largest tag by 3x, #1 for four consecutive quarters",
        },
      },
    ],
    reply: `Three things are competing, and the evidence separates them more cleanly than the backlog suggests.

**Saved views is the right first bet, but not for the reason the backlog says.**

It's filed as a feature request — 187 tickets, largest tag by 3x, four quarters running. That framing undersells it. The retention data says users who repeat a report shape retain at 78% vs 41% for those who don't, and the churn research found that in 5 of 7 churned accounts the champion left with no saved artifact for anyone to inherit. Saved views isn't convenience, it's the continuity mechanism. \`MER-2841\` (filter state lost on back, 1,240 users) is the same problem showing up as a bug.

**SSO is smaller work and unblocks more revenue right now.**

$680k sits in \`blocked: security-review\` across four accounts. Cardinal alone is $240k and Dana Okafor said it plainly — the product's fine, the competitor is worse and has SSO. It's an M, it's bought not built (WorkOS), and it converts pipeline that already exists. **If you can only start one thing this month, start this one** — it finishes sooner and the saved-views work is an L that will slip regardless.

**The event debugger is the one I'd argue you're underrating.**

The funnel loses 38.5% between signup and first event — the single biggest drop, bigger than the activation gap everyone talks about. Marcus Webb's churn wasn't about features: *"I wasn't stuck on your product, I was stuck on whether to trust it."* An M-sized live event feed attacks the largest leak you have.

**Where I'd push back on the current plan**

The roadmap lists all three as "Now". Three concurrent bets across a team this size means all three land late. The sequencing I'd argue for is SSO (revenue, finishes fast) → event debugger (biggest funnel leak) → saved views (largest but highest ceiling).

One caveat worth naming: the 71% vs 34% activation split is correlational. Accounts that activate may simply have been better-fit accounts from day one. Nothing in the workspace tests that, and it's the assumption the entire H2 strategy rests on. Worth a holdout before you commit another quarter to it.`,
  },

  {
    match: /ticket|jira|linear|epic|stor(y|ies)|break.*down|groom/i,
    steps: [
      { tool: "read_entity", input: { id: "doc_saved_views" } },
      {
        tool: "draft_tickets",
        input: {
          document_id: "doc_saved_views",
          tickets: [
            {
              ref: "epic1",
              type: "epic",
              title: "Saved Views & Shared Collections",
              description:
                "Let users name and save a report's filter state, group views into shareable collections, and land on their most recent collection at home. Attacks time-to-first-insight and champion-departure churn.",
              acceptance_criteria: [
                "Given the epic is complete, when a user returns after a week, then their last-used collection is the first thing they see",
                "Given a workspace with shared collections, when the original author is deprovisioned, then their shared collections remain accessible to the workspace",
              ],
              estimate: "L",
              labels: ["retention", "h2-northstar"],
            },
            {
              ref: "s1",
              type: "story",
              title: "Persist and restore report filter state",
              description:
                "Serialise the full filter state of a report (event, breakdown, window, exclusions) so it can be stored and rehydrated exactly. Foundation for everything else in the epic, and fixes MER-2841 as a side effect.",
              acceptance_criteria: [
                "Given a report with 6 filters applied, when the user saves it, then reopening restores all 6 filters exactly",
                "Given a saved view, when the user presses browser back, then filter state is preserved rather than reset",
                "Given a filter state referencing a deleted event, when the view is opened, then a non-blocking warning names the missing event",
              ],
              estimate: "M",
              labels: ["backend"],
              parent_ref: "epic1",
            },
            {
              ref: "s2",
              type: "story",
              title: "Name and save a view from the report toolbar",
              description:
                "Primary create path. Saved views appear in the left nav nested under their parent report. Personal by default per the PRD.",
              acceptance_criteria: [
                "Given a report with unsaved filters, when the user clicks Save view and enters a name, then the view appears in the left nav under that report",
                "Given a name already used by that user, when they save, then they are asked to confirm overwrite or rename",
                "Given a saved view, when another workspace member loads the app, then they do not see it (personal by default)",
              ],
              estimate: "M",
              labels: ["frontend"],
              parent_ref: "epic1",
            },
            {
              ref: "s3",
              type: "story",
              title: "Shared collections with viewer/editor permission",
              description:
                "Collections are the unit of sharing, not individual views — keeps permission logic one level deep per the PRD's explicit design decision.",
              acceptance_criteria: [
                "Given a collection shared as viewer, when a member opens it, then they can run the views but cannot rename or remove them",
                "Given a collection shared as editor, when a member adds a view, then all members with access see it",
                "Given a collection's owner is deprovisioned, when a member opens it, then access is unchanged",
              ],
              estimate: "L",
              labels: ["permissions"],
              parent_ref: "epic1",
            },
            {
              ref: "s4",
              type: "story",
              title: "Home surface shows most-recent collection",
              description:
                "Replace the empty home screen with the user's last-viewed collection. This is the actual retention mechanism in the epic — the product opens onto your work instead of a blank state.",
              acceptance_criteria: [
                "Given a user with at least one collection, when they open the app, then their most-recently-viewed collection renders on home",
                "Given a user with no collections, when they open the app, then they see templated starter reports rather than an empty state",
              ],
              estimate: "S",
              labels: ["frontend", "activation"],
              parent_ref: "epic1",
            },
            {
              ref: "s5",
              type: "task",
              title: "Instrument saved-view funnel and counter-metric",
              description:
                "The PRD names a counter-metric — report creation must not fall. Without instrumentation shipped alongside, the rollout gates in the PRD can't be evaluated.",
              acceptance_criteria: [
                "Given the feature is behind a flag, when a user saves or opens a view, then view_saved and view_opened events fire with collection context",
                "Given the 25% rollout stage, when the team checks the dashboard, then report-creation rate is broken out by exposed vs control",
              ],
              estimate: "S",
              labels: ["analytics"],
              parent_ref: "epic1",
            },
          ],
        },
      },
    ],
    reply: `Six tickets — one epic, four stories, one instrumentation task. They're in the review panel to edit or push.

The shape follows the PRD's three pieces, with two deliberate departures:

**\`Persist and restore report filter state\` comes first and absorbs MER-2841.** The PRD treats the lost-filter-state bug as separate, but it's the same serialisation work. Fixing it inside this story is nearly free; fixing it separately means doing the work twice.

**I added the instrumentation task, which the PRD implies but doesn't scope.** Your rollout plan gates at 25% on a counter-metric (report creation must not fall). That gate isn't checkable unless the events ship with the feature, and instrumentation added after a rollout starts is instrumentation you don't trust.

Two things I couldn't resolve from the PRD and left out rather than guess:

- **The open question about \`viewer\` implying raw event access is unanswered** and marked as needing Dan's sign-off. It changes the permission model in \`Shared collections\`, so that story's estimate is soft until it's settled.
- **Tombstone behaviour for deleted parent reports** is listed as leaning-toward, not decided. I wrote no criteria for it.

Estimates are t-shirt per your conventions. The epic reads L overall, and \`Shared collections\` is the one I'd expect to grow.`,
  },

  {
    match: /\b(edit|revise|rewrite|tighten|improve|add|update|fix|strengthen)\b/i,
    steps: [
      { tool: "read_entity", input: { id: "doc_sso" } },
      { tool: "read_entity", input: { id: "src_int_cardinal" } },
      {
        tool: "cite",
        input: {
          id: "src_int_cardinal",
          excerpt:
            "Provisioning is a nice-to-have. Deprovisioning is the requirement. That's the one that shows up in our audit.",
        },
      },
      {
        tool: "propose_edit",
        input: {
          document_id: "doc_sso",
          summary:
            "Ground the evidence section in the Cardinal interview and separate deprovisioning from provisioning",
          edits: [
            {
              find:
                "- **$680k** in pipeline currently marked `blocked: security-review`. Four\n  accounts: Cardinal Health Systems, Vertex Labs, Orbital, Grayson Partners.",
              replace:
                "- **$680k** in pipeline currently marked `blocked: security-review`. Four\n  accounts: Cardinal Health Systems ($240k), Vertex Labs, Orbital, Grayson\n  Partners.\n- Cardinal's Director of Product Ops is explicit that the two halves are not\n  equally urgent: *\"Provisioning is a nice-to-have. Deprovisioning is the\n  requirement. That's the one that shows up in our audit.\"* See *Interview —\n  Cardinal Health Systems*.\n- The same interview puts a clock on it: budget holds if SSO lands this\n  quarter, otherwise it moves and re-opens in twelve months.",
            },
            {
              find: "- SCIM 2.0 user provisioning and deprovisioning.",
              replace:
                "- SCIM 2.0 deprovisioning first, provisioning second. Deprovisioning is the\n  audit requirement; provisioning is convenience. Shipping them together\n  delays the part that actually unblocks deals.",
            },
          ],
        },
      },
    ],
    reply: `Proposed two edits to the SSO PRD — the diff is open in your editor.

**What changed**

The Evidence section asserted $680k across four accounts with no link to anything. It now carries Cardinal's $240k explicitly and quotes Dana Okafor directly, which matters because her framing contradicts how the Solution section was scoped.

**The substantive change is the second edit.** The PRD had "SCIM 2.0 user provisioning and deprovisioning" as one line. Cardinal's requirement is asymmetric — deprovisioning is what shows up in their audit, provisioning is a nice-to-have. Treating them as one deliverable means the audit-blocking half waits on the convenience half. I split them and put deprovisioning first.

**What I didn't touch**

The WorkOS-vs-Auth0 open question. That needs a real quote at your seat count, and there's nothing in the workspace to answer it from.

One thing worth flagging: the PRD's target is Q4 2026, but Cardinal's budget holds only if SSO lands *this* quarter. Those may already be in conflict — I'd confirm the date with sales before this goes to review.`,
  },

];

const FALLBACK: Scenario = {
  match: /.*/,
  steps: [
    { tool: "search_workspace", input: { query: "retention activation evidence" } },
    { tool: "read_entity", input: { id: "doc_churn" } },
  ],
  reply: `Searched the workspace and read the churn research to ground this.

**Running without an API key**, so this reply is scripted — but the tool calls above were real. The search hit your actual documents, and any edits or tickets a scenario proposes land in the review queue exactly as the live model's would.

To get real answers, drop a key in \`.env.local\`:

\`\`\`
ANTHROPIC_API_KEY=sk-ant-...
\`\`\`

and restart. Meanwhile these prompts exercise the full loop end to end:

| Try | Exercises |
| --- | --- |
| "What should we build next quarter?" | Multi-source synthesis with citations |
| "Break the saved views PRD into tickets" | \`draft_tickets\` → review panel → push |
| "Tighten the evidence in the SSO PRD" | \`propose_edit\` → diff → accept/reject |
| "Remember that we ship instrumentation with every batch" | \`remember\` → Product Memory diff |`,
};

/* ------------------------------------------------------------------ */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runDemoAgent(opts: RunOptions): Promise<RunResult> {
  const lastUser = [...opts.history].reverse().find((m) => m.role === "user");
  const prompt = lastUser?.content ?? "";

  const scenario =
    SCENARIOS.find(
      (sc) =>
        sc.match.test(prompt) &&
        // Mutating scenarios only make sense where the tools exist.
        sc.steps.every((st) => {
          const spec = findTool(st.tool);
          return spec ? spec.modes.includes(opts.mode) : false;
        }),
    ) ?? FALLBACK;

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

  for (const [i, step] of scenario.steps.entries()) {
    if (opts.signal?.aborted) break;
    const spec = findTool(step.tool);
    if (!spec || !spec.modes.includes(opts.mode)) continue;

    const invocation: ToolInvocation = {
      id: `demo_${Date.now()}_${i}`,
      name: spec.name,
      input: step.input,
      status: "running",
      summary: spec.label(step.input),
    };
    opts.emit({ type: "tool_start", tool: invocation });
    await sleep(240 + Math.random() * 260);

    const started = Date.now();
    try {
      const { summary, result } = await spec.run(step.input, ctx);
      const done: ToolInvocation = {
        ...invocation,
        status: "ok",
        summary,
        result,
        durationMs: Date.now() - started,
      };
      toolLog.push(done);
      opts.emit({ type: "tool_end", tool: done });
    } catch (err) {
      const done: ToolInvocation = {
        ...invocation,
        status: "error",
        summary: err instanceof Error ? err.message.slice(0, 160) : "Failed",
        durationMs: Date.now() - started,
      };
      toolLog.push(done);
      opts.emit({ type: "tool_end", tool: done });
    }
  }

  // Stream the prose in chunks so it feels like generation, not a paste.
  await sleep(200);
  const tokens = scenario.reply.match(/\S+\s*/g) ?? [];
  let sent = "";
  for (let i = 0; i < tokens.length; i += 3) {
    if (opts.signal?.aborted) break;
    const chunk = tokens.slice(i, i + 3).join("");
    sent += chunk;
    opts.emit({ type: "text", delta: chunk });
    await sleep(11);
  }

  const inputTokens = Math.round(prompt.length / 3.6) + 1800;
  const outputTokens = Math.round(sent.length / 3.6);
  opts.emit({ type: "usage", inputTokens, outputTokens });

  return { text: sent, tools: toolLog, citations, inputTokens, outputTokens };
}
