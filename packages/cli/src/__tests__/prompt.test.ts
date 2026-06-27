import { describe, expect, it } from "bun:test";
import { applyFilterKey } from "../ui/prompt.ts";

describe("applyFilterKey", () => {
  it("appends printable characters", () => {
    expect(applyFilterKey("", { sequence: "a" }).value).toBe("a");
    expect(applyFilterKey("ab", { sequence: "c" }).value).toBe("abc");
  });

  it("ignores printable escape sequences (multi-byte)", () => {
    expect(applyFilterKey("ab", { sequence: "\x1b[A" }).value).toBe("ab");
    expect(applyFilterKey("ab", { sequence: "\x1b" }).value).toBe("ab");
  });

  it("backspace removes last char", () => {
    const r = applyFilterKey("abc", { name: "backspace" });
    expect(r.value).toBe("ab");
  });

  it("backspace on empty string is a no-op", () => {
    expect(applyFilterKey("", { name: "backspace" }).value).toBe("");
  });

  it("ctrl-u clears the buffer", () => {
    expect(applyFilterKey("hello", { ctrl: true, name: "u" }).value).toBe("");
  });

  it("enter does not mutate the value", () => {
    const r = applyFilterKey("abc", { name: "return" });
    expect(r.value).toBe("abc");
    expect(r.consumed, "caller can detect submit").toBe(true);
  });

  it("escape does not mutate the value", () => {
    const r = applyFilterKey("abc", { name: "escape" });
    expect(r.value).toBe("abc");
    expect(r.consumed).toBe(true);
  });

  it("unrelated named keys are ignored", () => {
    expect(applyFilterKey("ab", { name: "tab" }).value).toBe("ab");
    expect(applyFilterKey("ab", { name: "f1" }).value).toBe("ab");
  });
});
