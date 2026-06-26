import type { ColumnInfo } from "../core/adaptor.ts";

export type FieldType = "text" | "integer" | "number" | "boolean" | "json";

export interface FieldSpec {
  column: string;
  fieldType: FieldType;
  required: boolean;
  pk: boolean;
  default: unknown;
  label: string;
}

function mapFieldType(declared: string): FieldType {
  const t = declared.toUpperCase().replace(/\([^)]*\)/g, "").trim();
  if (t.includes("BOOL")) return "boolean";
  if (t.includes("JSON")) return "json";
  if (t.includes("INT")) return "integer";
  if (t.includes("CHAR") || t.includes("CLOB") || t.includes("TEXT")) return "text";
  if (t.includes("REAL") || t.includes("FLOA") || t.includes("DOUB")) return "number";
  if (t.includes("NUM") || t.includes("DEC")) return "number";
  return "text";
}

export function generateForm(columns: ColumnInfo[]): FieldSpec[] {
  return columns.map((c) => ({
    column: c.name,
    fieldType: mapFieldType(c.type),
    required: c.notnull && (c.dflt_value === null || c.dflt_value === undefined),
    pk: c.pk,
    default: c.dflt_value,
    label: c.name,
  }));
}
