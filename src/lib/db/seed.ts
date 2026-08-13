import type { Client } from "@libsql/client";
import { parseCsv } from "@/lib/csv";

/**
 * Demo workspace: "Meridian", a B2B product-analytics company.
 *
 * The content is deliberately opinionated and interconnected — the churn
 * research references the same accounts as the support export, which
 * references the same bugs as the Linear dump. That's what lets the agent
 * produce answers that look like real synthesis instead of summarisation.
 */

const WS = "ws_meridian";
const U_OWNER = "usr_aayush";
const U_PRIYA = "usr_priya";
const U_DAN = "usr_dan";
const U_MEI = "usr_mei";
const U_TOMAS = "usr_tomas";

const iso = (daysAgo: number, hour = 10) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

/* ------------------------------------------------------------------ */
/* Product memory — the `.cursorrules` equivalent                      */
/* ------------------------------------------------------------------ */

const PRODUCT_MEMORY = `# Product Memory

Persistent context injected into every agent request. Keep it short and true —
this is the highest-leverage file in the workspace.

## Product

**Meridian** is a product-analytics platform for B2B SaaS teams. Customers
instrument their app, then build funnels, retention curves, and cohort reports
without writing SQL.

- **ICP:** Series B–D B2B SaaS, 50–500 employees, 3–15 person product team.
- **Buyer:** VP Product or Head of Growth. **User:** PM, PMM, growth engineer.
- **Pricing:** seat-based, $60/editor/mo, viewers free. Enterprise adds SSO/SCIM.
- **Competitors:** Amplitude (incumbent, expensive), Mixpanel (mid-market),
  PostHog (developer-first, self-host).

## Current strategy (H2 2026)

North Star: **weekly querying users** (WQU) — people who run ≥1 report a week.
Currently 4,120, target 6,500 by Dec 31.

The bet: our retention problem is **not** feature gaps, it's **time-to-first-
insight**. New users take a median 4.2 days to build their first useful report.
Everything on the roadmap should shorten that or protect it.

## Guardrails

- Do not propose features requiring customers to re-instrument. Migration cost
  killed the 2025 schema redesign.
- Enterprise deals stall on SSO/SCIM. Treat as revenue-blocking, not a feature.
- We do not build dashboards-as-a-product. We lost that fight to Looker.

## Conventions

- PRDs follow: Problem → Evidence → Non-goals → Solution → Success metrics →
  Rollout → Open questions.
- Every claim in a PRD cites a source (interview, ticket, or metric). No
  "customers have told us" without a link.
- Tickets need acceptance criteria written as Given/When/Then.
- Estimates in t-shirt sizes (S/M/L/XL), never story points.

## Vocabulary

- **Report** — a saved query. **View** — a report + filter state.
- **Workspace** — customer tenant. Never call it "org" or "account" in UI copy.
- **Activation** — user runs 3 reports in their first 14 days.
`;

/* ------------------------------------------------------------------ */
/* Documents                                                           */
/* ------------------------------------------------------------------ */

