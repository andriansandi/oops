import { describe, expect, it } from "bun:test";
import { QueryTimeoutError, withTimeout } from "../core/adaptor.ts";

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
