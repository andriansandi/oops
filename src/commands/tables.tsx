import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import Spinner from "ink-spinner";
import { render } from "ink";
import TextInput from "ink-text-input";
import * as p from "@clack/prompts";
import { ensureConfig, getActiveInstance } from "../core/config.ts";
import { buildAdaptor } from "../core/adaptor-factory.ts";
import type { ColumnInfo, TableInfo } from "../core/adaptor.ts";
import type { BaseAdaptor } from "../core/adaptor.ts";

interface TableWithMeta extends TableInfo {
  rowCount: number | null;
  internal?: boolean;
}

const COUNT_QUERY = (name: string) => `SELECT COUNT(*) AS n FROM ${name}`;

function summarize(sql: string | null, max = 60): string {
  if (!sql) return "";
  const first = sql.split("\n")[0]?.trim() ?? "";
  return first.length > max ? first.slice(0, max - 1) + "…" : first;
}

const INTERNAL_PREFIXES = ["_cf_", "sqlite_"];
const INTERNAL_EXACT = new Set(["d1_migrations"]);
function isInternal(name: string): boolean {
  if (INTERNAL_EXACT.has(name)) return true;
  return INTERNAL_PREFIXES.some((p) => name.startsWith(p));
}

type PanelTab = "info" | "columns" | "sql";