const PRD_SAVED_VIEWS = `# PRD: Saved Views & Shared Dashboards

**Status:** In review · **Owner:** Priya Raman · **Target:** Q4 2026
**Eng lead:** Dan Whitfield · **Design:** Mei Lin

## Problem

Users rebuild the same report every week. Meridian has no concept of a saved
filter state, so a PM checking "activation by plan tier, last 30 days" must
reconstruct six filters each Monday. The work is not hard, it is *repetitive* —
which is worse, because it makes the product feel like a chore.

This is the single most-requested capability in our backlog and it maps
directly to the H2 North Star: people who can't re-open last week's analysis
don't come back weekly.

## Evidence

- **11 of 14** customer interviews in the Q3 round raised it unprompted.
  See *Interview — Northwind (Sarah Chen)* and *Interview — Voltaic (Marcus Webb)*.
- **187 support tickets** tagged \`saved-views\` in the last 90 days — the
  largest single tag by 3x. See *Support export — Q3 feature requests*.
- Users who run the same report shape 3+ weeks running retain at **71%**;
  everyone else retains at **34%**. See *PostHog snapshot — retention by
  behaviour*.
- Amplitude and Mixpanel both ship this. It shows up in **every** competitive
  loss review where analysis depth was cited.

## Non-goals

- Not building a dashboard *builder* with drag-and-drop layout. We lost that
  fight to Looker and the guardrail stands.
- Not shipping scheduled email digests in v1. Adjacent, separately valuable,
  separately scoped.
- Not supporting cross-workspace sharing. Enterprise tenancy work blocks it.

## Solution

Three pieces, shippable independently:

### 1. Saved views
Any report + its filter state can be named and saved. Views live in the left
nav under the report they derive from. Personal by default.

### 2. Shared collections
A named group of views, shareable to the workspace with \`viewer\` or \`editor\`
permission. Collections are the unit of sharing — not individual views — so
permission logic stays one level deep.

### 3. Home surface
Replace the current empty home screen with the user's most-recently-viewed
collection. This is the actual retention mechanism: the product opens onto
your work instead of onto a blank state.

## Success metrics

| Metric | Baseline | Target (90d post-GA) |
| --- | --- | --- |
| Weekly querying users (WQU) | 4,120 | 5,200 |
| % of WQU with ≥1 saved view | 0% | 60% |
| Median time-to-first-insight | 4.2 days | 2.5 days |
| \`saved-views\` support tickets / mo | 62 | < 10 |

Counter-metric: report creation must not fall. If people only re-open saved
views and stop exploring, we've traded activation for engagement theatre.

## Rollout

1. Internal dogfood — week 1
2. 10 design partners behind a flag — weeks 2–3
3. 25% rollout, watch counter-metric — week 4
4. GA + changelog + in-app announcement — week 6

## Open questions

- Do collections need folders, or is flat + search enough for v1? Flat is my
  bias; revisit if design partners push back.
- What happens to a shared view when the underlying report is deleted? Leaning
  toward soft-delete with a tombstone rather than cascading.
- Does \`viewer\` on a collection imply access to the underlying raw events?
  **This is a security question and needs Dan's sign-off before build.**
`;

const PRD_SSO = `# PRD: SSO & SCIM for Enterprise

**Status:** Draft · **Owner:** Aayush Sharma · **Target:** Q4 2026

## Problem

Enterprise deals stall at security review. We support email/password and Google
OAuth only. Every deal above ~$50k ARR has asked for SAML SSO, and three have
asked for SCIM provisioning to deprovision leavers automatically.

Per the product memory guardrail, this is revenue-blocking, not a feature.

## Evidence

- **$680k** in pipeline currently marked \`blocked: security-review\`. Four
  accounts: Cardinal Health Systems, Vertex Labs, Orbital, Grayson Partners.
- Two closed-lost reviews in Q3 cite SSO explicitly as the deciding factor.
- Our SOC 2 Type II auditor flagged manual deprovisioning as a finding.

## Non-goals

- Not building our own identity provider.
- Not supporting SAML for self-serve plans — this gates the Enterprise tier.
- Not doing SCIM group→role mapping in v1. Provisioning and deprovisioning
  only; role assignment stays manual.

## Solution

- SAML 2.0 via WorkOS. Buy, don't build — the long tail of IdP quirks is not
  a place to spend engineering quarters.
- SCIM 2.0 user provisioning and deprovisioning.
- Enforce-SSO toggle at the workspace level: once on, password login is
  disabled for all members except break-glass owners.
- Audit log entries for every auth event.

## Success metrics

| Metric | Baseline | Target |
| --- | --- | --- |
| Pipeline blocked on security review | $680k | $0 |
| Enterprise deals closed / quarter | 2 | 5 |
| Manual deprovisioning tickets | 8/mo | 0 |

## Rollout

Design partner first (Cardinal), then GA to Enterprise tier.

## Open questions

- WorkOS vs Auth0 pricing at our seat count — needs a real quote, not list price.
- Do we backfill audit-log entries for existing workspaces or start clean?
`;

const ONEPAGER = `# One-pager: Cut time-to-first-insight in half

**Author:** Aayush Sharma · **Date:** ${iso(12).slice(0, 10)}

## The claim

Our retention problem is an onboarding problem wearing a costume.

We keep reading churn as a feature-gap signal and responding with more
capability. The data says otherwise: churned accounts had **fewer** feature
touches, not more — they never got to a first useful answer at all.

## The number

Median time-to-first-insight (TTFI) is **4.2 days**. Accounts that cross the
activation bar (3 reports in 14 days) retain at **71%**. Accounts that don't
retain at **34%**. TTFI is the strongest single predictor we have.

## Why it's slow

From session replays and the Q3 interview round, the 4.2 days breaks down as:

1. **Instrumentation ambiguity** (~2 days) — users don't know whether their
   events are flowing, so they wait and re-check.
2. **Blank canvas** (~1 day) — first report requires choosing an event, a
   breakdown, and a window with no defaults and no examples.
3. **No path back** (~1 day) — an interrupted user restarts from zero because
   nothing was saved. This is the *Saved Views* problem again.

## The three bets

| Bet | Attacks | Size | Owner |
| --- | --- | --- | --- |
| Live event debugger | Instrumentation ambiguity | M | Dan |
| Templated starter reports | Blank canvas | S | Priya |
| Saved views + home surface | No path back | L | Priya |

## What I'd cut to fund it

The custom-formula editor. It's requested loudly by six power users at two
accounts and moves no metric we care about this half.
`;

