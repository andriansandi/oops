import * as p from "@clack/prompts";
import { ensureConfig, getActiveInstance } from "../core/config.ts";
import { buildAdaptor } from "../core/adaptor-factory.ts";
import { runSession } from "../ui/session.ts";
import { style } from "../ui/ansi.ts";
import type { KeyEvent } from "../ui/prompt.ts";

const SAMPLE_LIMIT = 200;
const VISIBLE_ROWS = 15;
const DETAIL_HEIGHT = 10;

interface BrowserColumn {
  key: string;
  label: string;
  width: number;
  type: string;
  pk: boolean;
  notnull: boolean;
}

export interface BrowseState {
  columns: BrowserColumn[];
  rows: Record<string, unknown>[];
  indices: number[];
  index: number;
  filter: string;
  filterMode: boolean;
  hScroll: number;
  detail: boolean;
  detailView: "table" | "raw";
  status: string | null;
  title: string;
}

export function browseKeyReducer(
  state: BrowseState,
  key: KeyEvent,
): { state: BrowseState; exit: boolean } {
  if (key.ctrl && key.name === "c") return { state, exit: true };

  if (state.filterMode) {
    if (key.name === "escape") {
      return { state: { ...state, filterMode: false, filter: "" }, exit: false };
    }
    if (key.name === "return") {
      const indices = applyFilter(state.rows, state.filter);
      return {
        state: {
          ...state,
          filterMode: false,
          filter: state.filter,
          indices,
          index: Math.min(state.index, Math.max(0, indices.length - 1)),
        },
        exit: false,
      };
    }
    if (key.name === "backspace") {
      return {
        state: { ...state, filter: state.filter.slice(0, -1) },
        exit: false,
      };
    }
    const seq = key.sequence ?? "";
    if (seq && seq.charCodeAt(0) !== 0x1b && !key.ctrl && !key.meta) {
      return { state: { ...state, filter: state.filter + seq }, exit: false };
    }
    return { state, exit: false };
  }

  if (key.name === "escape") {
    if (state.detail) {
      return { state: { ...state, detail: false }, exit: false };
    }
    if (state.filter) {
      return {
        state: {
          ...state,
          filter: "",
          indices: state.rows.map((_, i) => i),
          index: 0,
        },
        exit: false,
      };
    }
    return { state, exit: true };
  }
  if (key.sequence === "q") return { state, exit: true };
  if (key.sequence === "/") {
    return { state: { ...state, filterMode: true, filter: "" }, exit: false };
  }

  if (state.detail) {
    if (key.name === "tab") {
      return {
        state: {
          ...state,
          detailView: state.detailView === "table" ? "raw" : "table",
        },
        exit: false,
      };
    }
    if (key.name === "left") {
      return {
        state: { ...state, hScroll: Math.max(0, state.hScroll - 1) },
        exit: false,
      };
    }
    if (key.name === "right") {
      return {
        state: {
          ...state,
          hScroll: Math.min(state.columns.length - 1, state.hScroll + 1),
        },
        exit: false,
      };
    }
    return { state, exit: false };
  }

  if (key.name === "up") {
    return {
      state: { ...state, index: Math.max(0, state.index - 1) },
      exit: false,
    };
  }
  if (key.name === "down") {
    return {
      state: {
        ...state,
        index: Math.min(state.indices.length - 1, state.index + 1),
      },
      exit: false,
    };
  }
  if (key.name === "left") {
    return {
      state: { ...state, hScroll: Math.max(0, state.hScroll - 1) },
      exit: false,
    };
  }
  if (key.name === "right") {
    return {
      state: {
        ...state,
        hScroll: Math.min(state.columns.length - 1, state.hScroll + 1),
      },
      exit: false,
    };
  }
  if (key.name === "return") {
    return { state: { ...state, detail: true }, exit: false };
  }
  return { state, exit: false };
}

function applyFilter(
  rows: Record<string, unknown>[],
  q: string,
): number[] {
  if (!q.trim()) return rows.map((_, i) => i);
  const needle = q.toLowerCase();
  const out: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    for (const k in row) {
      const v = row[k];
      if (v === null || v === undefined) continue;
      if (String(v).toLowerCase().includes(needle)) {
        out.push(i);
        break;
      }
    }
  }
  return out;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  if (max <= 1) return s.slice(0, max);
  return s.slice(0, max - 1) + "…";
}

