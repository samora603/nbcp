# `@nbcp/orders`

Shared Business **Orders** module (S3): canonical commercial commitments — order lines, Parties/Catalog references, lifecycle, fulfillment signaling.

## Inventory contract ([ADR-0007](../../docs/adr/0007-orders-inventory-reservation-and-issue-timing.md))

Orders publishes intents only:

* `orders.order.committed` → `inventoryIntent: "reserve"`
* `orders.order.partially_fulfilled` / `fulfilled` → `inventoryIntent: "issue"`
* `orders.order.cancelled` → `inventoryIntent: "release"`

Orders does **not** import Inventory or mutate stock.

## Dependencies

* `@nbcp/outbox`, `@nbcp/tenancy`, `@nbcp/rbac`, `@nbcp/audit`
* `@nbcp/parties`, `@nbcp/catalog`
* `@nbcp/identity` (allowed for host wiring)

Must **not** depend on Payments, Ledger, Inventory, or Reporting.

## Usage

```ts
const orders = createOrdersKernel({
  tenancy: tenancy.service,
  rbac: rbac.service,
  parties: parties.service,
  catalog: catalog.service,
  outboxStore,
});

const order = await orders.service.createOrder(actor, {
  customerPartyId: customer.partyId,
});
await orders.service.addLine(actor, {
  orderId: order.orderId,
  catalogItemId: item.catalogItemId,
  quantity: 2,
});
await orders.service.commitOrder(actor, order.orderId);
await orders.service.fulfillOrder(actor, order.orderId);
```
