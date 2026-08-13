/**
 * Dependency-free CSV handling.
 *
 * Written by hand rather than pulling a parser dependency: the surface we need
 * is small, and shipping a known-correct RFC 4180 implementation (quoted
 * fields, escaped quotes, embedded commas and newlines) is ~40 lines.
 */

export interface Column {
  name: string;
  /** Inferred from the values, used to pick an aggregation. */
  type: "number" | "currency" | "date" | "category" | "text";
  /** Distinct value count — low cardinality makes a good crosstab axis. */
  distinct: number;
  /** Non-empty value count. */
  filled: number;
}

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
  columns: Column[];
  delimiter: string;
  truncated: boolean;
}

/** Detects the delimiter by whichever yields the most consistent field count. */
export function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 8).filter(Boolean);
  if (!sample.length) return ",";

  let best = ",";
  let bestScore = -1;
  for (const d of [",", "\t", ";", "|"]) {
    const counts = sample.map((line) => splitLine(line, d).length);
    const first = counts[0];
    if (first < 2) continue;
    // Reward many fields, punish rows that disagree on how many there are.
    const consistent = counts.filter((c) => c === first).length;
    const score = first * consistent;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/** Splits a single line, honouring quotes. Used only for delimiter sniffing. */
function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      out.push(field);
      field = "";
    } else field += ch;
  }
  out.push(field);
  return out;
}

/**
 * Full RFC 4180 parse. Handles quoted fields containing the delimiter, CRLF,
 * and doubled quotes as escapes.
 */
export function parseCsv(text: string, maxRows = 5000): ParsedCsv {
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let truncated = false;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    // Skip blank trailing lines.
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }

    if (ch === '"') quoted = true;
    else if (ch === delimiter) endField();
    else if (ch === "\n") {
      endRow();
      if (rows.length > maxRows) {
        truncated = true;
        break;
      }
    } else if (ch !== "\r") field += ch;
  }
  if (field || row.length) endRow();

  const headers = (rows.shift() ?? []).map((h, i) => h.trim() || `Column ${i + 1}`);
  // Normalise ragged rows so downstream indexing is safe.
  const width = headers.length;
  const normalised = rows.map((r) =>
    r.length === width
      ? r
      : Array.from({ length: width }, (_, i) => r[i] ?? ""),
  );

  return {
    headers,
    rows: normalised,
    columns: inferColumns(headers, normalised),
    delimiter,
    truncated,
  };
}

const CURRENCY = /^[$£€]\s?-?[\d,]+(\.\d+)?[km]?$/i;
const NUMBERISH = /^-?[\d,]+(\.\d+)?%?$/;

export function inferColumns(headers: string[], rows: string[][]): Column[] {
  return headers.map((name, i) => {
    const values = rows.map((r) => (r[i] ?? "").trim()).filter(Boolean);
    const distinct = new Set(values).size;

    let type: Column["type"] = "text";
    if (values.length) {
      const sample = values.slice(0, 200);
      const currency = sample.filter((v) => CURRENCY.test(v)).length;
      const numeric = sample.filter((v) => NUMBERISH.test(v)).length;
      const dates = sample.filter((v) => isDateish(v)).length;

      if (currency / sample.length > 0.7) type = "currency";
      else if (numeric / sample.length > 0.7) type = "number";
      else if (dates / sample.length > 0.7) type = "date";
      // Repeated values across many rows == a category. The `distinct <
      // values.length` guard matters on small files, where an all-unique free
      // text column would otherwise slip under the absolute threshold.
      else if (
        distinct < values.length &&
        distinct <= Math.max(12, values.length * 0.1)
      ) {
        type = "category";
      }
    }

    return { name, type, distinct, filled: values.length };
  });
}

/**
 * `Date.parse` alone is uselessly permissive — it accepts "MER-8801" and
 * happily returns a date — so the value must first match a recognisable date
 * shape. Ticket ids and SKUs would otherwise be typed as dates.
 */
