import type { FieldSpec } from "./generator.ts";

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function quoteIdent(name: string): string {
  if (!IDENT_RE.test(name)) {
    throw new Error(`Invalid identifier: ${name}`);
  }
  return `"${name}"`;
}

export interface CoerceOk {
  ok: true;
  value: unknown;
}
export interface CoerceErr {
  ok: false;
  error: string;
}
export type CoerceResult = CoerceOk | CoerceErr;

export function coerceValue(field: FieldSpec, raw: string): CoerceResult {
  const trimmed = raw.trim();
  if (trimmed === "") {
    if (field.required) {
      return { ok: false, error: `${field.label} is required` };
    }
    return { ok: true, value: null };
  }
  switch (field.fieldType) {
    case "integer": {
      const n = Number(trimmed);
      if (!Number.isInteger(n)) {
        return { ok: false, error: `${field.label} must be an integer` };
      }
      return { ok: true, value: n };
    }
    case "number": {
      const n = Number(trimmed);
      if (Number.isNaN(n)) {
        return { ok: false, error: `${field.label} must be a number` };
      }
      return { ok: true, value: n };
    }
    case "json": {
      try {
        return { ok: true, value: JSON.parse(trimmed) };
      } catch {
        return { ok: false, error: `${field.label} must be valid JSON` };
      }
    }
    case "boolean": {
      const low = trimmed.toLowerCase();
      if (low === "true" || low === "1" || low === "yes") {
        return { ok: true, value: true };
      }
      if (low === "false" || low === "0" || low === "no") {
        return { ok: true, value: false };
      }
      return { ok: false, error: `${field.label} must be true or false` };
    }
    case "text":
    default:
      return { ok: true, value: trimmed };
  }
}

export interface BuiltSql {
  sql: string;
  params: unknown[];
}

function own(o: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, key);
}

export function buildInsert(
  table: string,
  fields: FieldSpec[],
  values: Record<string, unknown>,
): BuiltSql {
  const cols = fields.filter((f) => own(values, f.column)).map((f) => f.column);
  if (cols.length === 0) {
    throw new Error("No columns to insert");
  }
  const colList = cols.map(quoteIdent).join(", ");
  const placeholders = cols.map(() => "?").join(", ");
  const params = cols.map((c) => values[c]);
  return {
    sql: `INSERT INTO ${quoteIdent(table)} (${colList}) VALUES (${placeholders})`,
    params,
  };
}

export function buildUpdate(
  table: string,
  fields: FieldSpec[],
  values: Record<string, unknown>,
  whereCol: string,
  whereVal: unknown,
): BuiltSql {
  const cols = fields
    .filter((f) => f.column !== whereCol && own(values, f.column))
    .map((f) => f.column);
  if (cols.length === 0) {
    throw new Error("No columns to update");
  }
  const setList = cols.map((c) => `${quoteIdent(c)} = ?`).join(", ");
  const params = [...cols.map((c) => values[c]), whereVal];
  return {
    sql: `UPDATE ${quoteIdent(table)} SET ${setList} WHERE ${quoteIdent(whereCol)} = ?`,
    params,
  };
}
