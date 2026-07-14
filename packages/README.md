# Packages

Shared technical libraries live here (config presets, UI design system, contracts, telemetry, auth SDK, etc.).

| Package | Purpose | Status |
| --- | --- | --- |
| [`@nbcp/outbox`](outbox/) | Transactional outbox, envelope validation, relay, idempotency (WP-01 / M1) | Implemented (in-memory store; DB adapter later) |

Domain modules remain under `modules/` and must not be imported by technical packages unless the dependency DAG explicitly allows it. `@nbcp/outbox` forbids all `modules/*` imports.
