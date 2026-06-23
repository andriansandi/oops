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
    expect(r.operation).toBe("WITH");
  });
});

describe("classifySql — confirm (data-modifying)", () => {
  it("classifies INSERT as confirm", () => {
    const r = classifySql("INSERT INTO users (name) VALUES ('x')");
    expect(r.level).toBe("confirm");
    expect(r.operation).toBe("INSERT");
  });
});
