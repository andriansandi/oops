import { describe, expect, it } from "bun:test";
import { browseKeyReducer, type BrowseState } from "../commands/browse.ts";

const cols = [
  { key: "id", label: "id 🔑", width: 8, type: "INTEGER", pk: true, notnull: true },
  { key: "name", label: "name", width: 16, type: "TEXT", pk: false, notnull: true },
  { key: "email", label: "email", width: 24, type: "TEXT", pk: false, notnull: false },
];

const rows = [
  { id: 1, name: "Alice", email: "alice@example.com" },
  { id: 2, name: "Bob", email: "bob@test.io" },
  { id: 3, name: "Carol", email: "carol@hello.dev" },
  { id: 4, name: "Dave", email: null },
];

function makeState(overrides: Partial<BrowseState> = {}): BrowseState {
  return {
    columns: cols,
    rows,
    indices: rows.map((_, i) => i),
    index: 0,
    filter: "",
    filterMode: false,
    hScroll: 0,
    detail: false,
    detailView: "table",
    status: null,
    title: "test",
    ...overrides,
  };
}

describe("browseKeyReducer — list navigation", () => {
  it("down / up", () => {
    let s = makeState();
    s = browseKeyReducer(s, { name: "down" }).state;
    expect(s.index).toBe(1);
    s = browseKeyReducer(s, { name: "down" }).state;
    expect(s.index).toBe(2);
    s = browseKeyReducer(s, { name: "up" }).state;
    expect(s.index).toBe(1);
    s = browseKeyReducer(s, { name: "up" }).state;
    s = browseKeyReducer(s, { name: "up" }).state;
    expect(s.index, "clamps at 0").toBe(0);
  });

  it("q exits", () => {
    expect(browseKeyReducer(makeState(), { sequence: "q" }).exit).toBe(true);
  });
});

describe("browseKeyReducer — filter", () => {
  it("'/' enters filter mode", () => {
    const r = browseKeyReducer(makeState(), { sequence: "/" });
    expect(r.state.filterMode).toBe(true);
  });

  it("typing builds the filter", () => {
    let s = makeState();
    s = browseKeyReducer(s, { sequence: "/" }).state;
    s = browseKeyReducer(s, { sequence: "a" }).state;
    s = browseKeyReducer(s, { sequence: "l" }).state;
    s = browseKeyReducer(s, { sequence: "i" }).state;
    expect(s.filter).toBe("ali");
  });

  it("return applies filter to indices", () => {
    let s = makeState();
    s = browseKeyReducer(s, { sequence: "/" }).state;
    s = browseKeyReducer(s, { sequence: "a" }).state;
    s = browseKeyReducer(s, { sequence: "l" }).state;
    s = browseKeyReducer(s, { sequence: "i" }).state;
    s = browseKeyReducer(s, { name: "return" }).state;
    expect(s.filterMode).toBe(false);
    expect(s.filter).toBe("ali");
    expect(s.indices).toEqual([0]);
  });

  it("escape in filter mode cancels without applying", () => {
    let s = makeState();
    s = browseKeyReducer(s, { sequence: "/" }).state;
    s = browseKeyReducer(s, { sequence: "x" }).state;
    s = browseKeyReducer(s, { name: "escape" }).state;
    expect(s.filterMode).toBe(false);
    expect(s.filter).toBe("");
    expect(s.indices).toEqual([0, 1, 2, 3]);
  });

  it("filter matches across columns case-insensitively", () => {
    let s = makeState();
    s = browseKeyReducer(s, { sequence: "/" }).state;
    s = browseKeyReducer(s, { sequence: "B" }).state;
    s = browseKeyReducer(s, { sequence: "O" }).state;
    s = browseKeyReducer(s, { sequence: "B" }).state;
    s = browseKeyReducer(s, { name: "return" }).state;
    expect(s.indices).toEqual([1]);
  });
});

describe("browseKeyReducer — detail panel", () => {
  it("enter opens detail", () => {
    const r = browseKeyReducer(makeState(), { name: "return" });
    expect(r.state.detail).toBe(true);
  });

  it("tab toggles detail view", () => {
    let s = makeState({ detail: true });
    expect(s.detailView).toBe("table");
    s = browseKeyReducer(s, { name: "tab" }).state;
    expect(s.detailView).toBe("raw");
    s = browseKeyReducer(s, { name: "tab" }).state;
    expect(s.detailView).toBe("table");
  });

  it("escape closes detail", () => {
    let s = makeState({ detail: true });
    s = browseKeyReducer(s, { name: "escape" }).state;
    expect(s.detail).toBe(false);
  });

  it("← / → scrolls hScroll within detail", () => {
    let s = makeState({ detail: true });
    s = browseKeyReducer(s, { name: "right" }).state;
    expect(s.hScroll).toBe(1);
    s = browseKeyReducer(s, { name: "right" }).state;
    s = browseKeyReducer(s, { name: "right" }).state;
    expect(s.hScroll, "clamps at last column").toBe(2);
    s = browseKeyReducer(s, { name: "left" }).state;
    expect(s.hScroll).toBe(1);
    s = browseKeyReducer(s, { name: "left" }).state;
    s = browseKeyReducer(s, { name: "left" }).state;
    expect(s.hScroll, "clamps at 0").toBe(0);
  });
});

describe("browseKeyReducer — esc stepwise", () => {
  it("from detail → closes detail", () => {
    const s = makeState({ detail: true });
    expect(browseKeyReducer(s, { name: "escape" }).state.detail).toBe(false);
  });
  it("from filtered → clears filter", () => {
    const s = makeState({ filter: "x", indices: [0, 2] });
    const r = browseKeyReducer(s, { name: "escape" });
    expect(r.state.filter).toBe("");
    expect(r.state.indices).toEqual([0, 1, 2, 3]);
  });
  it("from clean → exits", () => {
    expect(browseKeyReducer(makeState(), { name: "escape" }).exit).toBe(true);
  });
});
