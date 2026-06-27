import * as p from "@clack/prompts";
import { ensureConfig, getActiveInstance } from "../core/config.ts";
import {
  buildAdaptor,
  type BaseAdaptor,
  type ColumnInfo,
  type TableInfo,
} from "@oops/core";
import { createList, type List } from "../ui/list.ts";
import { runSession } from "../ui/session.ts";
import { style } from "../ui/ansi.ts";
import type { KeyEvent } from "../ui/prompt.ts";

interface TableWithMeta extends TableInfo {
  rowCount: number | null;
  internal?: boolean;
}

export interface ColumnWithSample extends ColumnInfo {
  sample: unknown;
}

type Tab = "info" | "columns" | "sql";

interface ColumnCacheEntry {
  status: "ok" | "error" | "loading";
  columns?: ColumnWithSample[];
  error?: string;
}

export interface TablesState {
  list: List<TableWithMeta>;
  allTables: TableWithMeta[];
  tab: Tab;
  search: string;
  searchMode: boolean;
  columnCache: Map<string, ColumnCacheEntry>;
  columnIndex: number;
  picked: string | null;
  status: string | null;
  title: string;
}

const INTERNAL_PREFIXES = ["_cf_", "sqlite_"];
const INTERNAL_EXACT = new Set(["d1_migrations"]);
function isInternal(name: string): boolean {
  if (INTERNAL_EXACT.has(name)) return true;
  return INTERNAL_PREFIXES.some((p) => name.startsWith(p));
}

const COUNT_QUERY = (name: string) => `SELECT COUNT(*) AS n FROM ${name}`;

function summarize(sql: string | null, max = 60): string {
  if (!sql) return "";
  const first = sql.split("\n")[0]?.trim() ?? "";
  return first.length > max ? first.slice(0, max - 1) + "…" : first;
}

