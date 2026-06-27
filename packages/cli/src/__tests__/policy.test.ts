import { describe, expect, it } from "bun:test";
import { classifySql } from "../policy.ts";

describe("classifySql — safe", () => {
  it("classifies a plain SELECT as safe", () => {
    const r = classifySql("SELECT * FROM users");
    expect(r.level).toBe("safe");
    expect(r.operation).toBe("SELECT");
  });

  it("classifies PRAGMA as safe", () => {
    const r = classifySql("PRAGMA table_info(users)");
    expect(r.level).toBe("safe");
    expect(r.operation).toBe("PRAGMA");
  });

  it("classifies EXPLAIN as safe", () => {
    const r = classifySql("EXPLAIN SELECT * FROM users");
    expect(r.level).toBe("safe");
    expect(r.operation).toBe("EXPLAIN");
  });

  it("classifies WITH ... SELECT (CTE read) as safe", () => {
    const r = classifySql(
      "WITH active AS (SELECT * FROM users WHERE active=1) SELECT * FROM active",
    );
    expect(r.level).toBe("safe");
    expect(r.operation).toBe("SELECT");
  });

  it("classifies WITH RECURSIVE ... SELECT as safe", () => {
    const r = classifySql(
      "WITH RECURSIVE cnt(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM cnt WHERE n<5) SELECT * FROM cnt",
    );
    expect(r.level).toBe("safe");
    expect(r.operation).toBe("SELECT");
  });
});

describe("classifySql — confirm (data-modifying)", () => {
  it("classifies INSERT as confirm", () => {
    const r = classifySql("INSERT INTO users (name) VALUES ('x')");
    expect(r.level).toBe("confirm");
    expect(r.operation).toBe("INSERT");
  });

  it("classifies UPDATE as confirm", () => {
    const r = classifySql("UPDATE users SET name='x' WHERE id=1");
    expect(r.level).toBe("confirm");
    expect(r.operation).toBe("UPDATE");
  });

  it("classifies DELETE as confirm", () => {
    const r = classifySql("DELETE FROM users WHERE id=1");
    expect(r.level).toBe("confirm");
    expect(r.operation).toBe("DELETE");
  });

  it("classifies REPLACE as confirm", () => {
    const r = classifySql("REPLACE INTO users (id, name) VALUES (1, 'x')");
    expect(r.level).toBe("confirm");
    expect(r.operation).toBe("REPLACE");
  });
});

describe("classifySql — destructive (schema-modifying)", () => {
  it("classifies DROP as destructive", () => {
    const r = classifySql("DROP TABLE users");
    expect(r.level).toBe("destructive");
    expect(r.operation).toBe("DROP");
  });

  it("classifies TRUNCATE as destructive", () => {
    const r = classifySql("TRUNCATE TABLE users");
    expect(r.level).toBe("destructive");
    expect(r.operation).toBe("TRUNCATE");
  });

  it("classifies ALTER as destructive", () => {
    const r = classifySql("ALTER TABLE users ADD COLUMN email TEXT");
    expect(r.level).toBe("destructive");
    expect(r.operation).toBe("ALTER");
  });
});

describe("classifySql — multi-statement", () => {
  it("returns the most severe level across ;-separated statements", () => {
    const r = classifySql("SELECT 1; DROP TABLE users");
    expect(r.level).toBe("destructive");
    expect(r.operation).toBe("DROP");
  });

  it("promotes to confirm when a safe stmt is followed by a data-modifying stmt", () => {
    const r = classifySql("SELECT 1; INSERT INTO users (name) VALUES ('x')");
    expect(r.level).toBe("confirm");
    expect(r.operation).toBe("INSERT");
  });

  it("stays safe when all statements are safe", () => {
    const r = classifySql("SELECT 1; SELECT 2; PRAGMA table_info(users)");
    expect(r.level).toBe("safe");
  });

  it("ignores a trailing empty statement after the final semicolon", () => {
    const r = classifySql("SELECT 1;");
    expect(r.level).toBe("safe");
  });
});

describe("classifySql — leading comments", () => {
  it("skips a leading line comment before the first keyword", () => {
    const r = classifySql("-- get users\nSELECT * FROM users");
    expect(r.level).toBe("safe");
    expect(r.operation).toBe("SELECT");
  });

  it("skips a leading block comment before the first keyword", () => {
    const r = classifySql("/* TODO: review */ SELECT * FROM users");
    expect(r.level).toBe("safe");
    expect(r.operation).toBe("SELECT");
  });

  it("still classifies the real operation when a comment hides a destructive stmt", () => {
    const r = classifySql("-- oops\nDROP TABLE users");
    expect(r.level).toBe("destructive");
    expect(r.operation).toBe("DROP");
  });
});

describe("classifySql — WITH ... <data-modifying main>", () => {
  it("classifies WITH ... INSERT by its trailing INSERT (confirm)", () => {
    const r = classifySql(
      "WITH active AS (SELECT id FROM users WHERE active=1) INSERT INTO logs (uid) SELECT id FROM active",
    );
    expect(r.level).toBe("confirm");
    expect(r.operation).toBe("INSERT");
  });

  it("classifies WITH ... UPDATE by its trailing UPDATE (confirm)", () => {
    const r = classifySql(
      "WITH t AS (SELECT id FROM users) UPDATE users SET flag=1 WHERE id IN (SELECT id FROM t)",
    );
    expect(r.level).toBe("confirm");
    expect(r.operation).toBe("UPDATE");
  });

  it("classifies WITH ... DELETE by its trailing DELETE (confirm)", () => {
    const r = classifySql(
      "WITH t AS (SELECT id FROM old) DELETE FROM users WHERE id IN (SELECT id FROM t)",
    );
    expect(r.level).toBe("confirm");
    expect(r.operation).toBe("DELETE");
  });

  it("classifies multiple CTEs then INSERT by the trailing INSERT (confirm)", () => {
    const r = classifySql(
      "WITH a AS (SELECT 1), b AS (SELECT 2) INSERT INTO t (x) SELECT * FROM a",
    );
    expect(r.level).toBe("confirm");
    expect(r.operation).toBe("INSERT");
  });

  it("fail-safes to confirm when a WITH clause cannot be parsed", () => {
    const r = classifySql("WITH");
    expect(r.level).toBe("confirm");
    expect(r.operation).toBe("WITH");
  });
});