const RESEARCH_CHURN = `# Research: Q3 Churn Deep Dive

**Method:** 14 interviews (7 churned, 7 retained) + cohort analysis over
2,340 workspaces. Conducted by Priya Raman and Tomas Alvarez, Q3 2026.

## Headline

Churn is not driven by missing features. It's driven by **never reaching a
first useful answer**. Churned accounts averaged 1.3 reports created in their
first 30 days; retained accounts averaged 11.7.

## Finding 1 — Activation is the fork in the road

Accounts crossing the activation bar (3 reports in 14 days) retain at 71% at
day 90. Accounts that don't retain at 34%. The gap opens in week 2 and never
closes. No later intervention we've tried has moved a non-activated account.

## Finding 2 — Instrumentation anxiety dominates week one

> "I sent events for two days and had no idea if any of it was landing. I
> wasn't stuck on your product, I was stuck on whether to trust it."
> — Marcus Webb, Voltaic (churned)

Six of seven churned accounts described the same loop: send events, can't
confirm receipt, wait, re-check, lose momentum.

## Finding 3 — Repetition drives the retained cohort away too

Even retained users complain. The difference is they push through.

> "Every Monday I rebuild the same six filters. I've thought about writing a
> script to click through it. That's a bad sign for an analytics product."
> — Sarah Chen, Northwind (retained, expanding)

## Finding 4 — The people who churn are not the people who evaluate

In 5 of 7 churned accounts the buyer never became a user. The champion left or
got reassigned, and nobody else had a saved artifact to inherit. **Shared
collections are a continuity mechanism, not just a convenience.**

## Recommendations

1. Ship a live event debugger. Attacks Finding 2 directly, size M.
2. Ship saved views + shared collections. Attacks Findings 3 and 4, size L.
3. Add templated starter reports. Attacks the blank canvas, size S.
4. Instrument TTFI as a first-class metric on the exec dashboard. We can't
   manage it while it lives in an ad-hoc query.

## What we got wrong last time

The 2025 roadmap treated churn as a feature-parity problem and shipped four
Amplitude-matching features. None moved retention. We should stop reading
competitive gaps as churn causes without evidence linking the two.
`;

const ROADMAP = `# H2 2026 Roadmap

North Star: **weekly querying users** 4,120 → 6,500 by Dec 31.

Everything here shortens time-to-first-insight or protects it. If a proposal
doesn't do one of those, it isn't on this list.

## Now — in build

| Item | Size | Owner | Attacks |
| --- | --- | --- | --- |
| Saved views + shared collections | L | Priya | TTFI · continuity |
| Live event debugger | M | Dan | Instrumentation anxiety |
| SSO + SCIM | M | Aayush | Revenue blocker |

## Next — committed, not started

| Item | Size | Owner | Attacks |
| --- | --- | --- | --- |
| Templated starter reports | S | Priya | Blank canvas |
| Home surface (last collection) | S | Mei | Path back |
| Scheduled digests | M | — | Weekly habit |

## Later — believed, unproven

- Anomaly alerts on saved views
- Warehouse sync (Snowflake / BigQuery)
- Mobile read-only app

## Not doing, and why

- **Drag-and-drop dashboard builder** — lost to Looker, guardrail stands.
- **Custom formula editor** — six power users, zero metric movement. Cut to
  fund the TTFI bets.
- **Schema redesign** — requires re-instrumentation. Killed in 2025 for the
  same reason it would be killed now.
`;

/* ------------------------------------------------------------------ */
/* Sources                                                             */
/* ------------------------------------------------------------------ */

