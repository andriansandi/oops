import { describe, expect, it } from "bun:test";
import {
  tablesKeyReducer,
  type TablesState,
  type ColumnWithSample,
} from "../commands/tables.ts";
import { createList } from "../ui/list.ts";

const sampleTable = (name: string, rest: Partial<{ type: "table" | "view"; rowCount: number | null; internal: boolean; sql: string | null }> = {}) => ({
  name,
  type: "table" as const,
  rowCount: 0,
  sql: `CREATE TABLE ${name} (id INTEGER PRIMARY KEY)`,
  ...rest,
});

function makeState(overrides: Partial<TablesState> = {}): TablesState {
  const all = [
    sampleTable("events", { rowCount: 209 }),
    sampleTable("cities", { rowCount: 5 }),
    sampleTable("users", { rowCount: 12, type: "view" }),
    sampleTable("_cf_KV", { rowCount: null, internal: true }),
  ];
  return {
    list: createList(all, { viewport: 5 }),
    allTables: all,
    tab: "info",
    search: "",
    searchMode: false,
    columnCache: new Map(),
    columnIndex: 0,
    picked: null,
    status: null,
    title: "test",
    ...overrides,
  };
}

describe("tablesKeyReducer — navigation", () => {
  it("down moves the selection", () => {
    const s = makeState();
    const r = tablesKeyReducer(s, { name: "down" });
    expect(r.exit).toBe(false);
    expect(r.state.list.index).toBe(1);
  });

  it("up at top stays at top", () => {
    const s = makeState();
    const r = tablesKeyReducer(s, { name: "up" });
    expect(r.state.list.index).toBe(0);
  });

  it("enter on info tab picks the table and exits", () => {
    const s = makeState();
    const r = tablesKeyReducer(s, { name: "return" });
    expect(r.exit).toBe(true);
    expect(r.state.picked).toBe("events");
  });

  it("q exits", () => {
    const r = tablesKeyReducer(makeState(), { sequence: "q" });
    expect(r.exit).toBe(true);
  });
});

describe("tablesKeyReducer — tab cycling", () => {
  it("tab cycles info → columns → sql → info", () => {
    let s = makeState();
    s = tablesKeyReducer(s, { name: "tab" }).state;
    expect(s.tab).toBe("columns");
    s = tablesKeyReducer(s, { name: "tab" }).state;
    expect(s.tab).toBe("sql");
    s = tablesKeyReducer(s, { name: "tab" }).state;
    expect(s.tab).toBe("info");
  });
});

describe("tablesKeyReducer — esc stepwise", () => {
  it("from sql tab returns to info", () => {
    const s = makeState({ tab: "sql" });
    const r = tablesKeyReducer(s, { name: "escape" });
    expect(r.state.tab).toBe("info");
    expect(r.exit).toBe(false);
  });

  it("from info with search clears the search", () => {
    const s = makeState({ search: "ev" });
    const r = tablesKeyReducer(s, { name: "escape" });
    expect(r.state.search).toBe("");
    expect(r.exit).toBe(false);
  });

  it("from info with no search exits", () => {
    const r = tablesKeyReducer(makeState(), { name: "escape" });
    expect(r.exit).toBe(true);
  });
});

describe("tablesKeyReducer — search mode", () => {
  it("'/' enters search mode", () => {
    const r = tablesKeyReducer(makeState(), { sequence: "/" });
    expect(r.state.searchMode).toBe(true);
  });

  it("typing filters the list", () => {
    let s = makeState();
    s = tablesKeyReducer(s, { sequence: "/" }).state;
    s = tablesKeyReducer(s, { sequence: "e" }).state;
    s = tablesKeyReducer(s, { sequence: "v" }).state;
    expect(s.search).toBe("ev");
    expect(s.list.items.map((t) => t.name)).toContain("events");
    expect(s.list.items.map((t) => t.name)).not.toContain("cities");
  });

  it("backspace removes a char and un-filters", () => {
    let s = makeState();
    s = tablesKeyReducer(s, { sequence: "/" }).state;
    s = tablesKeyReducer(s, { sequence: "e" }).state;
    s = tablesKeyReducer(s, { sequence: "v" }).state;
    s = tablesKeyReducer(s, { name: "backspace" }).state;
    expect(s.search).toBe("e");
  });

  it("escape in search mode cancels (clears search, leaves mode)", () => {
    let s = makeState();
    s = tablesKeyReducer(s, { sequence: "/" }).state;
    s = tablesKeyReducer(s, { sequence: "x" }).state;
    s = tablesKeyReducer(s, { name: "escape" }).state;
    expect(s.searchMode).toBe(false);
    expect(s.search).toBe("");
  });

  it("return in search mode applies the filter and exits search", () => {
    let s = makeState();
    s = tablesKeyReducer(s, { sequence: "/" }).state;
    s = tablesKeyReducer(s, { sequence: "u" }).state;
    s = tablesKeyReducer(s, { sequence: "s" }).state;
    s = tablesKeyReducer(s, { name: "return" }).state;
    expect(s.searchMode).toBe(false);
    expect(s.search).toBe("us");
    expect(s.list.items.map((t) => t.name)).toEqual(["users"]);
  });
});

describe("tablesKeyReducer — columns tab", () => {
  const withColumns = (): TablesState => {
    const cache = new Map<string, { status: "ok"; columns: ColumnWithSample[] }>();
    cache.set("events", {
      status: "ok",
      columns: [
        { name: "id", type: "INTEGER", pk: true, notnull: true, dflt_value: null, sample: 1 },
        { name: "name", type: "TEXT", pk: false, notnull: true, dflt_value: null, sample: "x" },
        { name: "created_at", type: "TEXT", pk: false, notnull: false, dflt_value: null, sample: null },
      ],
    });
    return makeState({ tab: "columns", columnCache: cache, columnIndex: 0 });
  };

  it("down / up navigates within the columns list", () => {
    let s = withColumns();
    s = tablesKeyReducer(s, { name: "down" }).state;
    expect(s.columnIndex).toBe(1);
    s = tablesKeyReducer(s, { name: "down" }).state;
    expect(s.columnIndex).toBe(2);
    s = tablesKeyReducer(s, { name: "down" }).state;
    expect(s.columnIndex, "clamps at end").toBe(2);
    s = tablesKeyReducer(s, { name: "up" }).state;
    expect(s.columnIndex).toBe(1);
  });

  it("enter on a column populates status", () => {
    const r = tablesKeyReducer(withColumns(), { name: "return" });
    expect(r.state.status).toContain("id");
    expect(r.state.status).toContain("INTEGER");
  });
});
