# ADR 0001 — TUI renderer: Ink (React) vs pure ANSI

- **Status:** Proposed
- **Date:** 2026-06-23
- **Deciders:** Sandi Andrian, Kilo

## Context

Oops CLI is a Bun + TypeScript TUI for managing Cloudflare D1 instances. The
ROADMAP sets two non-negotiable constraints on this layer:

1. *"startup instan dengan Bun"* — Track 1 intro
2. *"Optimasi TUI: Jangan gunakan library output terminal yang merusak history
   scroll"* — `AGENTS.md §3`

The current implementation uses **Ink 7 + React** for the two interactive
surfaces (`oops tables`, `oops browse <table>`). `@clack/prompts` is also
pulled in for `oops connect` and the interactive menu.

This ADR compares that choice against a pure-ANSI / `readline` approach and
records the trade-offs before any feature work begins on Phase 1.3 (CRUD),
which would otherwise pile more state and key-handling on top of the current
renderer.

## Forces

| Force | Favors Ink | Favors pure ANSI |
|---|---|---|
| Time-to-feature | ✓ | — |
| Component model / declarative UI | ✓ | — |
| Hot reload via `bun --watch` | ✓ | partial |
| Familiar mental model (web dev) | ✓ | — |
| Startup latency ("instan") | — | ✓ |
| TTY brittleness (raw-mode requirement) | ✗ | ✓ |
| Dependency footprint | — | ✓ |
| Scrollback hygiene (`AGENTS.md §3`) | partial | ✓ |
| Testability (DOM-ish vs in-memory key events) | partial | ✓ |
| Cross-platform SSH / CI / piped output | ✗ | ✓ |
| Matches existing `src/ui/render.ts` style | — | ✓ |

## Options considered

### Option A — Stay with Ink (status quo)

Pros:
- `TablesTui` and `TableBrowser` are already built and working in a real TTY.
- JSX is concise for nested layout (`<Box flexDirection="column">`).
- `ink-text-input`, `ink-spinner` work out of the box.

Cons:
- Adds `react`, `react-reconciler`, `scheduler`, `ink`, `ink-text-input`,
  `ink-spinner`, `ink-table` ≈ **2.7 MB** to `node_modules`. Phase 1.3 will
  likely add more (`ink-form`, `ink-multi-select`, etc.).
- Ink's full-screen renderer is precisely the kind of library the
  *"Optimasi TUI"* rule warns against — partial-screen redraws can corrupt
  scrollback if not exited cleanly.
- The very first non-TTY run exposed `Raw mode is not supported` (commit
  `a96540a` fixed it for `tables` and `browse`, but the same class of bug
  will recur as soon as a new Ink surface is added).
- Startup cost: every `oops` invocation loads React even when only
  `oops status` or `oops list` is called.
- React's component model is a poor fit for a CLI whose main loop is
  "load data → render → read keys → repeat". The state machines we actually
  need (lists, panels, search) are simpler than React's reconciliation is
  designed for.

### Option B — Pure ANSI + `readline` (or `node:readline/promises`)

Pros:
- **Zero added dependencies** for the TUI layer. Bun ships `readline` built
  in. `src/ui/render.ts` already builds tables with hand-rolled ANSI
  (`renderTable`, `truncate`, `maskSecret`).
- No TTY requirement — output goes to stdout regardless of `isTTY`. Pipe
  to `less`, redirect to file, run in CI, all just work. The existing
  `cmdTablesPlain` / `cmdBrowsePlain` fallbacks become unnecessary.
- Startup is "instan" by definition — no reconciler boot, no virtual DOM
  diff.
- Scrollback stays clean: the renderer draws lines, the user scrolls the
  terminal naturally. No alternate-screen buffer to leak.
- Easier to test: key events are pure data (`{ key: 'up', meta: false }`),
  state is a plain object, output is a string. Snapshot tests are trivial.
- Aligns with `AGENTS.md §3` and the "startup instan" goal without
  re-interpretation.

Cons:
- ~600 LOC of rewrite across `src/commands/tables.tsx`,
  `src/commands/browse.tsx`, `src/ui/TableBrowser.tsx`. Estimated 1–2 days
  of focused work.
