import { describe, expect, it } from "bun:test";
import { createList } from "../ui/list.ts";

describe("list — state machine", () => {
  it("starts with index 0", () => {
    const l = createList(["a", "b", "c"]);
    expect(l.index).toBe(0);
    expect(l.offset).toBe(0);
  });

  it("moves down then up", () => {
    const l = createList(["a", "b", "c"]);
    l.next();
    expect(l.index).toBe(1);
    l.next();
    expect(l.index).toBe(2);
    l.next();
    expect(l.index, "clamps at end").toBe(2);
    l.prev();
    expect(l.index).toBe(1);
    l.prev();
    l.prev();
    expect(l.index, "clamps at start").toBe(0);
  });

  it("jumps to first / last", () => {
    const l = createList(["a", "b", "c", "d", "e"]);
    l.last();
    expect(l.index).toBe(4);
    l.first();
    expect(l.index).toBe(0);
  });

  it("clamps when items become empty", () => {
    const l = createList<string>([]);
    l.next();
    expect(l.index).toBe(0);
  });

  it("clamps after replace with fewer items", () => {
    const l = createList(["a", "b", "c", "d", "e"]);
    l.last();
    expect(l.index).toBe(4);
    l.setItems(["x", "y"]);
    expect(l.index, "resets to last available").toBe(1);
  });
});

describe("list — viewport (paginated scroll)", () => {
  it("scrolls down through a 20-item list with viewport 5", () => {
    const l = createList(
      Array.from({ length: 20 }, (_, i) => `item-${i}`),
      { viewport: 5 },
    );
    for (let i = 0; i < 4; i++) l.next();
    expect(l.index).toBe(4);
    expect(l.offset, "no scroll needed yet").toBe(0);
    l.next();
    expect(l.index).toBe(5);
    expect(l.offset, "offset advances to keep selection visible").toBe(1);
  });

  it("scrolls back up after going down", () => {
    const l = createList(
      Array.from({ length: 20 }, (_, i) => `i${i}`),
      { viewport: 5 },
    );
    for (let i = 0; i < 10; i++) l.next();
    expect(l.offset).toBeGreaterThan(0);
    for (let i = 0; i < 10; i++) l.prev();
    expect(l.offset, "offset returns to top").toBe(0);
    expect(l.index).toBe(0);
  });
});
