import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";

export interface BrowserColumn {
  key: string;
  label: string;
  width: number;
  type?: string;
  pk?: boolean;
  notnull?: boolean;
}

export interface BrowserProps {
  title: string;
  columns: BrowserColumn[];
  rows: Record<string, unknown>[];
  onExit?: () => void;
  onSelectRow?: (row: Record<string, unknown>, index: number) => Promise<void> | void;
  statusLine?: string;
}

type Mode = "browse" | "search";

const ACTION_HINTS = [
  { key: "↑/↓", desc: "navigate row" },
  { key: "←/→", desc: "scroll columns" },
  { key: "Enter", desc: "toggle row detail" },
  { key: "/", desc: "search" },
  { key: "Esc", desc: "exit" },
];

function formatCell(v: unknown): string {
  if (v === null) return "NULL";
  if (v === undefined) return "";
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

export function TableBrowser(props: BrowserProps): React.ReactElement {
  const { title, columns, rows, onExit, onSelectRow, statusLine } = props;
  const { exit } = useApp();

  const [rowIndex, setRowIndex] = useState(0);
  const [colOffset, setColOffset] = useState(0);
  const [mode, setMode] = useState<Mode>("browse");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [detailTab, setDetailTab] = useState<"table" | "raw">("table");

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter((r) =>
      Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(q)),
    );
  }, [rows, query]);

  useEffect(() => {
    if (rowIndex >= filtered.length) setRowIndex(Math.max(0, filtered.length - 1));
  }, [filtered.length, rowIndex]);

  const termWidth = process.stdout.columns || 100;
  const termHeight = process.stdout.rows || 30;
  const detailOpen = showDetail && filtered[rowIndex] !== undefined;
  const detailRows = Math.min(8, columns.length);
  const reservedForChrome = 8 + (detailOpen ? detailRows + 4 : 0);
  const visibleRows = Math.max(3, termHeight - reservedForChrome);
  const visibleCols = columns.slice(colOffset);

  const colWidths = useMemo(() => {
    const fixed = visibleCols.reduce((acc, c) => acc + c.width + 1, 0);
    if (fixed <= termWidth - 4) {
      return Object.fromEntries(visibleCols.map((c) => [c.key, c.width]));
    }
    const shrink = (termWidth - 4) / Math.max(1, visibleCols.length);
    return Object.fromEntries(visibleCols.map((c) => [c.key, Math.max(6, Math.floor(shrink))]));
  }, [visibleCols, termWidth]);

  useInput((input, key) => {
    if (mode === "search") return;
    if (busy) return;

    if (key.escape || input === "q") {
      if (showDetail) {
        setShowDetail(false);
        return;
      }
      onExit ? onExit() : exit();
      return;
    }
    if (input === "/") {
      setMode("search");
      setMessage(null);
      return;
    }
    if (key.upArrow) {
      setRowIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow) {
      setRowIndex((i) => Math.min(filtered.length - 1, i + 1));
      return;
    }
    if (key.leftArrow) {
      setColOffset((o) => Math.max(0, o - 1));
      return;
    }
    if (key.rightArrow) {
      setColOffset((o) => Math.min(Math.max(0, columns.length - 1), o + 1));
      return;
    }
    if (key.return) {
      if (onSelectRow && filtered[rowIndex]) {
        setBusy(true);
        setMessage("Working…");
        Promise.resolve(onSelectRow(filtered[rowIndex], rowIndex))
          .catch((e) => setMessage(`Error: ${(e as Error).message}`))
          .finally(() => {
            setBusy(false);
            setMessage(null);
          });
      } else {
        setShowDetail((v) => !v);
        setDetailTab("table");
      }
      return;
    }
    if (key.tab && showDetail) {
      setDetailTab((t) => (t === "table" ? "raw" : "table"));
      return;
    }
  });

  const truncate = (s: string, w: number): string => {
    if (s.length <= w) return s.padEnd(w, " ");
    if (w <= 1) return s.slice(0, w);
    return s.slice(0, w - 1) + "…";
  };

  const start = Math.max(0, rowIndex - Math.floor(visibleRows / 2));
  const end = Math.min(filtered.length, start + visibleRows);
  const visible = filtered.slice(start, end);

  const selectedRow = filtered[rowIndex];

  const renderDetail = () => {
    if (!selectedRow) return null;
    const labelCol = 14;
    const valCol = Math.max(20, termWidth - labelCol - 8);

    if (detailTab === "raw") {
      return (
        <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} marginTop={1}>
          <Box>
            <Text color="cyan" bold>Row #{rowIndex + 1}</Text>
            <Text color="gray">  [tab = table view · esc = close]</Text>
          </Box>
          <Text>{JSON.stringify(selectedRow, null, 2)}</Text>
        </Box>
      );
    }

    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="cyan"
        paddingX={1}
        marginTop={1}
      >
        <Box>
          <Text color="cyan" bold>Row #{rowIndex + 1}</Text>
          <Text color="gray">
            {"  "}
            {Object.keys(selectedRow).length} col
            {Object.keys(selectedRow).length === 1 ? "" : "s"} · [tab = raw json · esc = close]
          </Text>
        </Box>
        <Text color="gray">{"─".repeat(Math.min(termWidth - 4, 80))}</Text>
        {columns.map((c) => {
          const v = selectedRow[c.key];
          const tag = [
            c.pk ? "PK" : "",
            c.notnull ? "NN" : "",
            c.type ?? "",
          ]
            .filter(Boolean)
            .join(" · ");
          const val = formatCell(v);
          const truncated =
            val.length > valCol ? val.slice(0, valCol - 1) + "…" : val;
          return (
            <Box key={c.key}>
              <Box width={labelCol}>
                <Text color="cyan" bold>
                  {truncate(c.label, labelCol - 2)}
                </Text>
              </Box>
              <Box width={20}>
                <Text color="gray">{truncate(tag, 18)}</Text>
              </Box>
              <Text color={v === null ? "yellow" : undefined}>{truncated}</Text>
            </Box>
          );
        })}
      </Box>
    );
  };

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>📦 {title}</Text>
        <Text>  </Text>
        <Text color="gray">
          {filtered.length}/{rows.length} rows
          {query ? ` (filter: "${query}")` : ""}
        </Text>
      </Box>
      <Text> </Text>
      <Box>
        <Text color="cyan" bold>
          {visibleCols
            .map((c) => truncate(c.label, colWidths[c.key] ?? c.width))
            .join("│")}
        </Text>
      </Box>
      <Text color="gray">
        {"─".repeat(
          visibleCols.reduce((a, c) => a + (colWidths[c.key] ?? c.width), 0) +
            (visibleCols.length - 1),
        )}
      </Text>
      {visible.length === 0 ? (
        <Text color="gray">  (no rows match)</Text>
      ) : (
        visible.map((r, i) => {
          const realIdx = start + i;
          const isActive = realIdx === rowIndex;
          const prefix = isActive ? "▶ " : "  ";
          const cells = visibleCols
            .map((c) => truncate(String(r[c.key] ?? ""), colWidths[c.key] ?? c.width))
            .join("│");
          return (
            <Text
              key={realIdx}
              inverse={isActive}
              color={isActive ? "green" : undefined}
            >
              {prefix}
              {cells}
            </Text>
          );
        })
      )}
      {visibleCols.length < columns.length ? (
        <Text color="gray">
          {"  ("}
          {colOffset + 1}-{colOffset + visibleCols.length} of {columns.length} cols
          {")"}
        </Text>
      ) : null}
      {detailOpen ? renderDetail() : null}
      <Text> </Text>
      {mode === "search" ? (
        <Box>
          <Text color="yellow">search: </Text>
          <TextInput
            value={query}
            onChange={setQuery}
            onSubmit={() => setMode("browse")}
          />
        </Box>
      ) : (
        <Box>
          {message ? (
            <Text color="yellow">{message}</Text>
          ) : (
            <Text color="gray">
              {ACTION_HINTS.map((h) => `${h.key}=${h.desc}`).join("  ")}
              {statusLine ? `  │  ${statusLine}` : ""}
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
}