const DATE_SHAPES = [
  /^\d{4}-\d{1,2}-\d{1,2}([T ]|$)/, // 2026-08-05
  /^\d{1,2}\/\d{1,2}\/\d{2,4}$/, // 08/05/2026
  /^\d{1,2}[- ][a-z]{3,9}[- ]\d{2,4}$/i, // 5 Aug 2026
  /^[a-z]{3,9} \d{1,2},? \d{4}$/i, // Aug 5, 2026
];

function isDateish(v: string): boolean {
  if (v.length < 6 || v.length > 32) return false;
  if (!DATE_SHAPES.some((re) => re.test(v))) return false;
  return !Number.isNaN(Date.parse(v));
}

/** Strips currency symbols/commas/percent so a column can be summed. */
export function toNumber(raw: string): number | null {
  const cleaned = raw.replace(/[$£€,\s%]/g, "");
  if (!cleaned || !/^-?\d*\.?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export interface Crosstab {
  rowField: string;
  colField: string | null;
  measure: string;
  /** Column headers, ordered. Empty when there's no second dimension. */
  colKeys: string[];
  rows: { key: string; cells: number[]; total: number }[];
  grandTotal: number;
}

/**
 * Frequency (or summed-measure) crosstab — the "severity × frequency matrix"
 * PMs build by hand in a spreadsheet.
 *
 * @param measureField sum this column instead of counting rows
 */
export function crosstab(
  parsed: ParsedCsv,
  rowField: string,
  colField?: string | null,
  measureField?: string | null,
): Crosstab {
  const idx = (name: string) =>
    parsed.headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());

  const ri = idx(rowField);
  if (ri === -1) throw new Error(`No column named '${rowField}'.`);
  const ci = colField ? idx(colField) : -1;
  if (colField && ci === -1) throw new Error(`No column named '${colField}'.`);
  const mi = measureField ? idx(measureField) : -1;
  if (measureField && mi === -1) {
    throw new Error(`No column named '${measureField}'.`);
  }

  const colKeys: string[] = [];
  const map = new Map<string, Map<string, number>>();

  for (const r of parsed.rows) {
    const rk = (r[ri] ?? "").trim() || "(blank)";
    const ck = ci === -1 ? "_" : (r[ci] ?? "").trim() || "(blank)";
    const value = mi === -1 ? 1 : (toNumber(r[mi] ?? "") ?? 0);

    if (ci !== -1 && !colKeys.includes(ck)) colKeys.push(ck);
    const bucket = map.get(rk) ?? new Map<string, number>();
    bucket.set(ck, (bucket.get(ck) ?? 0) + value);
    map.set(rk, bucket);
  }

  colKeys.sort();
  const keys = ci === -1 ? ["_"] : colKeys;

  const rows = [...map.entries()]
    .map(([key, bucket]) => {
      const cells = keys.map((k) => bucket.get(k) ?? 0);
      return { key, cells, total: cells.reduce((a, b) => a + b, 0) };
    })
    .sort((a, b) => b.total - a.total);

  return {
    rowField: parsed.headers[ri],
    colField: ci === -1 ? null : parsed.headers[ci],
    measure: mi === -1 ? "count" : parsed.headers[mi],
    colKeys: ci === -1 ? [] : keys,
    rows,
    grandTotal: rows.reduce((a, r) => a + r.total, 0),
  };
}

/** Renders a crosstab as a markdown table for the model and the UI. */
export function crosstabToMarkdown(t: Crosstab): string {
  const head = t.colField
    ? [t.rowField, ...t.colKeys, "Total"]
    : [t.rowField, t.measure === "count" ? "Count" : t.measure];

  const fmt = (n: number) =>
    Number.isInteger(n) ? String(n) : n.toFixed(1);

  const body = t.rows.map((r) =>
    t.colField
      ? [r.key, ...r.cells.map(fmt), fmt(r.total)]
      : [r.key, fmt(r.total)],
  );

  return [
    `| ${head.join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
    ...body.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
}
