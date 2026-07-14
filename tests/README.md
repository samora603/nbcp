# Cross-Cutting Tests

Tests that span multiple packages or validate end-to-end behavior.

| Path | Purpose |
| --- | --- |
| `e2e/` | Playwright (or similar) journeys across apps |
| `contract/` | API contract compatibility suites |
| `load/` | Performance / load scenarios (later) |

Module and package unit/integration tests should live next to their packages when those exist.

**Phase 0.1:** structure only — no test runners configured.
