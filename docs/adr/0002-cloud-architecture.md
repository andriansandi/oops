# ADR 0002 — Cloud architecture: monorepo, Workers, shared adaptor core

- **Status:** Accepted
- **Date:** 2026-06-27
- **Deciders:** Sandi Andrian
- **Accepted on:** 2026-06-27 — after a Standards + Spec review of commits
  `55fa32e` + `4b4c8c0` found no blockers. Spec items deferred to ADRs 0003-0006
  by design; two orthogonal follow-ups logged from the Neon commit (Neon
  Pro-gating product decision; `describeTable` identifier-guard latent bug).

## Context

Track 1 (CLI) is complete: a Bun + TypeScript TUI with a pluggable adaptor
layer (`BaseAdaptor` + `D1Adaptor` + `NeonAdaptor`) that introspects and manages
existing databases (144 tests green). ROADMAP Track 2 calls for "Oops Cloud" —
a multi-tenant SaaS: Cloudflare Workers backend, OAuth/magic-link auth, a
server-side credential vault, an SPA dashboard ("modern PHPMyAdmin, terminal
aesthetic"), team workspaces, billing, audit log, automated backups.

Before any Track 2 code is written, the foundational architecture must be
fixed: how the cloud relates to the existing CLI code, where the backend runs
and stores its own metadata, and how the backend reaches user databases. This
ADR resolves those foundation questions. Product-layer choices (auth provider,
vault scheme, SPA framework, billing gateway) are deliberately deferred to
follow-on ADRs (provisional leans noted below).

## Forces

| Force | Implication |
|---|---|
| DRY adaptor logic | D1/Neon adaptors already exist and are tested. Duplicating them in the cloud doubles maintenance and drift risk. |
| Runtime divergence | CLI = Bun; Workers = V8 isolates. Shared code must avoid Bun-/Node-only APIs. |
| Cross-account D1 access | A user's D1 lives in THEIR Cloudflare account; the oops Worker cannot bind to it natively — it must use the Cloudflare REST API (exactly what `D1Adaptor` does today). |
| Neon on the edge | `@neondatabase/serverless` is an HTTP driver built for Workers/edge; `NeonAdaptor` is already Workers-compatible. |
| Metadata shape | Accounts, teams, instances, audit logs are relational (joins, range scans, time-series). A relational store fits better than KV. |
| Speed ethos | ROADMAP mandates "super cepat" for CLI and dashboard. Shared core must stay zero-heavy-dep. |
| Reversibility | Track 2 is large; the foundation should be decoupled so a wrong SPA/auth/billing choice is swappable without re-plumbing. |

## Options considered

### A — Repo & code sharing

**A1. Monorepo with shared `packages/core` (recommended).** Extract the adaptor
layer (`adaptor.ts`, `d1.ts`, `neon.ts`, types, `withTimeout`) into
`packages/core`. Both `packages/cli` (Bun) and `packages/cloud` (Workers)
depend on it. CLI-only code (`config.ts` with `node:fs`, `commands/`, `ui/`)
stays in `packages/cli`.
Pros: single source of truth; cloud inherits the test suite; new adaptors land
once. The adaptor layer is already runtime-portable (uses only `fetch`,
`setTimeout`, `AbortController`).
Cons: workspace tooling boundary; `packages/core` must stay disciplined about
Node-only imports.

**A2. Separate backend, no sharing.** Workers re-implements DB access.
Pros: no shared-package plumbing. Cons: logic duplication, no test carry-over,
certain CLI↔cloud drift.

### B — Backend platform & metadata store

**B1. Cloudflare Workers + D1 for oops metadata (recommended).** Workers host
the API; one D1 database holds oops's own relational data (accounts, teams,
instance records, audit log). User DB credentials are encrypted at rest
(vault — deferred) and stored in this D1.
Pros: stays in Cloudflare (ROADMAP mandate); D1 is relational and co-located
with the Worker; reuses SQLite familiarity.
Cons: D1 write-throughput suits metadata, not hot data — acceptable, since user
query traffic goes to the user's DB, not oops's D1.

**B2. Workers + KV.** Fast reads but poor fit for relational/audit queries;
eventual consistency awkward for billing state.

**B3. Workers + Durable Objects per tenant.** Strong per-tenant consistency;
overkill for metadata. (Good fit LATER for Phase 2.2 real-time collaboration.)

### C — How the backend reaches user databases

**C1. Reuse the adaptor layer as-is (recommended).** `D1Adaptor` (REST) and
`NeonAdaptor` (`@neondatabase/serverless`, HTTP) run unmodified on Workers. The
cloud constructs adaptors from decrypted instance credentials exactly as the
CLI does.
Pros: zero new DB-access code; identical behaviour CLI↔cloud;
`toDollarPlaceholders` / introspection logic shared. Cross-account D1 is REST
by necessity anyway.
Cons: none for D1/Neon. Future generic Postgres (Supabase/RDS) needs a
different path — see C2.

