import { describe, expect, it } from "bun:test";
import { cursor, style, strip } from "../ui/ansi.ts";

describe("ansi.strip", () => {
  it("removes known escape sequences", () => {
    expect(strip("\x1b[31mhello\x1b[0m")).toBe("hello");
    expect(strip("\x1b[2;37;40mfoo\x1b[0m bar")).toBe("foo bar");
  });
  it("returns plain strings unchanged", () => {
    expect(strip("plain text")).toBe("plain text");
    expect(strip("")).toBe("");
  });
});

describe("style", () => {
  it("wraps text in the right escape codes", () => {
    expect(style.bold("x")).toBe("\x1b[1mx\x1b[0m");
    expect(style.dim("x")).toBe("\x1b[2mx\x1b[0m");
    expect(style.red("x")).toBe("\x1b[31mx\x1b[0m");
    expect(style.green("x")).toBe("\x1b[32mx\x1b[0m");
    expect(style.yellow("x")).toBe("\x1b[33mx\x1b[0m");
    expect(style.cyan("x")).toBe("\x1b[36mx\x1b[0m");
    expect(style.gray("x")).toBe("\x1b[90mx\x1b[0m");
  });
  it("strips cleanly round-trip", () => {
    expect(strip(style.red("error: " + "bad"))).toBe("error: bad");
  });
});

describe("cursor", () => {
  it("hide / show", () => {
    expect(cursor.hide()).toBe("\x1b[?25l");
    expect(cursor.show()).toBe("\x1b[?25h");
  });
  it("save / restore", () => {
    expect(cursor.save()).toBe("\x1b[s");
    expect(cursor.restore()).toBe("\x1b[u");
  });
  it("clearLine clears the whole line", () => {
    expect(cursor.clearLine()).toBe("\x1b[2K");
  });
  it("moveUp / moveDown", () => {
    expect(cursor.moveUp(1)).toBe("\x1b[1A");
    expect(cursor.moveUp(3)).toBe("\x1b[3A");
    expect(cursor.moveDown(2)).toBe("\x1b[2B");
  });
  it("to jumps to row,col (1-indexed)", () => {
    expect(cursor.to(1, 1)).toBe("\x1b[1;1H");
    expect(cursor.to(12, 40)).toBe("\x1b[12;40H");
  });
});
