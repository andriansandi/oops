import { describe, expect, it } from "bun:test";

describe("bun test infra", () => {
  it("runs a passing test", () => {
    expect(1 + 1).toBe(2);
  });
});
