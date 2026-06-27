export interface ListOptions {
  viewport?: number;
  index?: number;
  offset?: number;
}

export interface List<T> {
  readonly items: readonly T[];
  readonly index: number;
  readonly offset: number;
  readonly viewport: number;
  next(): void;
  prev(): void;
  first(): void;
  last(): void;
  setItems(items: readonly T[]): void;
  setIndex(i: number): void;
}

export function createList<T>(
  items: readonly T[],
  opts: ListOptions = {},
): List<T> {
  const viewport = Math.max(1, opts.viewport ?? 10);
  let state: { items: T[]; index: number; offset: number } = {
    items: [...items],
    index: clamp(opts.index ?? 0, 0, Math.max(0, items.length - 1)),
    offset: Math.max(0, opts.offset ?? 0),
  };

  function adjustOffset() {
    if (state.index < state.offset) {
      state.offset = state.index;
    } else if (state.index >= state.offset + viewport) {
      state.offset = state.index - viewport + 1;
    }
    if (state.offset < 0) state.offset = 0;
  }

  return {
    get items() {
      return state.items;
    },
    get index() {
      return state.index;
    },
    get offset() {
      return state.offset;
    },
    get viewport() {
      return viewport;
    },
    next() {
      if (state.items.length === 0) return;
      if (state.index < state.items.length - 1) state.index++;
      adjustOffset();
    },
    prev() {
      if (state.items.length === 0) return;
      if (state.index > 0) state.index--;
      adjustOffset();
    },
    first() {
      state.index = 0;
      state.offset = 0;
    },
    last() {
      if (state.items.length === 0) return;
      state.index = state.items.length - 1;
      adjustOffset();
    },
    setItems(items) {
      state.items = [...items];
      if (state.index >= state.items.length) {
        state.index = Math.max(0, state.items.length - 1);
      }
      if (state.offset > state.index) state.offset = state.index;
      adjustOffset();
    },
    setIndex(i) {
      if (state.items.length === 0) return;
      state.index = clamp(i, 0, state.items.length - 1);
      adjustOffset();
    },
  };
}

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}
