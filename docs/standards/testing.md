# Testing Standards

## Pyramid

| Layer | Purpose | Planned tooling |
| --- | --- | --- |
| Unit | Domain & use-case logic | Vitest |
| Integration | DB, Redis, tenancy isolation | Vitest + containers |
| Contract | API compatibility | OpenAPI-based checks |
| E2E | Critical user journeys | Playwright |
| Load | Hot paths (later) | k6 |

## Rules

1. Behavior changes include tests at the lowest sufficient layer.
2. Tenant isolation tests are mandatory for tenant-owned data modules.
3. Money/ledger modules require invariant-focused tests.
4. Flaky tests are treated as defects.
5. Prefer fast unit tests for domain logic; reserve e2e for critical paths.
6. Do not chase vanity coverage percentages at the expense of meaningful assertions.

## Status

Test suites under `tests/` are placeholders in Phase 0.1. Framework wiring arrives with application packages.