interface ColumnWithSample extends ColumnInfo {
  sample: unknown;
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

function TablesTui({
  title,
  tables,
  adaptor,
  onSelect,
}: {
  title: string;
  tables: TableWithMeta[];
  adaptor: BaseAdaptor;
  onSelect: (name: string) => void;
}): React.ReactElement {
  const { exit } = useApp();
  const [index, setIndex] = useState(0);
  const [tab, setTab] = useState<PanelTab>("info");
  const [searchMode, setSearchMode] = useState(false);
  const [query, setQuery] = useState("");

  const [columnsLoading, setColumnsLoading] = useState(false);
  const [columnsError, setColumnsError] = useState<string | null>(null);
  const [columnData, setColumnData] = useState<ColumnWithSample[] | null>(null);
  const [columnIndex, setColumnIndex] = useState(0);

  const filtered = useMemo(() => {
    if (!query.trim()) return tables;
    const q = query.toLowerCase();
    return tables.filter((t) => t.name.toLowerCase().includes(q));
  }, [tables, query]);

  useEffect(() => {
    if (index >= filtered.length) setIndex(Math.max(0, filtered.length - 1));
  }, [filtered.length, index]);

  const t = filtered[index];
  const tName = t?.name;

  useEffect(() => {
    setColumnData(null);
    setColumnIndex(0);
    setColumnsError(null);
    if (tab !== "columns" || !tName) return;
    let cancelled = false;
    setColumnsLoading(true);
    (async () => {
      try {
        const cols = await adaptor.describeTable(tName);
        let sample: Record<string, unknown> = {};
        try {
          const r = await adaptor.query<Record<string, unknown>>(
            `SELECT * FROM ${tName} LIMIT 1`,
          );
          sample = r.rows[0] ?? {};
        } catch {
          sample = {};
        }
        if (cancelled) return;
        setColumnData(
          cols.map((c) => ({ ...c, sample: sample[c.name] ?? null })),
        );
      } catch (err) {
        if (!cancelled) setColumnsError((err as Error).message);
      } finally {
        if (!cancelled) setColumnsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, tName, adaptor]);

  useInput((input, key) => {
    if (searchMode) return;

    if (key.escape) {
      if (tab === "columns" && columnData && columnData.length > 0) {
        setColumnIndex(0);
        setTab("info");
        return;
      }
      if (query) {
        setQuery("");
        return;
      }
      exit();
      return;
    }
    if (input === "q" && !query) {
      exit();
      return;
    }
    if (input === "/") {
      setSearchMode(true);
      return;
    }
    if (key.tab) {
      setTab((cur) => (cur === "info" ? "columns" : cur === "columns" ? "sql" : "info"));
      return;
    }
    if (tab === "columns" && columnData && columnData.length > 0) {
      if (key.upArrow) {
        setColumnIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow) {
        setColumnIndex((i) => Math.min(columnData.length - 1, i + 1));
        return;
      }
    } else {
      if (key.upArrow) {
        setIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow) {
        setIndex((i) => Math.min(filtered.length - 1, i + 1));
        return;
      }
    }
    if (key.return) {
      if (tab === "columns" && columnData) {
        const c = columnData[columnIndex];
        if (c) {
          p.log.message(
            [
              `${c.name}  ${c.type}${c.pk ? "  PK" : ""}${c.notnull ? "  NOT NULL" : ""}`,
              c.dflt_value !== null && c.dflt_value !== undefined
                ? `default: ${String(c.dflt_value)}`
                : "",
              c.sample !== null && c.sample !== undefined
                ? `sample: ${formatSample(c.sample, 200)}`
                : "sample: (no rows yet)",
            ]
              .filter(Boolean)
              .join("\n"),
          );
        }
        return;
      }
      if (t) onSelect(t.name);
    }
  });

  const termWidth = process.stdout.columns || 100;
  const termHeight = process.stdout.rows || 30;
  const reserved = 6;
  const visibleRows = Math.max(5, termHeight - reserved);

  if (!t) {
    return (
      <Box flexDirection="column">
        <Text color="gray">No tables match "{query}"</Text>
        <Text> </Text>
        <Text color="gray">press / to search, esc to clear, q to quit</Text>
      </Box>
    );
  }

  const start = Math.max(0, index - Math.floor(visibleRows / 2));
  const end = Math.min(filtered.length, start + visibleRows);
  const visible = filtered.slice(start, end);

  const renderPanel = () => {
    if (tab === "sql") {
      return (
        <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} width={termWidth - 2}>
          <Text>
            <Text color="cyan" bold>{t.name}</Text>
            <Text color="gray">  {t.type}  </Text>
            <Text color="yellow">[SQL]</Text>
          </Text>
          <Text>{t.sql ?? "(no SQL)"}</Text>
        </Box>
      );
    }
    if (tab === "columns") {
      return (
        <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} width={termWidth - 2}>
          <Box>
            <Text color="cyan" bold>{t.name}</Text>
            <Text color="gray">  {t.type}  </Text>
            <Text color="yellow">[COLUMNS]</Text>
            {columnsLoading ? <Text color="yellow">  loading…</Text> : null}
            {columnsError ? <Text color="red">  error: {columnsError}</Text> : null}
          </Box>
          {columnsLoading && !columnData ? (
            <Text color="gray">  <Spinner type="dots" /> fetching schema…</Text>
          ) : columnData && columnData.length > 0 ? (
            <>
              <Text color="gray">
                {"  "}#  PK  NOT NULL  TYPE              NAME                                     DEFAULT                                  SAMPLE
              </Text>
              <Text color="gray">
                {"  "}──  ──  ────────  ────────────────  ─────────────────────────────────────  ─────────────────────────────────────  ──────
              </Text>
              {columnData.map((c, i) => {
                const isActive = i === columnIndex;
                const tags = [
                  String(i + 1).padStart(2, " "),
                  c.pk ? "🔑" : "  ",
                  c.notnull ? "✓" : "  ",
                  (c.type || "").padEnd(15).slice(0, 15),
                  c.name.padEnd(37).slice(0, 37),
                  c.dflt_value === null || c.dflt_value === undefined
                    ? ""
                    : formatSample(c.dflt_value, 36).padEnd(36).slice(0, 36),
                  formatSample(c.sample, 60),
                ];
                return (
                  <Text key={c.name} inverse={isActive} color={isActive ? "green" : undefined}>
                    {"  "}
                    {tags.join("  ")}
                  </Text>
                );
              })}
            </>
          ) : (
            <Text color="gray">  (no columns)</Text>
          )}
        </Box>
      );
    }
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} width={termWidth - 2}>
        <Text>
          <Text color="cyan" bold>{t.name}</Text>
          <Text color="gray">  {t.type}  </Text>
          <Text color="yellow">[INFO]</Text>
        </Text>
        <Text color="gray">
          {t.internal ? "🔒 internal · " : ""}
          rows: {t.rowCount === null ? "unknown" : t.rowCount} ·{" "}
          {t.sql ? summarize(t.sql) : "no schema info"}
        </Text>
      </Box>
    );
  };

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>📚 {title}</Text>
        <Text>  </Text>
        <Text color="gray">
          {filtered.length}/{tables.length} table{tables.length === 1 ? "" : "s"} ·{" "}
          {tables.filter((x) => x.type === "view").length} view
          {tables.filter((x) => x.type === "view").length === 1 ? "" : "s"}
        </Text>
      </Box>
      <Text> </Text>
      <Text color="gray">
        {"  TYPE     NAME                              ROWS"}
      </Text>
      <Text color="gray">{"  ──────── ──────────────────────────────── ────────"}</Text>
      {visible.map((row, i) => {
        const realIdx = start + i;
        const isActive = realIdx === index;
        const icon = row.type === "view" ? "👁 " : "📄 ";
        const name = row.name.padEnd(34).slice(0, 34);
        const rows = row.rowCount === null ? "   ?" : String(row.rowCount).padStart(7);
        const type = row.type.padEnd(7).slice(0, 7);
        const prefix = isActive ? "▶ " : "  ";
        const baseColor = row.internal ? "gray" : isActive ? "cyan" : undefined;
        return (
          <Text key={row.name} inverse={isActive} color={baseColor}>
            {prefix}
            {icon}
            {type}  {name} {rows}
          </Text>
        );
      })}
      <Text> </Text>
      {renderPanel()}
      <Text> </Text>
      {searchMode ? (
        <Box>
          <Text color="yellow">search tables: </Text>
          <TextInput
            value={query}
            onChange={setQuery}
            onSubmit={() => setSearchMode(false)}
          />
        </Box>
      ) : (
        <Text color="gray">
          ↑/↓ nav{tab === "columns" ? " column" : " table"} · tab cycle view · / search · enter {tab === "columns" ? "column info" : "open table"} · esc back · q quit
        </Text>
      )}
    </Box>
  );
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

  let selected: string | null = null;
  const app = render(
    <TablesTui
      title={`${active.name} — schema`}
      tables={tables}
      adaptor={adaptor}
      onSelect={(name) => {
        selected = name;
        app.unmount();
      }}
    />,
    { exitOnCtrlC: true, patchConsole: false },
  );
  await app.waitUntilExit();
  return selected;
}