const SOURCES = [
  {
    id: "src_int_northwind",
    kind: "interview",
    title: "Interview — Northwind (Sarah Chen, Sr. PM)",
    origin: "Gong",
    captured: iso(38),
    meta: {
      account: "Northwind",
      arr: 84000,
      segment: "mid-market",
      status: "retained",
      sentiment: "positive",
    },
    content: `**Sarah Chen** — Senior PM, Northwind. Retained, expanding. 14 seats.

**On weekly workflow**
> "Every Monday I rebuild the same six filters: activation by plan tier, last
> 30 days, excluding internal. Six clicks, every week, forever. I've genuinely
> considered writing a Puppeteer script to do it. That's a bad sign for an
> analytics product."

**On what she'd pay more for**
> "Let me save it. That's it. That's the whole ask. I don't need it pretty, I
> need it to still be there on Monday."

**On sharing**
> "My VP asks for the retention number in every staff meeting. I screenshot it
> into Slack because there's no link I can send that survives. If I could send
> a link I'd stop being a human API."

**On competitors**
> "We evaluated Amplitude. It's better at this specific thing and worse at
> everything else. The saved-view gap is the one place your product feels
> unfinished rather than opinionated."

**Signal:** strong expansion candidate, blocked on collaboration primitives.`,
  },
  {
    id: "src_int_voltaic",
    kind: "interview",
    title: "Interview — Voltaic (Marcus Webb, Head of Growth)",
    origin: "Gong",
    captured: iso(41),
    meta: {
      account: "Voltaic",
      arr: 0,
      segment: "mid-market",
      status: "churned",
      sentiment: "negative",
    },
    content: `**Marcus Webb** — Head of Growth, Voltaic. Churned after 61 days.

**On the first week**
> "I sent events for two days and had no idea if any of it was landing. There's
> no console, no live feed, nothing that says 'we received 400 events in the
> last minute'. I wasn't stuck on your product, I was stuck on whether to trust
> it."

**On the blank canvas**
> "When I finally got in, the first screen asks me to pick an event, a
> breakdown, and a time window. I don't know what a good answer looks like yet.
> Give me five reports that are probably right and let me edit them."

**On why they left**
> "Honestly? We never got to a number we believed. We didn't leave for a
> competitor, we left for a spreadsheet."

**On what would have saved it**
> "Show me my data arriving in real time on day one. Everything else is
> downstream of trusting the pipe."

**Signal:** classic non-activated churn. Never crossed 3 reports.`,
  },
  {
    id: "src_int_cardinal",
    kind: "interview",
    title: "Interview — Cardinal Health Systems (Dana Okafor, Dir. Product Ops)",
    origin: "Zoom",
    captured: iso(19),
    meta: {
      account: "Cardinal Health Systems",
      arr: 0,
      pipeline: 240000,
      segment: "enterprise",
      status: "prospect",
      sentiment: "neutral",
    },
    content: `**Dana Okafor** — Director of Product Ops, Cardinal Health Systems.
Prospect, $240k pipeline, currently blocked in security review.

**On the blocker**
> "I want to buy this. My security team will not let me. We require SAML with
> our IdP and automated deprovisioning — when someone leaves on a Friday their
> access is gone on Friday, not whenever someone remembers."

**On timeline**
> "If you tell me SSO lands this quarter, I can hold the budget. If it's next
> year, I have to spend it elsewhere and re-open the conversation in twelve
> months."

**On SCIM specifically**
> "Provisioning is a nice-to-have. Deprovisioning is the requirement. That's
> the one that shows up in our audit."

**On everything else**
> "Product's great. Your competitor is worse and has SSO. That's the entire
> decision matrix right now, and it's embarrassing for both of us."

**Signal:** $240k, closeable on SSO+SCIM alone. Deprovisioning is the hard req.`,
  },
  {
    id: "src_feedback_q3",
    kind: "feedback",
    title: "Support export — Q3 feature requests (top tags)",
    origin: "Zendesk",
    captured: iso(7),
    meta: {
      window: "Q3 2026 (90 days)",
      totalTickets: 1104,
      format: "aggregated",
    },
    content: `Aggregated support requests, last 90 days. 1,104 tickets tagged.

| Tag | Tickets | Accounts | ARR touched | Median severity |
| --- | --- | --- | --- | --- |
| saved-views | 187 | 94 | $1.42M | High |
| event-debugging | 96 | 61 | $780k | High |
| sso-saml | 71 | 12 | $940k | Critical |
| export-csv | 64 | 48 | $410k | Low |
| slow-queries | 58 | 33 | $520k | High |
| scim-provisioning | 34 | 9 | $680k | Critical |
| custom-formulas | 22 | 6 | $190k | Medium |
| dark-mode | 19 | 17 | $120k | Low |
| mobile-app | 14 | 12 | $95k | Low |

**Notes from the support lead (Tomas Alvarez):**

- \`saved-views\` is the largest tag by 3x and has been #1 for four consecutive
  quarters. It is also the tag with the highest re-open rate — people ask, get
  told "not yet", and ask again.
- \`sso-saml\` and \`scim-provisioning\` come from only 12 and 9 accounts, but
  those accounts represent the top of the ARR distribution. Volume badly
  under-weights them.
- \`custom-formulas\` is 22 tickets from **6 accounts** — really 3 very vocal
  power users. We have historically over-weighted this because the requests are
  detailed and well-argued.
- \`slow-queries\` is rising and correlates with workspaces above 50M events/mo.
  Worth a separate performance investigation, not a roadmap item.`,
  },
  {
    id: "src_linear_bugs",
    kind: "ticket",
    title: "Linear — open bugs by user impact",
    origin: "Linear",
    captured: iso(2),
    meta: { project: "MER", openCount: 8, source: "linear-sync" },
    content: `Top open bugs, sorted by affected users (PostHog-joined).

| Key | Title | Affected users | Sev | Age |
| --- | --- | --- | --- | --- |
| MER-2841 | Filter state lost on browser back | 1,240 | P1 | 23d |
| MER-2903 | Retention chart off-by-one on week boundary | 890 | P1 | 11d |
| MER-2755 | CSV export truncates at 10k rows silently | 610 | P2 | 44d |
| MER-2917 | Event debugger websocket drops after 60s | 430 | P2 | 6d |
| MER-2888 | Cohort breakdown mislabels "other" bucket | 380 | P2 | 17d |
| MER-2799 | Timezone offset wrong for UTC+13 (NZDT) | 95 | P3 | 31d |
| MER-2934 | Invite email lands in spam for Outlook tenants | 74 | P2 | 3d |
| MER-2861 | Dark mode contrast fails WCAG AA on charts | 51 | P3 | 27d |

**MER-2841 note:** this is the highest-impact open bug and it is *the same
problem* as the saved-views gap — users lose filter state and have to rebuild.
Fixing the bug patches a symptom; saved views removes the class.

**MER-2755 note:** silent truncation is a correctness bug, not a limits bug.
Users have made decisions on truncated exports. Should be P1.`,
  },
  {
    id: "src_posthog",
    kind: "metric",
    title: "PostHog snapshot — activation & retention by behaviour",
    origin: "PostHog",
    captured: iso(3),
    meta: { window: "trailing 90 days", workspaces: 2340 },
    content: `Trailing 90 days, 2,340 workspaces.

## Funnel — first 14 days

| Step | Users | Conversion |
| --- | --- | --- |
| Signed up | 8,420 | — |
| Sent first event | 5,180 | 61.5% |
| Confirmed events flowing | 3,940 | 76.1% |
| Built 1st report | 3,110 | 78.9% |
| Built 3rd report (activated) | 1,690 | 54.3% |

**Biggest drop:** signup → first event (38.5% loss), then 3rd report (45.7%
loss). The middle of the funnel is healthy; the ends are not.

## Retention at day 90, by behaviour

| Cohort | n | D90 retention |
| --- | --- | --- |
| Activated (3+ reports in 14d) | 1,690 | 71% |
| Not activated | 1,420 | 34% |
| Ran same report shape 3+ weeks | 940 | 78% |
| Ran reports but never repeated a shape | 750 | 41% |

## Time-to-first-insight

| Percentile | Days |
| --- | --- |
| p25 | 1.1 |
| p50 | 4.2 |
| p75 | 9.8 |
| p90 | 21.3 |

## Weekly querying users (North Star)

Current 4,120. Trailing 12 weeks: 3,860 → 3,910 → 3,980 → 3,940 → 4,010 →
4,060 → 4,030 → 4,090 → 4,110 → 4,080 → 4,140 → 4,120.

Essentially flat for a quarter. Growth is coming from new signups replacing
churned users, not from the base compounding.`,
  },
  {
    id: "src_competitor",
    kind: "competitor",
    title: "Competitive teardown — Amplitude, Mixpanel, PostHog",
    origin: "Research",
    captured: iso(25),
    meta: { author: "Priya Raman" },
    content: `## Where we lose

| Capability | Amplitude | Mixpanel | PostHog | Meridian |
| --- | --- | --- | --- | --- |
| Saved views / bookmarks | Yes | Yes | Yes | **No** |
| Shared collections | Yes | Yes | Partial | **No** |
| SAML SSO | Yes | Yes | Yes | **No** |
| SCIM | Yes | Yes | No | **No** |
| Live event debugger | Yes | Yes | Yes | **No** |
| Templated starter reports | Yes | Partial | Yes | **No** |
| Query speed p95 | 4.1s | 3.2s | 6.8s | **1.9s** |
| Time to instrument | ~2h | ~2h | ~1h | **~25m** |
| Price (10 editors) | $2,400/mo | $1,100/mo | $450/mo | **$600/mo** |

## Read

We win decisively on speed, setup time, and price. We lose on **table stakes
collaboration and enterprise auth** — not on analytical depth.

That's an encouraging shape: the gaps are well-understood, bounded engineering
work, not a research problem. But they're also the gaps buyers check first,
which is why we lose deals we should win.

## From loss reviews (Q3, n=9)

- 4 lost on SSO
- 3 lost on saved views / sharing
- 1 lost on price (enterprise procurement, unrelated)
- 1 lost to "do nothing"

Zero losses cited analytical capability or performance.`,
  },
];

