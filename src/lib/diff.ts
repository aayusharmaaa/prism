import { diffLines, diffWordsWithSpace } from "diff";

/**
 * Line-level diff grouped into hunks, with word-level highlighting inside
 * paired lines.
 *
 * The important property: `applyHunks` can reconstruct the document from any
 * *subset* of accepted hunks, which is what makes per-hunk accept/reject work
 * the way it does in Cursor.
 */

export type LineType = "context" | "add" | "del";

export interface WordPart {
  text: string;
  changed: boolean;
}

export interface DiffLine {
  type: LineType;
  text: string;
  /** 1-based line number in the original document (null for additions). */
  beforeNo: number | null;
  /** 1-based line number in the proposed document (null for deletions). */
  afterNo: number | null;
  /** Word-level split, present only where a del/add pair was matched up. */
  words?: WordPart[];
}

export interface Hunk {
  id: string;
  lines: DiffLine[];
  added: number;
  removed: number;
  /** 1-based start line in the original document, for the gutter label. */
  beforeStart: number;
  afterStart: number;
}

export interface DiffResult {
  hunks: Hunk[];
  added: number;
  removed: number;
  /** Every line in order, including untouched context outside hunks. */
  ops: Op[];
}

export interface Op {
  type: LineType;
  text: string;
  hunkId: string | null;
}

const splitLines = (s: string): string[] => {
  if (s === "") return [];
  const lines = s.split("\n");
  // A trailing newline produces a final empty element we don't want to treat
  // as a real line.
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
};

/**
 * @param context how many unchanged lines to show around each change
 */
export function computeDiff(
  before: string,
  after: string,
  context = 3,
): DiffResult {
  const parts = diffLines(before, after);

  // 1. Flatten into a linear op list with line numbers on both sides.
  const ops: Op[] = [];
  const numbered: { op: Op; beforeNo: number | null; afterNo: number | null }[] =
    [];
  let bNo = 0;
  let aNo = 0;

  for (const part of parts) {
    const type: LineType = part.added ? "add" : part.removed ? "del" : "context";
    for (const text of splitLines(part.value)) {
      const op: Op = { type, text, hunkId: null };
      ops.push(op);
      numbered.push({
        op,
        beforeNo: type === "add" ? null : ++bNo,
        afterNo: type === "del" ? null : ++aNo,
      });
    }
  }

  // 2. Mark which lines belong to a hunk: any changed line, plus `context`
  //    unchanged lines on either side.
  const inHunk = new Array<boolean>(ops.length).fill(false);
  ops.forEach((op, i) => {
    if (op.type === "context") return;
    const lo = Math.max(0, i - context);
    const hi = Math.min(ops.length - 1, i + context);
    for (let j = lo; j <= hi; j++) inHunk[j] = true;
  });

  // 3. Slice contiguous marked runs into hunks.
  const hunks: Hunk[] = [];
  let i = 0;
  let seq = 0;
  let totalAdded = 0;
  let totalRemoved = 0;

  while (i < ops.length) {
    if (!inHunk[i]) {
      i++;
      continue;
    }
    const start = i;
    while (i < ops.length && inHunk[i]) i++;
    const slice = numbered.slice(start, i);

    const hunkId = `h${seq++}`;
    let added = 0;
    let removed = 0;
    const lines: DiffLine[] = slice.map(({ op, beforeNo, afterNo }) => {
      op.hunkId = hunkId;
      if (op.type === "add") added++;
      if (op.type === "del") removed++;
      return { type: op.type, text: op.text, beforeNo, afterNo };
    });

    annotateWords(lines);
    totalAdded += added;
    totalRemoved += removed;

    hunks.push({
      id: hunkId,
      lines,
      added,
      removed,
      beforeStart: slice.find((s) => s.beforeNo !== null)?.beforeNo ?? 1,
      afterStart: slice.find((s) => s.afterNo !== null)?.afterNo ?? 1,
    });
  }

  return { hunks, added: totalAdded, removed: totalRemoved, ops };
}

/**
 * Within a hunk, a run of N deletions immediately followed by N additions is
 * almost always N rewritten lines. Pairing them up lets us show word-level
 * changes instead of two solid blocks of colour.
 */
function annotateWords(lines: DiffLine[]) {
  let i = 0;
  while (i < lines.length) {
    if (lines[i].type !== "del") {
      i++;
      continue;
    }
    let d = i;
    while (d < lines.length && lines[d].type === "del") d++;
    let a = d;
    while (a < lines.length && lines[a].type === "add") a++;

    const dels = d - i;
    const adds = a - d;
    // Only pair balanced, reasonably small runs — otherwise the pairing is
    // arbitrary and the word highlights mislead more than they help.
    if (dels > 0 && dels === adds && dels <= 12) {
      for (let k = 0; k < dels; k++) {
        const del = lines[i + k];
        const add = lines[d + k];
        // Wholly dissimilar lines aren't a rewrite; leave them as block changes.
        if (similarity(del.text, add.text) < 0.35) continue;
        const wordParts = diffWordsWithSpace(del.text, add.text);
        del.words = wordParts
          .filter((p) => !p.added)
          .map((p) => ({ text: p.value, changed: Boolean(p.removed) }));
        add.words = wordParts
          .filter((p) => !p.removed)
          .map((p) => ({ text: p.value, changed: Boolean(p.added) }));
      }
    }
    i = a > d ? a : d;
  }
}

/** Cheap token-overlap ratio; good enough to decide "is this a rewrite?". */
function similarity(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const tb = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (!ta.size && !tb.size) return 1;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return (2 * shared) / (ta.size + tb.size);
}

/**
 * Rebuilds document text given the set of accepted hunk ids.
 *
 * Accepted hunk → take its additions, drop its deletions.
 * Rejected hunk → keep its deletions (the original text), drop its additions.
 */
export function applyHunks(result: DiffResult, accepted: Set<string>): string {
  const out: string[] = [];
  for (const op of result.ops) {
    if (op.type === "context") {
      out.push(op.text);
      continue;
    }
    const isAccepted = op.hunkId !== null && accepted.has(op.hunkId);
    if (op.type === "add" && isAccepted) out.push(op.text);
    if (op.type === "del" && !isAccepted) out.push(op.text);
  }
  return out.join("\n");
}

/** Compact "+12 −3" style summary. */
export function diffStat(result: DiffResult): string {
  const bits: string[] = [];
  if (result.added) bits.push(`+${result.added}`);
  if (result.removed) bits.push(`−${result.removed}`);
  return bits.join(" ") || "no changes";
}
