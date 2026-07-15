# `@nbcp/reporting`

Shared Business **Reporting** module (S7): read-model projections, KPIs, and report builders. Consumes domain events from all SoR modules — never mutates transactional truth.

## Principle

If Reporting disagrees with a source system, **the source system wins**. Projections are rebuildable from event history.

## Dependencies

* `@nbcp/tenancy`, `@nbcp/rbac`, `@nbcp/audit`
* `@nbcp/identity` (host wiring)

Must **not** depend on Orders, Payments, Inventory, Ledger, or Catalog.

## Projection datasets

| Dataset | Source events |
| --- | --- |
| `reporting_order_facts` | `orders.order.*` |
| `reporting_payment_facts` | `payments.payment.*` |
| `reporting_inventory_movements` | `inventory.stock.*` |
| `reporting_financial_facts` | `ledger.journal.*` |

## Usage

```ts
const reporting = createReportingKernel({
  tenancy: tenancy.service,
  rbac: rbac.service,
});

// Event relay / projector
await reporting.service.consumeEvent(actor, {
  eventId: envelope.eventId,
  eventType: envelope.type,
  occurredAt: envelope.occurredAt,
  organizationId: envelope.organizationId!,
  payload: envelope.payload,
});

const revenue = await reporting.service.getRevenueReport(actor);
const orders = await reporting.service.getOrdersReport(actor);
const stock = await reporting.service.getInventoryReport(actor);
```

## Idempotency

Handlers dedupe on `organizationId + sourceEventId + handler`. Replays are safe.
