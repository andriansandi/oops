import { describe, expect, it } from "bun:test";
import {
  NeonAdaptor,
  toDollarPlaceholders,
  type InstanceMeta,
  type NeonCredentials,
} from "@oops/core";
import type { FullQueryResults } from "@neondatabase/serverless";

describe("toDollarPlaceholders", () => {
  it("leaves SQL unchanged when there are no params (raw query path)", () => {
    expect(toDollarPlaceholders("SELECT * FROM users", [])).toBe(
      "SELECT * FROM users",
    );
  });

  it("does not touch a literal '?' inside a raw query with no params", () => {
    expect(
      toDollarPlaceholders("SELECT * FROM t WHERE name = 'a?b'", []),
    ).toBe("SELECT * FROM t WHERE name = 'a?b'");
  });

  it("converts a single '?' to $1 when a param is supplied", () => {
    expect(
      toDollarPlaceholders('SELECT * FROM "t" WHERE id = ? LIMIT 1', [42]),
    ).toBe('SELECT * FROM "t" WHERE id = $1 LIMIT 1');
  });

  it("numbers placeholders in order across many '?'", () => {
    expect(
      toDollarPlaceholders(
        "INSERT INTO t (a, b, c) VALUES (?, ?, ?)",
        [1, 2, 3],
      ),
    ).toBe("INSERT INTO t (a, b, c) VALUES ($1, $2, $3)");
  });

  it("preserves existing $n placeholders and only swaps '?' (introspection path)", () => {
    expect(
      toDollarPlaceholders(
        "SELECT column_name FROM information_schema.columns WHERE table_name = $1",
        ["users"],
      ),
    ).toBe(
      "SELECT column_name FROM information_schema.columns WHERE table_name = $1",
    );
  });

  it("returns an empty string unchanged", () => {
    expect(toDollarPlaceholders("", [])).toBe("");
  });

  it("is pure: calling twice with the same args yields the same result", () => {
    const sql = "UPDATE t SET a = ?, b = ? WHERE id = ?";
    const params = [1, 2, 3];
    expect(toDollarPlaceholders(sql, params)).toBe(
      "UPDATE t SET a = $1, b = $2 WHERE id = $3",
    );
    expect(toDollarPlaceholders(sql, params)).toBe(
      "UPDATE t SET a = $1, b = $2 WHERE id = $3",
    );
  });
});

describe("NeonAdaptor.describeTable", () => {
  const instance: InstanceMeta = {
    id: "inst-1",
    name: "test-neon",
    type: "neon",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  const creds: NeonCredentials = {
    connectionString: "postgres://user:pass@host/db",
  };

  function makeFakeSql() {
    const calls: { query: string; params: unknown[] }[] = [];
    const sql = {
      query: (
        query: string,
        params: unknown[] = [],
      ): Promise<FullQueryResults<false>> => {
        calls.push({ query, params });
        let rows: Record<string, unknown>[] = [];
        if (query.includes("information_schema.columns")) {
          rows = [
            {
              column_name: "id",
              data_type: "integer",
              is_nullable: "NO",
              column_default: null,
            },
            {
              column_name: "label",
              data_type: "text",
              is_nullable: "YES",
              column_default: null,
            },
          ];
        } else if (query.includes("PRIMARY KEY")) {
          rows = [{ column_name: "id" }];
        }
        const result: FullQueryResults<false> = {
          fields: [],
          command: "SELECT",
          rowCount: rows.length,
          rows,
          rowAsArray: false,
        };
        return Promise.resolve(result);
      },
    };
    return { sql, calls };
  }

  it("introspects a kebab-case name the old guard would have rejected", async () => {
    const { sql, calls } = makeFakeSql();
    const adaptor = new NeonAdaptor(instance, creds, sql);
    const cols = await adaptor.describeTable("my-table");
    expect(cols).toEqual([
      { name: "id", type: "integer", notnull: true, pk: true, dflt_value: null },
      { name: "label", type: "text", notnull: false, pk: false, dflt_value: null },
    ]);
    expect(calls.length).toBe(2);
    expect(calls.every((c) => c.params[0] === "my-table")).toBe(true);
    expect(calls.every((c) => !c.query.includes("my-table"))).toBe(true);
  });

  it("introspects a unicode table name without throwing", async () => {
    const { sql } = makeFakeSql();
    const adaptor = new NeonAdaptor(instance, creds, sql);
    const cols = await adaptor.describeTable("café-tablé");
    expect(cols.map((c) => c.name)).toEqual(["id", "label"]);
  });
});
