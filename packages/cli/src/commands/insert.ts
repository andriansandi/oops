import * as p from "@clack/prompts";
import { ensureConfig, getActiveInstance } from "../core/config.ts";
import { buildAdaptor } from "@oops/core";
import { generateForm } from "../forms/generator.ts";
import { buildInsert, coerceValue } from "../forms/sql-builder.ts";
import { c } from "../ui/render.ts";

function truthyDefault(def: unknown): boolean {
  return def === true || def === 1 || def === "1" || def === "true";
}

export async function cmdInsert(table: string | undefined): Promise<void> {
  const cfg = ensureConfig();
  const active = getActiveInstance(cfg);
  if (!active) {
    p.log.warn("No active instance. Run `oops connect` or `oops use <name>`.");
    return;
  }
  if (!table) {
    p.log.error("Usage: oops insert <table>");
    process.exit(1);
  }

  p.intro(`Insert a row into ${c.bold}${table}${c.reset}`);

  const spin = p.spinner();
  spin.start(`Reading columns of ${table}…`);
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

  const form = generateForm(cols);
  const values: Record<string, unknown> = {};

  for (const f of form) {
    if (f.pk && f.fieldType === "integer") continue;
    if (f.fieldType === "boolean") {
      const val = await p.confirm({
        message: `${f.label}${f.required ? " *" : ""}`,
        initialValue: truthyDefault(f.default),
      });
      if (p.isCancel(val)) return p.cancel("Cancelled.");
      values[f.column] = val;
      continue;
    }
    const raw = await p.text({
      message: `${f.label}${f.required ? " *" : ""}`,
      placeholder: f.default != null ? String(f.default) : undefined,
      validate: (v) => {
        const r = coerceValue(f, v);
        return r.ok ? undefined : r.error;
      },
    });
    if (p.isCancel(raw)) return p.cancel("Cancelled.");
    if (String(raw).trim() === "") continue;
    const coerced = coerceValue(f, String(raw));
    if (!coerced.ok) continue;
    values[f.column] = coerced.value;
  }

  if (Object.keys(values).length === 0) {
    p.log.warn("No values provided — nothing to insert.");
    return;
  }

  let built;
  try {
    built = buildInsert(table, form, values);
  } catch (err) {
    p.log.error((err as Error).message);
    process.exit(1);
  }

  p.note(
    [`${c.dim}SQL:${c.reset}  ${built.sql}`, `${c.dim}vals:${c.reset} ${JSON.stringify(built.params)}`].join("\n"),
    "Preview",
  );

  const go = await p.confirm({ message: "Run this INSERT?" });
  if (p.isCancel(go) || !go) {
    p.log.info("Aborted.");
    return;
  }

  const spin2 = p.spinner();
  spin2.start("Inserting…");
  let result;
  try {
    result = await adaptor.query(built.sql, { params: built.params });
  } catch (err) {
    spin2.stop("Failed");
    p.log.error((err as Error).message);
    process.exit(1);
  }
  spin2.stop("Done");
  p.log.success(
    `Inserted 1 row${result.last_row_id != null ? ` (rowid: ${result.last_row_id})` : ""}.`,
  );
}
