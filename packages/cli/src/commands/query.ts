import * as p from "@clack/prompts";
import { ensureConfig, getActiveInstance } from "../core/config.ts";
import { buildAdaptor } from "@oops/core";
import { renderTable, c } from "../ui/render.ts";
import { classifySql } from "../policy.ts";

export async function cmdQuery(sql: string | undefined): Promise<void> {
  const cfg = ensureConfig();
  const active = getActiveInstance(cfg);
  if (!active) {
    p.log.warn("No active instance. Run `oops connect` or `oops use <name>`.");
    return;
  }
  if (!sql) {
    p.log.error("Usage: oops query \"SELECT 1\"");
    process.exit(1);
  }

  const { level, operation } = classifySql(sql);
  if (level !== "safe") {
    const destructive = level === "destructive";
    const label = destructive
      ? `${c.red}${c.bold}Destructive:${c.reset} ${operation} will modify schema. Proceed?`
      : `${c.yellow}Heads up:${c.reset} ${operation} modifies data. Proceed?`;
    const ok = await p.confirm({ message: label });
    if (p.isCancel(ok) || !ok) {
      p.log.info("Aborted.");
      return;
    }
  }

  const spin = p.spinner();
  spin.start("Running query…");
  const adaptor = buildAdaptor(active);
  let result;
  try {
    result = await adaptor.query(sql);
  } catch (err) {
    spin.stop("Failed");
    p.log.error((err as Error).message);
    process.exit(1);
  }
  spin.stop(
    `${result.rows.length} row(s) in ${result.duration_ms?.toFixed(2) ?? "?"}ms`,
  );

  if (result.columns.length === 0) {
    p.log.success(
      `Query OK${result.rows_written ? ` (${result.rows_written} row(s) written)` : ""}.`,
    );
    return;
  }

  const out = renderTable(result.columns, result.rows as Record<string, unknown>[]);
  p.note(out, `${active.name}`);
}