/**
 * The raw ticket export behind the aggregated markdown summary. Seeded as real
 * CSV so `analyze_source` has something to pivot before the user uploads
 * anything — and so the numbers in the summary can actually be re-derived.
 */
const SUPPORT_CSV = `ticket,tag,severity,account,segment,arr,reopened
MER-8801,saved-views,High,Northwind,mid-market,84000,yes
MER-8802,saved-views,High,Acme Systems,mid-market,52000,yes
MER-8803,saved-views,Medium,Voltaic,mid-market,0,no
MER-8804,saved-views,High,Orbital,enterprise,96000,yes
MER-8805,saved-views,Medium,Grayson Partners,mid-market,31000,no
MER-8806,saved-views,High,Beacon Labs,smb,18000,no
MER-8807,saved-views,Low,Trellis,smb,9000,no
MER-8808,saved-views,High,Northwind,mid-market,84000,yes
MER-8809,sso-saml,Critical,Cardinal Health Systems,enterprise,240000,no
MER-8810,sso-saml,Critical,Vertex Labs,enterprise,180000,no
MER-8811,sso-saml,Critical,Orbital,enterprise,96000,no
MER-8812,sso-saml,High,Grayson Partners,mid-market,31000,no
MER-8813,scim-provisioning,Critical,Cardinal Health Systems,enterprise,240000,no
MER-8814,scim-provisioning,Critical,Vertex Labs,enterprise,180000,no
MER-8815,scim-provisioning,High,Orbital,enterprise,96000,no
MER-8816,event-debugging,High,Voltaic,mid-market,0,yes
MER-8817,event-debugging,High,Beacon Labs,smb,18000,no
MER-8818,event-debugging,Critical,Trellis,smb,9000,yes
MER-8819,event-debugging,High,Acme Systems,mid-market,52000,no
MER-8820,event-debugging,Medium,Northwind,mid-market,84000,no
MER-8821,slow-queries,High,Northwind,mid-market,84000,no
MER-8822,slow-queries,High,Cardinal Health Systems,enterprise,240000,no
MER-8823,slow-queries,Medium,Orbital,enterprise,96000,no
MER-8824,export-csv,Low,Trellis,smb,9000,no
MER-8825,export-csv,Low,Beacon Labs,smb,18000,no
MER-8826,export-csv,Medium,Acme Systems,mid-market,52000,no
MER-8827,export-csv,Low,Grayson Partners,mid-market,31000,no
MER-8828,custom-formulas,Medium,Grayson Partners,mid-market,31000,no
MER-8829,custom-formulas,Medium,Grayson Partners,mid-market,31000,yes
MER-8830,custom-formulas,Low,Vertex Labs,enterprise,180000,no
MER-8831,dark-mode,Low,Trellis,smb,9000,no
MER-8832,dark-mode,Low,Beacon Labs,smb,18000,no
MER-8833,mobile-app,Low,Voltaic,mid-market,0,no
MER-8834,saved-views,High,Cardinal Health Systems,enterprise,240000,yes
MER-8835,saved-views,Medium,Vertex Labs,enterprise,180000,no
MER-8836,event-debugging,High,Orbital,enterprise,96000,no
MER-8837,sso-saml,Critical,Meridian Prospect A,enterprise,120000,no
MER-8838,slow-queries,High,Acme Systems,mid-market,52000,yes
MER-8839,saved-views,High,Trellis,smb,9000,no
MER-8840,scim-provisioning,Critical,Grayson Partners,mid-market,31000,no
`;

