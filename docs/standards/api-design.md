# API Design Standards

## Style

- Versioned REST under `/v1` (and subsequent versions).
- OpenAPI 3 as the contract source of truth.

## Rules

1. Resource-oriented URLs; consistent pluralization.
2. Stable error envelope across endpoints.
3. Cursor-based pagination for lists.
4. Idempotency keys for side-effecting financial and provisioning operations.
5. Explicit content types; validate all inputs at the boundary.
6. Do not break existing clients without a version bump and deprecation period.
7. Document authentication and authorization requirements per operation (when auth exists).

## Compatibility

Treat published OpenAPI documents as promises. Contract tests will guard them in later phases.

## Status

Policy only in Phase 0.1 — no routes implemented.
