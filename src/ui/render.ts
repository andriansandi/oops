const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";

export const c = {
  reset: RESET,
  dim: DIM,
  bold: BOLD,
  cyan: CYAN,
  yellow: YELLOW,
  green: GREEN,
  red: RED,
};

export function truncate(value: unknown, max: number): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (s.length <= max) return s;
  if (max <= 1) return s.slice(0, max);
  return s.slice(0, max - 1) + "…";
}

export interface RenderTableOpts {
  maxColWidth?: number;
  showHeader?: boolean;
}

export function renderTable(
  columns: string[],
  rows: Record<string, unknown>[],
  opts: RenderTableOpts = {},
): string {
  const maxColWidth = opts.maxColWidth ?? 32;
  const showHeader = opts.showHeader ?? true;

  if (columns.length === 0) return `${c.dim}(no columns)${c.reset}`;

  const widths: Record<string, number> = {};
  for (const col of columns) {
    let w = col.length;
    for (const row of rows) {
      const cell = row[col];
      const len = cell === null || cell === undefined ? 4 : String(cell).length;
      if (len > w) w = len;
    }
    widths[col] = Math.min(w, maxColWidth);
  }

  const pad = (s: string, w: number) => {
    const t = truncate(s, w);
    return t + " ".repeat(Math.max(0, w - t.length));
  };

  const sep =
    "+" + columns.map((c) => "-".repeat(widths[c] + 2)).join("+") + "+";

  const out: string[] = [];
  out.push(c.dim + sep + c.reset);
  if (showHeader) {
    out.push(
      c.dim +
        "|" +
        c.reset +
        columns
          .map((col) => ` ${c.bold}${c.cyan}${pad(col, widths[col])}${c.reset} `)
          .join(c.dim + "|" + c.reset) +
        c.dim +
        "|" +
        c.reset,
    );
    out.push(c.dim + sep + c.reset);
  }
  if (rows.length === 0) {
    out.push(
      c.dim + "|" + c.reset + ` ${c.dim}(empty)${c.reset} ` + c.dim + "|" + c.reset,
    );
  } else {
    for (const row of rows) {
      out.push(
        c.dim +
          "|" +
          c.reset +
          columns
            .map((col) => ` ${pad(String(row[col] ?? ""), widths[col])} `)
            .join(c.dim + "|" + c.reset) +
          c.dim +
          "|" +
          c.reset,
      );
    }
  }
  out.push(c.dim + sep + c.reset);
  return out.join("\n");
}

export function maskSecret(secret: string, visible = 4): string {
  if (secret.length <= visible) return "*".repeat(secret.length);
  return "*".repeat(secret.length - visible) + secret.slice(-visible);
}
