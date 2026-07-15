# `@nbcp/inventory`

Shared Business **Inventory** module (S6): stock system of record — balances, reservations, issues, releases, and immutable movement history.

## Orders contract ([ADR-0007](../../docs/adr/0007-orders-inventory-reservation-and-issue-timing.md))

Inventory **executes** intents published by Orders; Orders never calls Inventory.

| Consumed event | Action |
| --- | --- |
| `orders.order.committed` | Reserve stockable lines |
| `orders.order.fulfilled` / `partially_fulfilled` | Issue stock |
| `orders.order.cancelled` | Release unissued reservations |

SKU mapping: `catalogItemId` from order `lineSummaries` is used as the inventory `sku` key.

## Dependencies

* `@nbcp/outbox`, `@nbcp/tenancy`, `@nbcp/rbac`, `@nbcp/audit`
* `@nbcp/identity` (allowed for host wiring)

Must **not** depend on Orders, Payments, Ledger, or Reporting.

## Usage

```ts
const inventory = createInventoryKernel({
  tenancy: tenancy.service,
  rbac: rbac.service,
  outboxStore,
});

await inventory.service.receiveStock(actor, { sku: catalogItemId, quantity: 100 });

// Event projector / relay handler
await inventory.service.consumeOrderEvent(actor, {
  eventId: envelope.eventId,
  eventType: envelope.type,
  occurredAt: envelope.occurredAt,
  organizationId: envelope.organizationId!,
  orderId: String(envelope.payload.orderId),
  lineSummaries: envelope.payload.lineSummaries,
});
```

## Idempotency

Event-driven movements dedupe on `organizationId + sourceEventId + sku + movementType`.

## Availability

`available = onHand - reserved` (always non-negative when mutations succeed).
