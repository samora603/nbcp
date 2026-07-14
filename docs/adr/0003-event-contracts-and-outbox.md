# ADR-0003: Event Contracts and Transactional Outbox

- **Status:** Accepted
- **Date:** 2026-07-14
- **Deciders:** Noventra platform architecture
- **Tags:** events, outbox, audit, modular-monolith, dependencies
- **Remediates:** [K-01](../reviews/kernel-review.md), [K-04](../reviews/kernel-review.md)

## Context

The kernel architecture review found:

- **K-01:** Security-relevant audit projection is unreliable without a mandatory transactional outbox and idempotent consumers.
- **K-04:** Cross-module event typing without a contract standard invites deep imports and **cyclic dependencies**.

NBCP must preserve:

- Modular monolith ([ADR-0001](0001-platform-technology-foundation.md))
- Domain map layering ([ADR-0002](0002-domain-map.md)): Product → Shared → Core
- Kernel DAG: Identity independent; Tenancy/RBAC/Audit may depend on Identity; RBAC/Audit may depend on Tenancy; Identity/Tenancy/RBAC must not depend on Audit
- **No new domain-module dependency edges** introduced by this decision

## Decision

1. Adopt the normative rules in [`docs/architecture/event-contracts.md`](../architecture/event-contracts.md).
2. Every domain event uses a standard **envelope** (`eventId`, `type`, `version`, `occurredAt`, `producer`, `organizationId`, `correlationId`, `payload`).
3. Event **contracts are owned by the producing module** and exported only via that module’s **public facade** (or, later, copied as pure DTOs into a technical `packages/contracts` library that depends on **no** `modules/*`).
4. **Security-relevant events** (defined in event-contracts.md, including all Identity/Tenancy/RBAC events used for compliance audit) **must** be written to a **transactional outbox in the same DB transaction** as the state change.
5. Consumers (especially Audit projections from Identity/Tenancy/RBAC) **must** be **idempotent** on `eventId`.
6. Identity, Tenancy, and RBAC **never** import Audit; Audit (or the API host) consumes their public events / outbox publications.
7. In-process dispatch and BullMQ relays remain acceptable; external brokers remain deferred per ADR-0001.

## Consequences

### Positive

- Audit trails can be made durable and replay-safe (K-01).
- Event typing no longer requires deep imports (K-04).
- Dependency DAG unchanged; Identity stays independent.
- Clear checklist of mandatory Audit projections.

### Negative / Trade-offs

- Outbox + relay adds operational machinery before brokers exist.
- Producer-owned contracts mean consumers still take a **legal** dependency on the producer package when importing types — this is intentional and must respect the DAG (Audit→Tenancy OK; Tenancy→Audit forbidden).
- Optional future `@nbcp/contracts` extraction requires discipline to keep it DTO-only.

### Follow-ups

- Implement outbox schema in the database package when scaffolding begins.
- CI test: security event emitted ⇒ outbox row; consumer idempotency.
- Update [eventing.md](../architecture/eventing.md) to point here as authority.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Synchronous `audit.record` inside Identity/Tenancy/RBAC | Creates forbidden dependencies on Audit |
| “Best effort” in-process publish only | Fails K-01 under crash/rollback |
| Shared god event module depending on all domains | Inverts layering; magnet for cycles |
| Kafka-first | Premature per ADR-0001 |

## References

- [`docs/architecture/event-contracts.md`](../architecture/event-contracts.md)
- [`docs/reviews/kernel-review.md`](../reviews/kernel-review.md)
- [`docs/modules/audit/design.md`](../modules/audit/design.md)
- [ADR-0001](0001-platform-technology-foundation.md), [ADR-0002](0002-domain-map.md)
