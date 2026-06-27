import { describe, expect, it } from "bun:test";
import { generateForm } from "../forms/generator.ts";
import type { ColumnInfo } from "@oops/core";

function col(over: Partial<ColumnInfo> = {}): ColumnInfo {
  return {
    name: "x",
    type: "TEXT",
    notnull: false,
    pk: false,
    dflt_value: null,
    ...over,
  };
}

describe("generateForm — type mapping", () => {
  it("maps TEXT to text", () => {
    const [f] = generateForm([col({ name: "title", type: "TEXT" })]);
    expect(f.fieldType).toBe("text");
  });

  it("maps VARCHAR(n) to text", () => {
    const [f] = generateForm([col({ name: "email", type: "VARCHAR(255)" })]);
    expect(f.fieldType).toBe("text");
  });

  it("maps INTEGER to integer", () => {
    const [f] = generateForm([col({ name: "age", type: "INTEGER" })]);
    expect(f.fieldType).toBe("integer");
  });

  it("maps REAL to number", () => {
    const [f] = generateForm([col({ name: "price", type: "REAL" })]);
    expect(f.fieldType).toBe("number");
  });

  it("maps NUMERIC to number", () => {
    const [f] = generateForm([col({ name: "amount", type: "NUMERIC" })]);
    expect(f.fieldType).toBe("number");
  });

  it("maps DECIMAL to number", () => {
    const [f] = generateForm([col({ name: "total", type: "DECIMAL(10,2)" })]);
    expect(f.fieldType).toBe("number");
  });

  it("maps BOOLEAN to boolean", () => {
    const [f] = generateForm([col({ name: "active", type: "BOOLEAN" })]);
    expect(f.fieldType).toBe("boolean");
  });

  it("maps JSON to json", () => {
    const [f] = generateForm([col({ name: "meta", type: "JSON" })]);
    expect(f.fieldType).toBe("json");
  });

  it("falls back to text for an unknown type", () => {
    const [f] = generateForm([col({ name: "blob", type: "BLOB" })]);
    expect(f.fieldType).toBe("text");
  });

  it("falls back to text when the type is empty", () => {
    const [f] = generateForm([col({ name: "bare", type: "" })]);
    expect(f.fieldType).toBe("text");
  });
});

describe("generateForm — required", () => {
  it("is required when NOT NULL and no default", () => {
    const [f] = generateForm([col({ name: "title", notnull: true, dflt_value: null })]);
    expect(f.required).toBe(true);
  });

  it("is required when NOT NULL and default is undefined", () => {
    const [f] = generateForm([col({ name: "title", notnull: true, dflt_value: undefined })]);
    expect(f.required).toBe(true);
  });

  it("is not required when NOT NULL but has a default", () => {
    const [f] = generateForm([col({ name: "status", notnull: true, dflt_value: "'draft'" })]);
    expect(f.required).toBe(false);
  });

  it("is not required when nullable (even without a default)", () => {
    const [f] = generateForm([col({ name: "note", notnull: false, dflt_value: null })]);
    expect(f.required).toBe(false);
  });

  it("is not required when nullable with a default", () => {
    const [f] = generateForm([col({ name: "note", notnull: false, dflt_value: "'x'" })]);
    expect(f.required).toBe(false);
  });

  it("carries the default through to the field spec", () => {
    const [f] = generateForm([col({ name: "status", dflt_value: "'draft'" })]);
    expect(f.default).toBe("'draft'");
  });
});
