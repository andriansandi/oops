import { render } from "ink";
import * as p from "@clack/prompts";
import { ensureConfig, getActiveInstance } from "../core/config.ts";
import { buildAdaptor } from "../core/adaptor-factory.ts";
import { TableBrowser, type BrowserColumn } from "../ui/TableBrowser.tsx";
import { renderTable, c } from "../ui/render.ts";

const SAMPLE_LIMIT = 200;
const PLAIN_LIMIT = 25;

export async function cmdBrowsePlain(table: string | undefined): Promise<void> {
  const cfg = ensureConfig();
  const active = getActiveInstance(cfg);
  if (!active) {
    process.stderr.write("No active instance. Run `oops connect` or `oops use <name>`.\n");
    return;
  }
  if (!table) {
    process.stderr.write("Usage: oops browse <table>\n");
    process.exit(1);
  }

  process.stdout.write(`Loading ${active.name} → ${table}…\n`);
  const adaptor = buildAdaptor(active);
  const cols = await adaptor.describeTable(table).catch((err) => {
    process.stderr.write(`error: ${(err as Error).message}\n`);
    process.exit(1);
  });

  if (!cols || cols.length === 0) {
    process.stderr.write(`Table "${table}" has no columns or does not exist.\n`);
    return;
  }

  const result = await adaptor
    .query<Record<string, unknown>>(`SELECT * FROM ${table} LIMIT ${SAMPLE_LIMIT}`)
    .catch((err) => {
      process.stderr.write(`error: ${(err as Error).message}\n`);
      process.exit(1);
    });

  const rows = result.rows.slice(0, PLAIN_LIMIT);
  const colNames = cols.map((c) => c.name);
  const out = renderTable(colNames, rows as unknown as Record<string, unknown>[]);
  process.stdout.write(`${c.bold}${active.name} → ${table}${c.reset} (${c.dim}Cloudflare D1${c.reset})\n`);
  process.stdout.write(`${c.dim}${rows.length} of up to ${SAMPLE_LIMIT} rows shown${c.reset}\n\n`);
  process.stdout.write(out + "\n");
  if (result.rows.length > PLAIN_LIMIT) {
    process.stdout.write(
      `\n${c.dim}(showing first ${PLAIN_LIMIT} of ${result.rows.length}; run in a real terminal for full TUI)${c.reset}\n`,
    );
  }
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

  const app = render(
    <TableBrowser
      title={`${active.name} → ${table}  (Cloudflare D1)`}
      columns={columns}
      rows={result.rows}
      statusLine={`${result.rows.length} of up to ${SAMPLE_LIMIT} rows`}
    />,
    { exitOnCtrlC: true, patchConsole: false },
  );

  await app.waitUntilExit();
}