- Loss of declarative nesting. Layout becomes a small templating function
  (which `src/ui/render.ts` already shows the shape of).
- No off-the-shelf `ink-table` widget. We will write a small in-house
  paginated list component. This is also an opportunity — Ink's table
  layout is what currently breaks when terminal width is narrow.

### Option C — Hybrid

Keep Ink only for screens that need complex widget composition (likely
none in Phase 1.3). Keep `@clack/prompts` for one-shot forms
(`oops connect`, future `oops insert`). Build `oops tables` and
`oops browse` on pure ANSI.

Pros: pragmatic. Cons: still pays the Ink install cost and TTY-fragility
tax even if unused on the hot path.

## Decision

**Proposed: Option B.** Pure ANSI + `readline` for the interactive TUI
surfaces, keep `@clack/prompts` for one-shot prompts.

Rationale:

1. The ROADMAP and `AGENTS.md` both explicitly favour this direction. We
   do not need a second opinion; we need to honour our own constraints.
2. The recent raw-mode bug (commit `a96540a`) is the first of a class. Each
   new Ink surface will be a fresh place for the same bug.
3. The size of the rewrite is bounded — only two TUI files plus the shared
   `TableBrowser` — and most of the data-fetching logic is already separate.
4. The user has flagged TUI feedback ("kayaknya ada bug", "fieldnya gak
   interaktif") that suggests the Ink-based UX is harder to iterate on
   than expected. A smaller, transparent renderer shortens the feedback
   loop.

## Consequences

Positive:
- `bun install` shrinks by ~2.7 MB.
- Every `oops` command becomes non-TTY-safe by default. The
  `cmdTablesPlain` / `cmdBrowsePlain` fallback functions can be deleted.
- New TUI screens (Phase 1.3 form generator, Phase 1.5+) can be built
  against a small in-house primitive set instead of pulling more
  `ink-*` packages.
- Tests for the TUI become string-comparison tests.

Negative / risks:
- 1–2 days of rewrite with no user-visible feature gain during that time.
- Loss of `ink-text-input` → we write a 30-line `readline` wrapper.
- Loss of `ink-spinner` → we write a 20-line rotating-glyph function.
- Until the rewrite ships, two renderers coexist (Ink + new ANSI). This is
  acceptable if the migration is done as a single PR per surface.

## Implementation plan (when this ADR is Accepted)

1. Introduce `src/ui/ansi.ts` — small helpers: cursor save/restore, clear
   EOL, hide/show cursor, color, attr.
2. Introduce `src/ui/list.ts` — paginated list primitive:
   `{ items, selected, viewport, render(): string }`.
3. Introduce `src/ui/prompt.ts` — single-line `readline`-based text input
   with a hook for filtering.
4. Rewrite `src/commands/tables.ts` (rename from `.tsx`) on top of (2)
   and (3). Preserve the Tab/Search/Enter/Esc key model from the existing
   TUI.
5. Rewrite `src/commands/browse.ts` and delete `src/ui/TableBrowser.tsx`
   (folded into the new in-house component).
6. Delete `cmdTablesPlain` / `cmdBrowsePlain` and the `isTTY()` guards
   in `src/index.ts`.
7. Remove `ink`, `ink-text-input`, `ink-spinner`, `ink-table`,
   `react`, `react-reconciler`, `scheduler`, `@types/react` from
   `package.json`. Run `bun install`.
8. Manual smoke-test in real terminal: menu, connect, tables, browse,
   describe, query, status, remove, upgrade.

## Rollback

`git revert` of the migration PR. `bun.lock` is checked in, so a
`bun install` against the reverted `package.json` restores Ink.

## References

- `ROADMAP.md` — Track 1 intro, "startup instan dengan Bun".
- `AGENTS.md` — §3 Optimasi TUI.
- `src/ui/render.ts` — existing in-house ANSI table renderer.
- `src/utils/tty.ts` — `isTTY()` helper added in commit `a96540a`.
- Ink raw-mode bug: commit `a96540a` (fix), reproduced 2026-06-23.
