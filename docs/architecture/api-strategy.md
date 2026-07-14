# API Strategy

## External contract

Public and partner-facing HTTP APIs will be **versioned REST** documented with **OpenAPI 3**.

## Principles

1. OpenAPI is the source of truth for HTTP contracts; clients are generated from it.
2. Stable error envelopes and problem details-style responses.
3. Cursor pagination for collections; no unbounded lists.
4. Idempotency keys on money-moving and other side-effecting operations.
5. Breaking changes require a new version (`/v1` → `/v2`) and a deprecation window.
6. GraphQL is deferred unless a clear BFF need appears.

## Internal UI consumption

Web applications consume the same versioned APIs via typed generated clients (future `packages/api-client`).

## Status

No API routes or OpenAPI specs exist in Phase 0.1. NestJS will host modules when Phase 1+ begins.
