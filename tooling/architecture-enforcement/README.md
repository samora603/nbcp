# `@nbcp/architecture-enforcement`

Tool-agnostic ADR-0006 gates for the NBCP monorepo (WP-06 / M6).

## Gates

| Gate | Rules |
| --- | --- |
| Boundaries | B-01…B-06, D-01…D-02 — package DAG + facade-only imports |
| Events | E-01…E-05 — catalog schema + Core declared types ⊆ catalog |
| Permissions | P-01…P-03 — seeds / permission consts ⊆ permission catalog |
| Outbox | O-01, O-04, O-05 — SECURITY modules + envelope + Audit idempotency |
| Docs / ADR | A-01…A-02, DOC-01, C-06 — ADRs Accepted, module docs, exceptions |

## Usage

```bash
pnpm --filter @nbcp/architecture-enforcement build
pnpm enforce:architecture
```

Or: `pnpm --filter @nbcp/architecture-enforcement exec node dist/cli.js` (from package, set `NBCP_ROOT`).

CLI resolves repo root from `NBCP_ROOT` or `cwd` (run from monorepo root).
