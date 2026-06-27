import * as p from "@clack/prompts";
import { ensureConfig, getActiveInstance } from "../core/config.ts";
import { buildAdaptor } from "@oops/core";
import { renderTable } from "../ui/render.ts";

export async function cmdDescribe(table: string | undefined): Promise<void> {
  const cfg = ensureConfig();
  const active = getActiveInstance(cfg);
  if (!active) {
    p.log.warn("No active instance. Run `oops connect` or `oops use <name>`.");
    return;
  }
  if (!table) {
    p.log.error("Usage: oops describe <table>");
    process.exit(1);
  }

  const spin = p.spinner();
  spin.start(`Describing ${table}…`);
  const adaptor = buildAdaptor(active);
  let cols;
  try {
    cols = await adaptor.describeTable(table);
  } catch (err) {
    spin.stop("Failed");
    p.log.error((err as Error).message);
    process.exit(1);
  }
  spin.stop(`${cols.length} column(s)`);

  if (cols.length === 0) {
    p.log.info(`No columns for "${table}".`);
    return;
  }

  const rows = cols.map((c) => ({
    pk: c.pk ? "✓" : "",
    name: c.name,
    type: c.type,
    notnull: c.notnull ? "NOT NULL" : "",
    dflt: c.dflt_value === null || c.dflt_value === undefined ? "" : String(c.dflt_value),
  }));

  const out = renderTable(
    ["pk", "name", "type", "notnull", "dflt"],
    rows as unknown as Record<string, unknown>[],
  );
  p.note(out, `${active.name} — ${table}`);
}
