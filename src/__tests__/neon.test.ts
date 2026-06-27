import { describe, expect, it } from "bun:test";
import { toDollarPlaceholders } from "../adaptors/neon.ts";

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