function formatSample(v: unknown, max: number): string {
  if (v === null || v === undefined) return "";
  let s: string;
  if (typeof v === "object") {
    try {
      s = JSON.stringify(v);
    } catch {
      s = String(v);
    }
  } else {
    s = String(v);
  }
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function applyFilter(
  source: readonly TableWithMeta[],
  q: string,
): TableWithMeta[] {
  if (!q.trim()) return [...source];
  const needle = q.toLowerCase();
  return source.filter((t) => t.name.toLowerCase().includes(needle));
}

export function tablesKeyReducer(
  state: TablesState,
  key: KeyEvent,
): { state: TablesState; exit: boolean } {
  if (key.ctrl && key.name === "c") {
    return { state, exit: true };
  }

  if (state.searchMode) {
    if (key.name === "escape") {
      return {
        state: { ...state, searchMode: false, search: "", list: state.list },
        exit: false,
      };
    }
    if (key.name === "return") {
      return { state: { ...state, searchMode: false }, exit: false };
    }
    if (key.name === "backspace") {
      const search = state.search.slice(0, -1);
      const filtered = applyFilter(state.allTables, search);
      const newList = createList(filtered, { viewport: state.list.viewport });
      newList.setIndex(state.list.index < filtered.length ? state.list.index : Math.max(0, filtered.length - 1));
      return { state: { ...state, search, list: newList }, exit: false };
    }
    const seq = key.sequence ?? "";
    if (seq && seq.charCodeAt(0) !== 0x1b && !key.ctrl && !key.meta) {
      const search = state.search + seq;
      const filtered = applyFilter(state.allTables, search);
      const newList = createList(filtered, { viewport: state.list.viewport });
      return { state: { ...state, search, list: newList }, exit: false };
    }
    return { state, exit: false };
  }

  if (key.name === "escape") {
    if (state.tab !== "info") {
      return { state: { ...state, tab: "info", columnIndex: 0 }, exit: false };
    }
    if (state.search) {
      const filtered = applyFilter(state.allTables, "");
      const newList = createList(filtered, { viewport: state.list.viewport });
      return { state: { ...state, search: "", list: newList }, exit: false };
    }
    return { state, exit: true };
  }
  if (key.sequence === "q") {
    return { state, exit: true };
  }
  if (key.sequence === "/") {
    return { state: { ...state, searchMode: true }, exit: false };
  }
  if (key.name === "tab") {
    const order: Tab[] = ["info", "columns", "sql"];
    const idx = order.indexOf(state.tab);
    return { state: { ...state, tab: order[(idx + 1) % 3] }, exit: false };
  }

  const current = state.list.items[state.list.index];

  if (state.tab === "columns") {
    const cache = current ? state.columnCache.get(current.name) : null;
    if (cache?.status === "ok" && cache.columns) {
      if (key.name === "up") {
        return {
          state: {
            ...state,
            columnIndex: Math.max(0, state.columnIndex - 1),
          },
          exit: false,
        };
      }
      if (key.name === "down") {
        return {
          state: {
            ...state,
            columnIndex: Math.min(
              cache.columns.length - 1,
              state.columnIndex + 1,
            ),
          },
          exit: false,
        };
      }
    }
    if (key.name === "return" && cache?.status === "ok" && cache.columns) {
      const c = cache.columns[state.columnIndex];
      if (c) {
        const lines = [
          `${c.name}  ${c.type}${c.pk ? "  PK" : ""}${c.notnull ? "  NOT NULL" : ""}`,
          c.dflt_value !== null && c.dflt_value !== undefined
            ? `default: ${String(c.dflt_value)}`
            : "",
          c.sample !== null && c.sample !== undefined
            ? `sample: ${formatSample(c.sample, 200)}`
            : "sample: (no rows yet)",
        ].filter(Boolean);
        return {
          state: { ...state, status: lines.join(" | ") },
          exit: false,
        };
      }
    }
    return { state, exit: false };
  }

  if (key.name === "up") {
    state.list.prev();
    return { state, exit: false };
  }
  if (key.name === "down") {
    state.list.next();
    return { state, exit: false };
  }
  if (key.name === "return" && current) {
    return { state: { ...state, picked: current.name }, exit: true };
  }
  return { state, exit: false };
}

function renderTables(state: TablesState): string {
  const termWidth = process.stdout.columns || 100;
  const termHeight = process.stdout.rows || 30;
  const listAreaHeight = Math.max(5, termHeight - 14);
  const list = state.list;
  const all = state.allTables;
  const filtered = list.items;

  const lines: string[] = [];
  lines.push(
    `${style.bold("📚 " + state.title)}${style.gray(
      `  ${filtered.length}/${all.length} table${all.length === 1 ? "" : "s"} · ${all.filter((x) => x.type === "view").length} view(s)`,
    )}`,
  );
  lines.push("");
  lines.push(style.gray("  TYPE     NAME                                ROWS"));
  lines.push(style.gray("  ──────── ──────────────────────────────────  ────────"));

  const start = Math.max(0, list.index - Math.floor(listAreaHeight / 2));
  const end = Math.min(filtered.length, start + listAreaHeight);
  const visible = filtered.slice(start, end);

  if (filtered.length === 0) {
    lines.push(style.gray(`  (no tables match "${state.search}")`));
  } else {
    for (let i = 0; i < visible.length; i++) {
      const row = visible[i];
      const realIdx = start + i;
      const isActive = realIdx === list.index;
      const icon = row.type === "view" ? "👁 " : "📄 ";
      const name = `${row.internal ? "🔒 " : ""}${row.name}`
        .padEnd(34)
        .slice(0, 34);
      const rows =
        row.rowCount === null ? "     ?" : String(row.rowCount).padStart(7);
      const type = row.type.padEnd(7).slice(0, 7);
      const prefix = isActive ? "▶ " : "  ";
      const baseColor = row.internal
        ? style.gray
        : isActive
          ? style.cyan
          : (s: string) => s;
      const line = `${prefix}${icon}${type}  ${name} ${rows}`;
      lines.push(isActive ? style.cyan(line) : baseColor(line));
    }
  }
  lines.push("");

  const current = filtered[list.index];
  if (current) {
    lines.push(...renderPanel(current, state, termWidth));
  } else {
    lines.push(style.gray("  (no selection)"));
  }
  lines.push("");

  if (state.status) {
    lines.push(style.yellow("  " + state.status));
    lines.push("");
  }

  if (state.searchMode) {
    lines.push(
      `${style.yellow("  search tables: ")}${state.search}${style.cyan("▌")}`,
    );
  } else {
    lines.push(
      style.gray(
        `  ↑/↓ nav · tab cycle view · / search · enter open · esc back · q quit`,
      ),
    );
  }
  return lines.join("\n");
}

function renderPanel(
  t: TableWithMeta,
  state: TablesState,
  _termWidth: number,
): string[] {
  if (state.tab === "sql") {
    return [
      `${style.cyan(style.bold(t.name))}  ${style.gray(t.type)}  ${style.yellow("[SQL]")}`,
      t.sql ?? "(no SQL)",
    ];
  }
  if (state.tab === "columns") {
    const cache = state.columnCache.get(t.name);
    const lines: string[] = [];
    lines.push(
      `${style.cyan(style.bold(t.name))}  ${style.gray(t.type)}  ${style.yellow("[COLUMNS]")}` +
        (cache?.status === "loading" ? "  " + style.yellow("loading…") : "") +
        (cache?.status === "error"
          ? "  " + style.red("error: " + (cache.error ?? ""))
          : ""),
    );
    if (!cache || cache.status === "loading") {
      lines.push(style.gray("  (loading…)"));
    } else if (cache.status === "error") {
      lines.push(style.gray("  (unavailable)"));
    } else if (!cache.columns || cache.columns.length === 0) {
      lines.push(style.gray("  (no columns)"));
    } else {
      lines.push(
        style.gray(
          "  #  PK  NOT NULL  TYPE              NAME                  DEFAULT                SAMPLE",
        ),
      );
      lines.push(
        style.gray(
          "  ──  ──  ────────  ────────────────  ───────────────────  ─────────────────────  ─────",
        ),
      );
      for (let i = 0; i < cache.columns.length; i++) {
        const c = cache.columns[i];
        const isActive = i === state.columnIndex;
        const tags = [
          String(i + 1).padStart(2, " "),
          c.pk ? "🔑" : "  ",
          c.notnull ? "✓" : "  ",
          (c.type || "").padEnd(15).slice(0, 15),
          c.name.padEnd(20).slice(0, 20),
          c.dflt_value === null || c.dflt_value === undefined
            ? ""
            : formatSample(c.dflt_value, 20).padEnd(20).slice(0, 20),
          formatSample(c.sample, 60),
        ];
        const line = "  " + tags.join("  ");
        lines.push(isActive ? style.cyan(line) : line);
      }
    }
    return lines;
  }
  return [
    `${style.cyan(style.bold(t.name))}  ${style.gray(t.type)}  ${style.yellow("[INFO]")}`,
    style.gray(
      `  ${t.internal ? "🔒 internal · " : ""}rows: ${t.rowCount === null ? "unknown" : t.rowCount} · ${t.sql ? summarize(t.sql) : "no schema info"}`,
    ),
  ];
}

async function loadColumns(
  adaptor: BaseAdaptor,
  tableName: string,
): Promise<ColumnCacheEntry> {
  try {
    const cols = await adaptor.describeTable(tableName);
    let sample: Record<string, unknown> = {};
    try {
      const r = await adaptor.query<Record<string, unknown>>(
        `SELECT * FROM ${tableName} LIMIT 1`,
      );
      sample = r.rows[0] ?? {};
    } catch {
      sample = {};
    }
    return {
      status: "ok",
      columns: cols.map((c) => ({ ...c, sample: sample[c.name] ?? null })),
    };
  } catch (err) {
    return { status: "error", error: (err as Error).message };
  }
}

export async function cmdTables(): Promise<string | null> {
  const cfg = ensureConfig();
  const active = getActiveInstance(cfg);
  if (!active) {
    p.log.warn("No active instance. Run `oops connect` or `oops use <name>`.");
    return null;
  }

  const spin = p.spinner();
  spin.start(`Reading schema from ${active.name}…`);
  const adaptor = buildAdaptor(active);
  let result: { tables: TableInfo[]; internal: TableInfo[] };
  try {
    result = await adaptor.listTables();
  } catch (err) {
    spin.stop("Failed");
    p.log.error((err as Error).message);
    process.exit(1);
  }
  const all: TableInfo[] = [...result.tables, ...result.internal];
  if (all.length === 0) {
    spin.stop("Empty database");
    p.log.info("No user tables or views.");
    return null;
  }

  spin.message("Counting rows…");
  const tables: TableWithMeta[] = await Promise.all(
    all.map(async (t) => {
      try {
        const r = await adaptor.query<{ n: number }>(COUNT_QUERY(t.name));
        return {
          ...t,
          rowCount: Number(r.rows[0]?.n ?? 0),
          internal: isInternal(t.name),
        };
      } catch {
        return { ...t, rowCount: null, internal: isInternal(t.name) };
      }
    }),
  );
  spin.stop(
    `${tables.length} object(s)${result.internal.length > 0 ? ` (${result.internal.length} internal hidden)` : ""}`,
  );

  const initialState: TablesState = {
    list: createList(tables, {
      viewport: Math.max(5, (process.stdout.rows || 30) - 14),
    }),
    allTables: tables,
    tab: "info",
    search: "",
    searchMode: false,
    columnCache: new Map(),
    columnIndex: 0,
    picked: null,
    status: null,
    title: `${active.name} — schema`,
  };

  const finalState = await runSession<TablesState>({
    initial: initialState,
    render: renderTables,
    onKey: tablesKeyReducer,
    onStateChanged: async (state) => {
      const current = state.list.items[state.list.index];
      if (!current) return state;
      if (state.columnCache.has(current.name)) return state;
      const next = new Map(state.columnCache);
      next.set(current.name, { status: "loading" });
      return { ...state, columnCache: next };
    },
    onStart: async (state) => {
      const current = state.list.items[state.list.index];
      if (!current) return state;
      const cache = new Map(state.columnCache);
      cache.set(current.name, { status: "loading" });
      const entry = await loadColumns(adaptor, current.name);
      cache.set(current.name, entry);
      return { ...state, columnCache: cache };
    },
    onExit: () => {
      void adaptor;
    },
  });

  return finalState.picked;
}