function cellValue(v: unknown): string {
  if (v === null || v === undefined) return style.gray("∅");
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

function renderBrowse(state: BrowseState): string {
  const lines: string[] = [];
  lines.push(`${style.bold("📄 " + state.title)}`);
  lines.push(
    style.gray(
      `  ${state.indices.length} of ${state.rows.length} rows · filter: "${state.filter || "—"}" · h-scroll: ${state.hScroll + 1}/${state.columns.length}`,
    ),
  );
  lines.push("");

  const totalWidth = Math.min(120, process.stdout.columns || 100);
  let colOffset = state.hScroll;
  let usedWidth = 4;
  const visibleCols: { col: BrowserColumn; width: number }[] = [];
  for (let i = colOffset; i < state.columns.length; i++) {
    const col = state.columns[i];
    const w = Math.min(col.width, totalWidth - usedWidth - 2);
    if (w < 8) break;
    visibleCols.push({ col, width: w });
    usedWidth += w + 2;
  }
  if (visibleCols.length === 0 && state.columns.length > 0) {
    colOffset = Math.max(0, state.columns.length - 1);
    visibleCols.push({
      col: state.columns[colOffset],
      width: totalWidth - 6,
    });
  }

  const headerCells = ["    "];
  for (const { col, width } of visibleCols) {
    headerCells.push(truncate(col.label, width).padEnd(width));
  }
  lines.push(style.bold(style.cyan("  " + headerCells.join("  "))));
  lines.push(style.gray("  " + "─".repeat(Math.min(totalWidth, usedWidth + 4))));

  const start = Math.max(0, state.index - Math.floor(VISIBLE_ROWS / 2));
  const end = Math.min(state.indices.length, start + VISIBLE_ROWS);
  for (let i = start; i < end; i++) {
    const realIdx = state.indices[i];
    const row = state.rows[realIdx];
    const isActive = i === state.index;
    const prefix = isActive ? "▶ " : "  ";
    const numLabel = String(realIdx + 1).padStart(3, " ");
    const cells = [`${prefix}${numLabel}`];
    for (const { col, width } of visibleCols) {
      cells.push(truncate(cellValue(row[col.key]), width).padEnd(width));
    }
    const line = "  " + cells.join("  ");
    lines.push(isActive ? style.cyan(style.bold(line)) : line);
  }

  if (state.detail) {
    lines.push("");
    const realIdx = state.indices[state.index];
    const row = state.rows[realIdx];
    lines.push(
      style.bold(
        `  Row #${realIdx + 1} — ${state.detailView === "table" ? "TABLE" : "RAW"} (tab to toggle)`,
      ),
    );
    lines.push(style.gray("  " + "─".repeat(Math.min(totalWidth, 40))));
    if (state.detailView === "table") {
      const colStart = state.hScroll;
      const colEnd = Math.min(state.columns.length, colStart + 2);
      for (let i = colStart; i < colEnd; i++) {
        const col = state.columns[i];
        const v = row[col.key];
        const tags = [
          col.pk ? "PK" : "  ",
          col.notnull ? "NN" : "  ",
          (col.type || "").padEnd(8).slice(0, 8),
        ].join(" ");
        lines.push(`  ${style.cyan(col.key)} ${style.gray(tags)}`);
        const val = v === null || v === undefined ? "∅" : cellValue(v);
        for (const slice of sliceLines(val, totalWidth - 6)) {
          lines.push("    " + slice);
        }
      }
    } else {
      const json = JSON.stringify(row, null, 2);
      const lines2 = json.split("\n");
      for (let i = 0; i < Math.min(lines2.length, DETAIL_HEIGHT); i++) {
        lines.push("    " + lines2[i]);
      }
      if (lines2.length > DETAIL_HEIGHT) {
        lines.push(style.gray(`    …(${lines2.length - DETAIL_HEIGHT} more lines)`));
      }
    }
  } else if (state.status) {
    lines.push("");
    lines.push(style.yellow("  " + state.status));
  }

  lines.push("");
  if (state.filterMode) {
    lines.push(
      `${style.yellow("  filter: ")}${state.filter}${style.cyan("▌")}`,
    );
  } else {
    const keys = state.detail
      ? "←/→ scroll col · tab toggle view · esc close · q quit"
      : "↑/↓ nav · ←/→ scroll cols · / filter · enter detail · esc back · q quit";
    lines.push(style.gray("  " + keys));
  }
  return lines.join("\n");
}

function sliceLines(s: string, max: number): string[] {
  if (s.length <= max) return [s];
  const out: string[] = [];
  for (let i = 0; i < s.length; i += max) {
    out.push(s.slice(i, i + max));
  }
  return out;
}

export async function cmdBrowse(table: string | undefined): Promise<void> {
  const cfg = ensureConfig();
  const active = getActiveInstance(cfg);
  if (!active) {
    p.log.warn("No active instance. Run `oops connect` or `oops use <name>`.");
    return;
  }
  if (!table) {
    p.log.error("Usage: oops browse <table>");
    process.exit(1);
  }

  const adaptor = buildAdaptor(active);
  const cols = await adaptor.describeTable(table).catch((err) => {
    p.log.error((err as Error).message);
    process.exit(1);
  });

  if (!cols || cols.length === 0) {
    p.log.warn(`Table "${table}" has no columns or does not exist.`);
    return;
  }

  const result = await adaptor
    .query<Record<string, unknown>>(`SELECT * FROM ${table} LIMIT ${SAMPLE_LIMIT}`)
    .catch((err) => {
      p.log.error((err as Error).message);
      process.exit(1);
    });

  const columns: BrowserColumn[] = cols.map((c) => {
    const sample = result.rows[0]?.[c.name];
    const max = Math.max(
      c.name.length,
      ...result.rows.map((r) => String(r[c.name] ?? "").length).slice(0, 50),
    );
    return {
      key: c.name,
      label: `${c.name}${c.pk ? " 🔑" : ""}`,
      width: Math.min(40, Math.max(8, max + 1, sample === undefined ? 8 : 0)),
      type: c.type,
      pk: c.pk,
      notnull: c.notnull,
    };
  });

  const initial: BrowseState = {
    columns,
    rows: result.rows,
    indices: result.rows.map((_, i) => i),
    index: 0,
    filter: "",
    filterMode: false,
    hScroll: 0,
    detail: false,
    detailView: "table",
    status: null,
    title: `${active.name} → ${table}  (Cloudflare D1)`,
  };

  await runSession<BrowseState>({
    initial,
    render: renderBrowse,
    onKey: browseKeyReducer,
  });
}
