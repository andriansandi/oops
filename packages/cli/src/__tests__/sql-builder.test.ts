import { describe, expect, it } from "bun:test";
import {
  buildInsert,
  buildUpdate,
  coerceValue,
  quoteIdent,
  type CoerceResult,
} from "../forms/sql-builder.ts";
import type { FieldSpec } from "../forms/generator.ts";

function field(over: Partial<FieldSpec> = {}): FieldSpec {
  return {
    column: "x",
    fieldType: "text",
    required: false,
    pk: false,
    default: null,
    label: "x",
    ...over,
  };
}

function okValue(r: CoerceResult): unknown {
  if (!r.ok) throw new Error("expected ok");
  return r.value;
}

describe("coerceValue — empty input", () => {
  it("empty + not required → null", () => {
    expect(okValue(coerceValue(field(), ""))).toBeNull();
    expect(okValue(coerceValue(field(), "   "))).toBeNull();
  });

  it("empty + required → error", () => {
    const r = coerceValue(field({ required: true, label: "Name" }), "");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("Name is required");
  });
});

describe("coerceValue — text", () => {
  it("trims text", () => {
    expect(okValue(coerceValue(field({ fieldType: "text" }), "  hi  "))).toBe("hi");
  });
});

describe("coerceValue — integer", () => {
  it("parses an integer", () => {
    expect(okValue(coerceValue(field({ fieldType: "integer" }), "42"))).toBe(42);
  });
  it("rejects a non-integer", () => {
    const r = coerceValue(field({ fieldType: "integer", label: "Age" }), "3.5");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("Age must be an integer");
  });
  it("rejects non-numeric", () => {
    expect(coerceValue(field({ fieldType: "integer" }), "abc").ok).toBe(false);
  });
});

describe("coerceValue — number", () => {
  it("parses a float", () => {
    expect(okValue(coerceValue(field({ fieldType: "number" }), "3.14"))).toBe(3.14);
  });
  it("rejects non-numeric", () => {
    const r = coerceValue(field({ fieldType: "number", label: "Price" }), "abc");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("Price must be a number");
  });
});

describe("coerceValue — json", () => {
  it("parses valid json", () => {
    expect(okValue(coerceValue(field({ fieldType: "json" }), '{"a":1}'))).toEqual({ a: 1 });
  });
  it("rejects invalid json", () => {
    const r = coerceValue(field({ fieldType: "json", label: "Meta" }), "{not json");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("Meta must be valid JSON");
  });
});

describe("coerceValue — boolean", () => {
  for (const [input, expected] of [
    ["true", true],
    ["1", true],
    ["yes", true],
    ["TRUE", true],
    ["false", false],
    ["0", false],
    ["no", false],
  ] as const) {
    it(`coerces "${input}" → ${expected}`, () => {
      expect(okValue(coerceValue(field({ fieldType: "boolean" }), input))).toBe(expected);
    });
  }
  it("rejects non-boolean text", () => {
    expect(coerceValue(field({ fieldType: "boolean" }), "maybe").ok).toBe(false);
  });
});

describe("quoteIdent", () => {
  it("quotes a valid identifier", () => {
    expect(quoteIdent("users")).toBe('"users"');
  });
  it("rejects an invalid identifier", () => {
    expect(() => quoteIdent("drop table")).toThrow();
    expect(() => quoteIdent("")).toThrow();
    expect(() => quoteIdent("1abc")).toThrow();
  });
});

describe("buildInsert", () => {
  it("builds parameterized INSERT in column order", () => {
    const fields = [
      field({ column: "name", fieldType: "text" }),
      field({ column: "age", fieldType: "integer" }),
    ];
    const r = buildInsert("users", fields, { name: "Alice", age: 30 });
    expect(r.sql).toBe('INSERT INTO "users" ("name", "age") VALUES (?, ?)');
    expect(r.params).toEqual(["Alice", 30]);
  });

  it("skips fields absent from values", () => {
    const fields = [
      field({ column: "a", fieldType: "text" }),
      field({ column: "b", fieldType: "text" }),
    ];
    const r = buildInsert("t", fields, { a: "x" });
    expect(r.sql).toBe('INSERT INTO "t" ("a") VALUES (?)');
    expect(r.params).toEqual(["x"]);
  });

  it("throws when no columns provided", () => {
    expect(() => buildInsert("t", [field({ column: "a" })], {})).toThrow();
  });

  it("rejects an invalid table name", () => {
    expect(() =>
      buildInsert("bad name", [field({ column: "a" })], { a: 1 }),
    ).toThrow();
  });
});

describe("buildUpdate", () => {
  it("builds parameterized UPDATE with SET then WHERE", () => {
    const fields = [
      field({ column: "id", fieldType: "integer", pk: true }),
      field({ column: "name", fieldType: "text" }),
    ];
    const r = buildUpdate("users", fields, { name: "Bob" }, "id", 1);
    expect(r.sql).toBe('UPDATE "users" SET "name" = ? WHERE "id" = ?');
    expect(r.params).toEqual(["Bob", 1]);
  });

  it("excludes the where column from SET", () => {
    const fields = [
      field({ column: "id", fieldType: "integer", pk: true }),
      field({ column: "name", fieldType: "text" }),
    ];
    const r = buildUpdate("users", fields, { id: 5, name: "Z" }, "id", 5);
    expect(r.sql).toBe('UPDATE "users" SET "name" = ? WHERE "id" = ?');
    expect(r.params).toEqual(["Z", 5]);
  });

  it("supports rowid as where column", () => {
    const fields = [field({ column: "name", fieldType: "text" })];
    const r = buildUpdate("t", fields, { name: "Y" }, "rowid", 7);
    expect(r.sql).toBe('UPDATE "t" SET "name" = ? WHERE "rowid" = ?');
    expect(r.params).toEqual(["Y", 7]);
  });

  it("throws when no settable columns", () => {
    const fields = [field({ column: "id", fieldType: "integer", pk: true })];
    expect(() => buildUpdate("t", fields, { id: 1 }, "id", 1)).toThrow();
  });
});
