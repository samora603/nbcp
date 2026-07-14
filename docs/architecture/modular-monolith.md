# Modular Monolith

## Decision

NBCP ships as a **modular monolith**: one (or few) deployable API/worker processes hosting many isolated domain modules. See [ADR-0001](../adr/0001-platform-technology-foundation.md).

## Why

- Faster delivery of a shared platform than a microservice fleet
- Single transactional database for early commercial primitives
- Strong TypeScript boundaries instead of network boundaries
- Preserves a path to extraction when scale or compliance requires it

## Module rules

1. Each module owns its domain model and use cases.
2. Other modules may depend only on a **public facade**, never infrastructure internals.
3. Cross-module side effects prefer **domain events** (eventually via outbox).
4. Circular module dependencies are forbidden.
5. Product-specific rules do not leak into the platform kernel.

## Target module layout

Mandatory structure is defined in [module-standard.md](module-standard.md).
Canonical copy-source: [`modules/_templates/domain-module/`](../../modules/_templates/domain-module/).

```text
modules/<name>/
  src/domain/
  src/application/
  src/infrastructure/
  src/api/
  src/events/
  src/index.ts          # public facade
  tests/
  README.md
  package.json
```

## Extraction criteria

Consider extracting a module to a separate service when **at least two** apply:

- Independent scaling profile
- Independent release cadence with hard ownership
- Strong failure isolation requirement
- Separate compliance or data residency boundary

Until then, keep the monolith modular and well-tested.
