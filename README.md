# oops — Multi-Instance DB Management Hub

A fast, terminal-first CMS for databases that already exist. `oops` introspects
your schema and gives you interactive table browsing, dynamic CRUD forms, and a
safe SQL console — all from a single Bun-powered CLI with **zero full-screen
renderer dependencies**.

Built for [Cloudflare D1](https://developers.cloudflare.com/d1/) and
[Neon](https://neon.tech) (Postgres); a pluggable adaptor layer means more
backends are easy to add.

> No schema migrations, no table creation. `oops` adapts to *your* database,
> never the other way around.

---

## Why oops?

- **Instant startup.** Runs on [Bun](https://bun.sh) — no Node reconciler, no
  virtual DOM boot. `oops status` returns before you finish blinking.
- **Pure-ANSI TUI.** The interactive surfaces (`tables`, `browse`) are drawn
  with hand-rolled ANSI escapes on top of `readline`. No Ink, no React, no
  alternate-screen buffer — your scrollback stays clean and every command is
  safe to pipe or run in CI. See [`docs/adr/0001-tui-renderer.md`](docs/adr/0001-tui-renderer.md).
- **Schema-driven CRUD.** `insert` and `edit` generate their forms from the
  introspected column types (`INTEGER` → numeric prompt, `BOOLEAN` → yes/no,
  `JSON` → parsed, `NOT NULL` without a default → required). Every statement is
  **parameterized**; identifiers are validated to reject injection.
- **Safe by default.** A SQL safety classifier (`policy.ts`) splits statements
  into `safe` / `confirm` (data-modifying) / `destructive` (schema-modifying)
  and prompts accordingly — including across multi-statement and `WITH ...`
  queries.
- **Multi-instance, one config.** Manage many D1 & Neon databases from one machine.
  Credentials live in `~/.config/oops/config.json` at `chmod 600`.
- **Offline-friendly tier model.** Free tier caps at 5 instances; `pro` /
  `enterprise` unlock unlimited instances and are activated by redeeming a
  license key (`oops license <key>`).

---

## Requirements

- [Bun](https://bun.sh) `>= 1.1` (the project pins to the Bun runtime — do not
  run it under Node.js)
- A Cloudflare account with a D1 database, plus an API token carrying D1
  read/write scope

---

## Install

```sh
git clone https://github.com/andriansandi/oops.git
cd oops
bun install
```

Run it in place:

```sh
bun run packages/cli/src/index.ts help
# or
bun run dev help
```

For a global `oops` command, symlink the entrypoint:

```sh
ln -s "$(pwd)/packages/cli/src/index.ts" ~/.local/bin/oops
```

---

## Quick start

```sh
# 1. Add an instance (interactive — D1: Account ID/Database ID/Token · Neon: connection string)
oops connect

# 2. See what you've got
oops status          # config summary + active instance
oops tables          # introspect tables, then drop into the browser

# 3. Explore
oops browse users    # interactive TUI: ↑/↓ nav, ←/→ scroll cols, / filter, enter detail
oops describe users  # column list with types, PK & NOT NULL flags

# 4. Edit data safely
oops insert users    # dynamic form, preview SQL, confirm, execute
oops edit users      # find a row by PK/rowid, edit only the fields you change

# 5. Raw SQL (still guarded)
oops query "SELECT count(*) FROM users"
oops query "DELETE FROM users WHERE id = 1"   # prompts: "Heads up: DELETE modifies data."
```

With no arguments, `oops` opens an interactive menu.

---

## Commands

| Command | Alias | Description |
|---|---|---|
| `oops` | — | Interactive menu |
| `oops connect` | `add` | Add a database instance (D1 or Neon) |
| `oops list` | `ls` | List configured instances |
| `oops use [name]` | — | Switch the active instance |
| `oops status` | — | Show config, license & instance summary |
| `oops tables` | `ls-tables` | Introspect tables, then browse |
| `oops browse <table>` | `ui` | Interactive TUI table browser |
| `oops describe <table>` | `schema` | Show columns of a table |
| `oops insert <table>` | `add-row` | Add a row via a dynamic form |
| `oops edit <table>` | `update-row` | Edit a row via a dynamic form |
| `oops query "<sql>"` | `sql` | Run a SQL statement (safety-prompted) |
| `oops remove <name>` | `rm` | Remove an instance |
| `oops upgrade` | — | Show upgrade options |
| `oops license <key>` | — | Redeem a license key |
| `oops help` | `-h`, `--help` | Show help |

---

## The TUI browser

`oops browse <table>` loads up to 200 sample rows into an interactive view:

| Key | Action |
|---|---|
| `↑` / `↓` | Move row selection |
| `←` / `→` | Horizontal column scroll |
| `/` | Enter filter mode (matches across all columns, case-insensitive) |
| `enter` | Open the row detail panel |
| `tab` | Toggle detail view: **table** ↔ **raw JSON** |
| `esc` | Step back: close detail → clear filter → exit |
| `q` | Quit |

Because the renderer is pure ANSI, output degrades gracefully when piped or run
outside a TTY — nothing crashes on `Raw mode is not supported`.

---

## How CRUD stays safe

1. **Introspection.** `PRAGMA table_info` feeds `generateForm`, which maps
   SQLite types to field types and marks `NOT NULL` columns (without a default)
   as required.
2. **Coercion.** `coerceValue` parses each input to the right JS type and
   rejects bad input before it ever reaches SQL.
3. **Building.** `buildInsert` / `buildUpdate` emit **`?`-parameterized** SQL.
   Table and column names pass through `quoteIdent`, which rejects anything that
   isn't a bare identifier — so `oops insert "drop table"` can't happen.
4. **Preview.** You see the exact SQL + bound params before confirming.
5. **Classification.** `classifySql` independently re-checks the operation so
   destructive statements always prompt.

The key reducers (`browseKeyReducer`, `tablesKeyReducer`) are pure
`(state, key) → state` functions — fully unit-tested without a TTY.

---

## Configuration

```
~/.config/oops/config.json   (chmod 600, created on first run)
```

```jsonc
{
  "version": 1,
  "license": "free",          // "free" | "pro" | "enterprise"
  "activeInstanceId": "…",
  "instances": [
    {
      "id": "…",
      "name": "my-prod-db",
      "type": "d1",
      "credentials": {
        "accountId": "…",
        "databaseId": "…",
        "apiToken": "…"
      },
      "createdAt": "…"
    }
  ]
}
```

### Environment variables

| Variable | Purpose |
|---|---|
| `OOPS_LICENSE_URL` | Override the license verification endpoint (testing/staging) |

---

## License tiers

| Tier | Instances | Adaptors |
|---|---|---|
| `free` | up to 5 | D1 |
| `pro` | unlimited | D1, Neon |
| `enterprise` | unlimited | D1, Neon + cloud dashboard (roadmap) |

Redeem a key with `oops license <key>`. Verification hits the endpoint with a
5-second timeout and degrades gracefully — a network failure reports
"unavailable" rather than rejecting your key.

---

## Project structure

The repo is a **Bun workspace** with two packages. `@oops/core` holds the
runtime-portable adaptor layer (no `bun-types`, safe for Cloudflare Workers);
`@oops/cli` holds the TUI CLI. See [`docs/adr/0002-cloud-architecture.md`](docs/adr/0002-cloud-architecture.md).

```
packages/
├── core/                       # @oops/core — runtime-portable adaptor layer
│   ├── src/
│   │   ├── adaptor.ts          # BaseAdaptor, QueryTimeoutError, withTimeout, isInternalD1Name
│   │   ├── adaptor-factory.ts  # instance record → concrete adaptor
│   │   ├── instance.ts         # credential & instance types (D1/Neon/InstanceRecord)
│   │   ├── adaptors/
│   │   │   ├── d1.ts           # Cloudflare D1 adaptor (REST API)
│   │   │   └── neon.ts         # Neon Postgres adaptor (@neondatabase/serverless)
│   │   ├── index.ts            # barrel re-export (public API)
│   │   └── __tests__/          # adaptor + neon tests
│   ├── package.json            # @oops/core
│   ├── tsconfig.json           # types:[] portability guard (no bun-types)
│   └── tsconfig.test.json      # bun-types for tests only
└── cli/                        # @oops/cli — the TUI CLI
    ├── src/
    │   ├── index.ts            # CLI entrypoint, dispatch & interactive menu
    │   ├── policy.ts           # SQL safety classifier (safe / confirm / destructive)
    │   ├── core/
    │   │   ├── config.ts       # ~/.config/oops/config.json, instance guard, tiers
    │   │   └── license.ts      # online license verification
    │   ├── commands/           # one file per command (connect, browse, insert, …)
    │   ├── forms/
    │   │   ├── generator.ts    # ColumnInfo[] → FieldSpec[] (type-aware form)
    │   │   └── sql-builder.ts  # coerceValue, buildInsert, buildUpdate (parameterized)
    │   ├── ui/
    │   │   ├── ansi.ts         # ANSI escape helpers (cursor, color, style)
    │   │   ├── list.ts         # paginated list primitive
    │   │   ├── prompt.ts       # readline key decoder
    │   │   ├── session.ts      # runSession — raw-mode lifecycle & cleanup
    │   │   └── render.ts       # renderTable, maskSecret, color constants
    │   └── __tests__/          # TDD — pure state-machine reducers
    ├── package.json            # @oops/cli (bin: oops)
    └── tsconfig.json           # extends base, bun-types
```

### Adding a database adaptor

New adaptors extend `BaseAdaptor` (`packages/core/src/adaptor.ts`) and implement
`testConnection`, `listTables`, `describeTable`, and `query`. Every query is
wrapped with a **5000 ms timeout** (`withTimeout`) so a flaky network can never
freeze the CLI. Register the new type in `packages/core/src/adaptor-factory.ts`.

---

## Development

```sh
bun install          # install deps (links workspace packages)
bun run dev          # run the CLI
bun run typecheck    # tsc --noEmit (cli + core source + core tests)
bun test             # run the full suite (158 tests)
```

### Conventions

- **Runtime is Bun.** Never introduce native Node-only dependencies.
- **TUI renderer is pure ANSI.** No Ink / blessed / React / full-screen
  libraries (see `AGENTS.md` and ADR 0001). State reducers stay pure so they
  test without a TTY.
- **Never migrate the user's schema.** All UI is driven by introspection.
- **Every query has a 5000 ms timeout.**

---

## Roadmap

See [`ROADMAP.md`](ROADMAP.md) for the full plan. Highlights:

- **Track 1 (CLI):** D1 + Neon adaptors ✅ · instance guard & licensing
- **Track 2 (Cloud):** multi-tenant Cloudflare Workers backend, web dashboard,
  team workspaces, audit log & automated backups

---

## License

MIT — Created by [Sandi Andrian](https://github.com/andriansandi).