**C2. Hyperdrive + `pg` for Postgres.** Cloudflare pooling/caching; ROADMAP
names Hyperdrive. Redundant with `@neondatabase/serverless` for Neon; `pg` is
heavier; doesn't help D1.
→ C1 now; Hyperdrive reserved for generic (non-Neon) Postgres in a later
adaptor/ADR.

## Decision

**A1 + B1 + C1.**

1. **Monorepo** with shared `packages/core` (runtime-portable adaptor layer:
   `BaseAdaptor`, types, `withTimeout`, `D1Adaptor`, `NeonAdaptor`).
   `packages/cli` (Bun) and `packages/cloud` (Workers) consume it.
2. **Cloudflare Workers** host the cloud API; one **Cloudflare D1** holds oops's
   own relational metadata (accounts, teams, instances, audit log).
3. The backend **reuses the existing adaptor layer** to reach user databases —
   D1 via REST, Neon via `@neondatabase/serverless` — unmodified on Workers.

### Rationale

1. The adaptor layer is already runtime-portable (uses only `fetch`,
   `setTimeout`, `AbortController`, and `@neondatabase/serverless` — all
   Workers-compatible). Sharing is low-risk, high-leverage.
2. Cross-account D1 access is REST by necessity, so `D1Adaptor` is the correct
   abstraction on both sides — the cloud gains nothing from a native D1 binding
   for user DBs.
3. D1 for oops's own metadata keeps everything in Cloudflare, is relational
   (suits audit/teams/billing), and co-locates with the Worker.
4. Decoupling the foundation from auth/SPA/billing keeps those choices
   swappable without touching the adaptor or metadata plumbing.

## Consequences

Positive:
- One tested DB-access layer serves both surfaces; new adaptors (generic
  Postgres/Hyperdrive, Supabase) land once.
- Cloud backend starts from the shared test suite.
- Workspace boundary forces `packages/core` to stay runtime-clean.

Negative / risks:
- Monorepo tooling: need bun workspaces + a strategy for `wrangler` to bundle
  `packages/core` (verify in implementation).
- `packages/core` must not drift into Node-only APIs — enforce via a CI
  typecheck against `@cloudflare/workers-types` in addition to the Bun
  typecheck.
- D1 metadata is a single tenant-shared SQLite; isolation is by `tenant_id`
  columns + row-level checks (no DB-per-tenant). Acceptable for metadata;
  revisit if isolation guarantees are required.

## Deferred decisions (provisional leans — resolve in follow-on ADRs)

- **Auth** (ADR 0003): GitHub OAuth + Magic Link; accounts in D1.
- **Credential vault** (ADR 0004): envelope encryption — AES-GCM
  data-encryption-key (DEK) per secret, KEK in Cloudflare Workers Secret /
  external KMS; ciphertext in D1.
- **SPA framework** (ADR 0005): Hono + HTMX for the terminal-aesthetic,
  low-bundle dashboard; reactive islands if the visual query builder demands it.
- **Billing** (ADR 0006): Stripe.

## Implementation plan (when this ADR is Accepted)

1. Restructure into a bun workspace: `packages/core` (adaptor layer + types +
   `withTimeout`), `packages/cli` (current `src/` minus adaptors/core), tests
   adjacent to each package.
2. Add `packages/cloud`: `wrangler.toml`, one D1 binding for oops metadata, a
   minimal Hono router that constructs adaptors from decrypted instance
   credentials.
3. Add a CI matrix: typecheck `packages/core` against both `@types/bun` and
   `@cloudflare/workers-types` to guarantee runtime portability.
4. Model oops's OWN server-side schema in D1 (accounts, teams, instances,
   audit) — this is oops's metadata DB, NOT the user's database; `AGENTS.md` §1
   (no user-schema migration) is not violated.
5. One vertical slice end-to-end: authenticate → list instances → introspect
   tables via the shared `D1Adaptor`/`NeonAdaptor`.

## Rollback

The monorepo split is reversible via `git revert`. Until `packages/cloud`
ships, the CLI works standalone (the shared `core` is a pure extraction, not a
rewrite).

## References

- `ROADMAP.md` — Track 2 (Oops Cloud).
- `docs/adr/0001-tui-renderer.md` — prior ADR; same "honour the roadmap's speed
  mandate" ethos and format.
- `src/core/adaptor.ts`, `src/adaptors/d1.ts`, `src/adaptors/neon.ts` — the
  layer to extract into `packages/core`.
- `AGENTS.md` §1 — no migrations to the USER's database (does not restrict
  oops's own metadata D1).