/* ------------------------------------------------------------------ */

export async function seedIfEmpty(client: Client, fts: boolean) {
  const existing = await client.execute("SELECT COUNT(*) AS n FROM workspaces");
  if (Number(existing.rows[0]?.n ?? 0) > 0) return;

  const stmts: { sql: string; args: unknown[] }[] = [];
  const push = (sql: string, args: unknown[] = []) => stmts.push({ sql, args });

  push(
    `INSERT INTO workspaces (id, slug, name, plan, seats, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [WS, "meridian", "Meridian", "team", 12, iso(180)],
  );

  const users: [string, string, string, number, string, number][] = [
    // Demo addresses only — all on the fictional meridian.dev domain, so
    // nothing real is published with the seed.
    [U_OWNER, "aayush@meridian.dev", "Aayush Sharma", 262, "owner", 180],
    [U_PRIYA, "priya@meridian.dev", "Priya Raman", 12, "admin", 172],
    [U_DAN, "dan@meridian.dev", "Dan Whitfield", 158, "editor", 165],
    [U_MEI, "mei@meridian.dev", "Mei Lin", 320, "editor", 140],
    [U_TOMAS, "tomas@meridian.dev", "Tomas Alvarez", 40, "viewer", 96],
  ];
  for (const [id, email, name, hue, role, joined] of users) {
    push(
      `INSERT INTO users (id, email, name, avatar_hue) VALUES (?, ?, ?, ?)`,
      [id, email, name, hue],
    );
    push(
      `INSERT INTO memberships (workspace_id, user_id, role, joined_at, last_active_at)
       VALUES (?, ?, ?, ?, ?)`,
      [WS, id, role, iso(joined), iso(Math.floor(Math.random() * 3))],
    );
  }

  const folders: [string, string, number][] = [
    ["fld_specs", "Specs", 0],
    ["fld_discovery", "Discovery", 1],
    ["fld_planning", "Planning", 2],
  ];
  for (const [id, name, order] of folders) {
    push(
      `INSERT INTO folders (id, workspace_id, parent_id, name, sort_order)
       VALUES (?, ?, NULL, ?, ?)`,
      [id, WS, name, order],
    );
  }

  const docs: [string, string | null, string, string, string, string, number][] =
    [
      ["doc_memory", null, "memory", "Product Memory", PRODUCT_MEMORY, U_OWNER, 90],
      ["doc_saved_views", "fld_specs", "prd", "PRD — Saved Views & Shared Dashboards", PRD_SAVED_VIEWS, U_PRIYA, 4],
      ["doc_sso", "fld_specs", "prd", "PRD — SSO & SCIM for Enterprise", PRD_SSO, U_OWNER, 9],
      ["doc_ttfi", "fld_specs", "onepager", "One-pager — Cut time-to-first-insight", ONEPAGER, U_OWNER, 12],
      ["doc_churn", "fld_discovery", "research", "Research — Q3 Churn Deep Dive", RESEARCH_CHURN, U_PRIYA, 30],
      ["doc_roadmap", "fld_planning", "roadmap", "H2 2026 Roadmap", ROADMAP, U_OWNER, 6],
    ];
  const statusFor: Record<string, string> = {
    doc_saved_views: "in_review",
    doc_sso: "draft",
    doc_ttfi: "approved",
    doc_churn: "approved",
    doc_roadmap: "approved",
    doc_memory: "approved",
  };
  for (const [id, folder, kind, title, content, by, age] of docs) {
    push(
      `INSERT INTO documents
         (id, workspace_id, folder_id, kind, title, content, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, WS, folder, kind, title, content, statusFor[id] ?? "draft", by, iso(age + 20), iso(age)],
    );
    if (fts) {
      push(
        `INSERT INTO search_index (entity_id, workspace_id, entity_type, title, body)
         VALUES (?, ?, 'document', ?, ?)`,
        [id, WS, title, content],
      );
    }
  }

  // Derive the CSV's metadata with the same parser the upload route uses, so
  // seeded and uploaded tabular sources are indistinguishable downstream.
  const csvParsed = parseCsv(SUPPORT_CSV);
  const allSources = [
    ...SOURCES,
    {
      id: "src_support_csv",
      kind: "feedback",
      title: "Support export — raw tickets (CSV)",
      origin: "Zendesk",
      captured: iso(6),
      meta: {
        format: "table",
        delimiter: csvParsed.delimiter,
        rowCount: csvParsed.rows.length,
        columns: csvParsed.columns,
        filename: "support-q3.csv",
      },
      content: SUPPORT_CSV,
    },
  ];

  for (const s of allSources) {
    push(
      `INSERT INTO sources (id, workspace_id, kind, title, origin, content, meta, captured_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [s.id, WS, s.kind, s.title, s.origin, s.content, JSON.stringify(s.meta), s.captured],
    );
    if (fts) {
      push(
        `INSERT INTO search_index (entity_id, workspace_id, entity_type, title, body)
         VALUES (?, ?, 'source', ?, ?)`,
        [s.id, WS, s.title, s.content],
      );
    }
  }

  const integrations: [string, string, string | null, object, string | null][] = [
    ["linear", "connected", "meridian (MER)", { projectKey: "MER" }, null],
    ["posthog", "connected", "meridian-prod", { projectId: "41207" }, null],
    ["notion", "connected", "Meridian Product Wiki", { rootPage: "Product" }, null],
    ["jira", "degraded", "meridian.atlassian.net", { projectKey: "MER" }, "Token expires in 3 days — re-authenticate to avoid silent failures"],
    ["figma", "disconnected", null, {}, null],
    ["slack", "connected", "#product-meridian", { channel: "product-meridian" }, null],
  ];
  for (const [provider, status, label, config, err] of integrations) {
    push(
      `INSERT INTO integrations
         (id, workspace_id, provider, status, account_label, config, last_checked_at, last_error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [`int_${provider}`, WS, provider, status, label, JSON.stringify(config), iso(0, 9), err],
    );
  }

  const audits: [string, string, string, string, number][] = [
    [U_PRIYA, "document.updated", "PRD — Saved Views & Shared Dashboards", "{}", 4],
    [U_OWNER, "integration.connected", "linear", "{}", 11],
    [U_DAN, "change.accepted", "PRD — Saved Views & Shared Dashboards", "{}", 5],
    [U_OWNER, "member.invited", "tomas@meridian.dev", "{}", 96],
    [U_PRIYA, "tickets.pushed", "MER · 6 issues", "{}", 8],
    [U_OWNER, "memory.updated", "Product Memory", "{}", 14],
  ];
  const nameOf: Record<string, string> = {
    [U_OWNER]: "Aayush Sharma",
    [U_PRIYA]: "Priya Raman",
    [U_DAN]: "Dan Whitfield",
  };
  audits.forEach(([actor, action, target, meta, age], i) => {
    push(
      `INSERT INTO audit_log (id, workspace_id, actor_id, actor_name, action, target, meta, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [`aud_seed_${i}`, WS, actor, nameOf[actor] ?? "Member", action, target, meta, iso(age)],
    );
  });

  // 14 days of usage so the metering chart has a real shape.
  for (let d = 13; d >= 0; d--) {
    const day = iso(d).slice(0, 10);
    for (const [uid, scale] of [
      [U_OWNER, 1],
      [U_PRIYA, 0.8],
      [U_DAN, 0.35],
    ] as const) {
      const reqs = Math.round((6 + Math.random() * 14) * scale);
      if (reqs === 0) continue;
      push(
        `INSERT INTO usage_records
           (id, workspace_id, user_id, day, model, input_tokens, output_tokens, requests)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `use_${uid}_${day}`,
          WS,
          uid,
          day,
          "claude-opus-5",
          reqs * (2400 + Math.round(Math.random() * 1800)),
          reqs * (620 + Math.round(Math.random() * 500)),
          reqs,
        ],
      );
    }
  }

  push(
    `INSERT INTO api_keys (id, workspace_id, name, prefix, hash, created_by, created_at, last_used_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    ["key_ci", WS, "CI — nightly PRD lint", "prism_live_8f2a", "seeded", U_OWNER, iso(45), iso(1)],
  );

  await client.batch(
    stmts.map((s) => ({ sql: s.sql, args: s.args as never })),
    "write",
  );
}

export const DEMO = {
  workspaceId: WS,
  workspaceSlug: "meridian",
  userId: U_OWNER,
  memoryDocId: "doc_memory",
};
