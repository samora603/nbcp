# Eventing

## Intent

Modules communicate side effects through **domain events** to reduce direct write coupling.

## Near-term approach

1. In-process event dispatch within the modular monolith for early modules.
2. **Transactional outbox** pattern when reliable publish-after-commit is required.
3. **BullMQ** workers for asynchronous handlers and retries.
4. External brokers (NATS/Kafka) only when volume, fan-out, or service extraction demand them.

## Principles

- Events are part of a module’s public language; name them carefully.
- Consumers must be idempotent.
- Never assume synchronous dual-writes across module boundaries for “convenience.”
- Version event payloads intentionally; prefer additive changes.

## Status

Placeholder for Phase 0.1. Event bus packages and outbox tables are not implemented yet.
