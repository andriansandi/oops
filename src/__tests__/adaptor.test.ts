import { describe, expect, it } from "bun:test";
import {
  INTERNAL_D1_PATTERNS,
  QueryTimeoutError,
  isInternalD1Name,
  withTimeout,
} from "../core/adaptor.ts";

describe("withTimeout", () => {
  it("resolves with the value when the promise settles under the deadline", async () => {
    expect(await withTimeout(Promise.resolve(42), 1000)).toBe(42);
  });

  it("rejects with QueryTimeoutError when the deadline elapses first", async () => {
    const never = new Promise<string>(() => {});
    await expect(withTimeout(never, 20)).rejects.toBeInstanceOf(
      QueryTimeoutError,
    );
  });

  it("the timeout error message carries the elapsed ms", async () => {
    const never = new Promise<string>(() => {});
    await expect(withTimeout(never, 25)).rejects.toThrow(
      /Query exceeded 25ms timeout/,
    );
  });

  it("propagates the promise's own rejection (and clears the timer)", async () => {
    await expect(
      withTimeout(Promise.reject(new Error("boom")), 1000),
    ).rejects.toThrow("boom");
  });

  it("rejects with Aborted when an external AbortSignal fires", async () => {
    const ac = new AbortController();
    const never = new Promise<string>(() => {});
    const p = withTimeout(never, 1000, ac.signal);
    setTimeout(() => ac.abort(), 10);
    await expect(p).rejects.toThrow("Aborted");
  });

  it("rejects immediately when the external signal is already aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(
      withTimeout(Promise.resolve("late"), 1000, ac.signal),
    ).rejects.toThrow("Aborted");
  });
});

describe("isInternalD1Name", () => {
  it("flags the Cloudflare-internal D1 table names", () => {
    for (const name of ["_cf_KV", "_cf_METADATA", "_cf_METADATA_KEY"]) {
      expect(isInternalD1Name(name)).toBe(true);
    }
  });

  it("flags d1_migrations and the sqlite_ family", () => {
    expect(isInternalD1Name("d1_migrations")).toBe(true);
    expect(isInternalD1Name("sqlite_sequence")).toBe(true);
    expect(isInternalD1Name("sqlite_schema")).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(isInternalD1Name("D1_MIGRATIONS")).toBe(true);
    expect(isInternalD1Name("_CF_KV")).toBe(true);
    expect(isInternalD1Name("SQLITE_sequence")).toBe(true);
  });

  it("does not flag ordinary user tables", () => {
    for (const name of ["users", "orders", "my_table", "audit_log"]) {
      expect(isInternalD1Name(name)).toBe(false);
    }
  });

  it("requires an exact match for the fixed names (not a prefix)", () => {
    expect(isInternalD1Name("_cf_KV_extra")).toBe(false);
    expect(isInternalD1Name("d1_migrations_backup")).toBe(false);
  });

  it("exposes the INTERNAL_D1_PATTERNS list", () => {
    expect(INTERNAL_D1_PATTERNS.length).toBe(5);
  });
});
