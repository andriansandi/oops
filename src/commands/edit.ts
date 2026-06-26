import * as p from "@clack/prompts";
import { ensureConfig, getActiveInstance } from "../core/config.ts";
import { buildAdaptor } from "../core/adaptor-factory.ts";
import { generateForm, type FieldSpec } from "../forms/generator.ts";
import { buildUpdate, coerceValue } from "../forms/sql-builder.ts";
import { renderTable, c } from "../ui/render.ts";

function truthy(v: unknown): boolean {
  return v === true || v === 1 || v === "1" || v === "true";
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export async function cmdEdit(table: string | undefined): Promise<void> {
  const cfg = ensureConfig();
  const active = getActiveInstance(cfg);
  if (!active) {
    p.log.warn("No active instance. Run `oops connect` or `oops use <name>`.");
    return;
  }
  if (!table) {
    p.log.error("Usage: oops edit <table>");
    process.exit(1);
  }

  p.intro(`Edit a row in ${c.bold}${table}${c.reset}`);

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
  const pkField = form.find((f) => f.pk);
  const whereCol = pkField?.column ?? "rowid";
  const whereField: FieldSpec =
    pkField ?? {
      column: "rowid",
      fieldType: "integer",
      required: true,
      pk: true,
      default: null,
      label: "rowid",
    };

  const whereRaw = await p.text({
    message: `Find row by ${c.bold}${whereCol}${c.reset} =`,
    validate: (v) => {
      const r = coerceValue(whereField, v);
      return r.ok ? undefined : r.error;
    },
  });
  if (p.isCancel(whereRaw)) return p.cancel("Cancelled.");
  const whereCoerced = coerceValue(whereField, String(whereRaw));
  if (!whereCoerced.ok) {
    p.log.error(whereCoerced.error);
    process.exit(1);
  }
  const whereVal = whereCoerced.value;

  const spin2 = p.spinner();
  spin2.start("Fetching row…");
  let row: Record<string, unknown> | null;
  try {
    const res = await adaptor.query<Record<string, unknown>>(
      `SELECT * FROM "${table}" WHERE "${whereCol}" = ? LIMIT 1`,
      { params: [whereVal] },
    );
    row = res.rows[0] ?? null;
  } catch (err) {
    spin2.stop("Failed");
    p.log.error((err as Error).message);
    process.exit(1);
  }
  spin2.stop("Done");
  if (!row) {
    p.log.error(`No row where ${whereCol} = ${JSON.stringify(whereVal)}.`);
    process.exit(1);
  }

  p.note(renderTable(Object.keys(row), [row]), `Current — ${table}`);

  const values: Record<string, unknown> = {};
  for (const f of form) {
    if (f.column === whereCol) continue;
    const current = row[f.column];
    if (f.fieldType === "boolean") {
      const val = await p.confirm({
        message: `${f.label}`,
        initialValue: truthy(current),
      });
      if (p.isCancel(val)) return p.cancel("Cancelled.");
      if (!deepEqual(val, truthy(current))) values[f.column] = val;
      continue;
    }
    const raw = await p.text({
      message: `${f.label}`,
      initialValue: current === null || current === undefined ? "" : String(current),
      validate: (v) => {
        const r = coerceValue(f, v);
        return r.ok ? undefined : r.error;
      },
    });
    if (p.isCancel(raw)) return p.cancel("Cancelled.");
    const coerced = coerceValue(f, String(raw));
    if (!coerced.ok) continue;
    if (!deepEqual(coerced.value, current === null || current === undefined ? null : current)) {
      values[f.column] = coerced.value;
    }
  }

  if (Object.keys(values).length === 0) {
    p.log.info("No changes.");
    return;
  }

  let built;
  try {
    built = buildUpdate(table, form, values, whereCol, whereVal);
  } catch (err) {
    p.log.error((err as Error).message);
    process.exit(1);
  }

  p.note(
    [`${c.dim}SQL:${c.reset}  ${built.sql}`, `${c.dim}vals:${c.reset} ${JSON.stringify(built.params)}`].join("\n"),
    "Preview",
  );

  const go = await p.confirm({ message: "Run this UPDATE?" });
  if (p.isCancel(go) || !go) {
    p.log.info("Aborted.");
    return;
  }

  const spin3 = p.spinner();
  spin3.start("Updating…");
  let result;
  try {
    result = await adaptor.query(built.sql, { params: built.params });
  } catch (err) {
    spin3.stop("Failed");
    p.log.error((err as Error).message);
    process.exit(1);
  }
  spin3.stop("Done");
  p.log.success(
    `Updated ${result.rows_written ?? 1} row(s).`,
  );
}
