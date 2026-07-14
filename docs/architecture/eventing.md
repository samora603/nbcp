# Eventing

## Intent

Modules communicate side effects through **domain events** to reduce direct write coupling.

## Authority

Normative rules for envelopes, outbox, and consumers: **[event-contracts.md](event-contracts.md)** ([ADR-0003](../adr/0003-event-contracts-and-outbox.md)).

## Near-term approach

1. In-process event dispatch within the modular monolith for early modules.
2. **Transactional outbox** — **mandatory** for security-relevant events (see event-contracts.md).
3. **BullMQ** workers for asynchronous handlers and retries.
4. External brokers (NATS/Kafka) only when volume, fan-out, or service extraction demand them.

## Principles

- Events are part of a module’s public language; export contracts via the module facade only.
- Consumers must be idempotent on `eventId`.
- Never assume synchronous dual-writes across module boundaries for “convenience.”
- Version event payloads intentionally; prefer additive changes.
- Identity / Tenancy / RBAC never import Audit; Audit consumes their events.

## Status

Standard accepted (ADR-0003). Retention/replay/rebuild policy: [ADR-0004](../adr/0004-event-retention-replay-rebuild.md) (Proposed). Authoritative type inventory: [event catalog](../reference/event-catalog.md). Runtime outbox/schemas are not implemented until module scaffolding.
