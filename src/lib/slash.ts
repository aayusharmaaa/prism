import type { AgentMode } from "@/lib/types";

/**
 * Slash commands: repeatable workflows as prompt templates.
 *
 * The brief calls out `/prd`-style commands as the way PMs turn a one-off
 * prompt into a routine. Expansion happens client-side — the model sees an
 * ordinary, fully-specified request, which keeps the prompt visible and
 * editable before sending rather than hiding it behind a macro.
 */
export interface SlashCommand {
  name: string;
  hint: string;
  /** Mode to switch to, since these workflows imply different permissions. */
  mode: AgentMode;
  /** `{{arg}}` is replaced with whatever the user typed after the command. */
  template: string;
  /** Shown as the placeholder for the argument. */
  argHint?: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: "prd",
    hint: "Draft a PRD grounded in workspace evidence",
    mode: "agent",
    argHint: "what it's about",
    template: `Draft a PRD for: {{arg}}

Before writing, search the workspace and read the relevant interviews, support data, and metrics. Follow the PRD structure in Product Memory (Problem → Evidence → Non-goals → Solution → Success metrics → Rollout → Open questions).

Every claim in Evidence must cite a real source — no "customers have told us" without a link. If the evidence for something is thin, say so in Open questions rather than padding it. Create it with create_document.`,
  },
  {
    name: "tickets",
    hint: "Break a document into tickets with acceptance criteria",
    mode: "agent",
    argHint: "which document",
    template: `Break {{arg}} into engineering tickets.

Read the document first. Write acceptance criteria as Given/When/Then and use t-shirt estimates per Product Memory. Create one epic with stories beneath it if the work is more than ~3 tickets. Do not invent scope that isn't in the document — flag anything ambiguous instead of guessing.`,
  },
  {
    name: "analyze",
    hint: "Pivot a tabular source into a matrix",
    mode: "ask",
    argHint: "what to analyse",
    template: `Analyse: {{arg}}

Use analyze_source on the relevant tabular source. Pivot it more than one way if the framings disagree — volume and revenue usually rank differently. State the method's limitations plainly, including any double-counting.`,
  },
  {
    name: "status",
    hint: "Weekly status report from workspace activity",
    mode: "agent",
    argHint: "period, e.g. this week",
    template: `Write a status report for {{arg}}.

Use generate_status_report. Organise by what shipped, what's in flight, what's blocked, and what needs a decision from someone else. Be specific about owners and dates. Flag risks honestly — a status report that reads as though everything is fine is not useful.`,
  },
  {
    name: "critique",
    hint: "Argue against a document",
    mode: "ask",
    argHint: "which document",
    template: `Read {{arg}} and argue against it.

Where is the evidence thin, the reasoning motivated, or the success metric gameable? What would have to be true for this to be the wrong call? Be specific and cite the workspace. If the document is actually sound, say so and name the one assumption most worth testing rather than manufacturing objections.`,
  },
  {
    name: "plan",
    hint: "Research, then write a plan",
    mode: "plan",
    argHint: "what to plan",
    template: `Plan: {{arg}}

Research the workspace thoroughly first, then write the plan as a document. Include what cuts against the plan, not just what supports it.`,
  },
];

/** Parses a leading `/command rest…`, if the text starts with one. */
export function parseSlash(
  text: string,
): { command: SlashCommand; arg: string } | null {
  const match = /^\/([a-z]+)(?:\s+([\s\S]*))?$/i.exec(text.trim());
  if (!match) return null;
  const command = SLASH_COMMANDS.find(
    (c) => c.name === match[1].toLowerCase(),
  );
  if (!command) return null;
  return { command, arg: (match[2] ?? "").trim() };
}

/** Commands whose name starts with the partial typed after `/`. */
export function matchSlash(partial: string): SlashCommand[] {
  const q = partial.toLowerCase();
  return SLASH_COMMANDS.filter((c) => c.name.startsWith(q));
}

export function expand(command: SlashCommand, arg: string): string {
  return command.template.replace(
    /\{\{arg\}\}/g,
    arg || "(the user did not specify — ask them what they mean before proceeding)",
  );
}
