# `@nbcp/payments`

Shared Business **Payments** module (S4): payment intents, authorization, capture, void, refund — system of record for settlement state against Orders payables.

## Ledger contract ([ADR-0005](../../docs/adr/0005-financial-truth-and-projection-ownership.md))

Payments publishes financial lifecycle events; **Ledger** (S5) consumes them and posts journals. Payments does **not** import Ledger or write ledger tables.

## Dependencies

* `@nbcp/outbox`, `@nbcp/tenancy`, `@nbcp/rbac`, `@nbcp/audit`
* `@nbcp/orders` (read-only order validation)
* `@nbcp/identity` (allowed for host wiring)

Must **not** depend on Ledger, Inventory, or Reporting.

## Lifecycle events

| Event | When |
| --- | --- |
| `payments.payment.created` | Payment intent created (`pending`) |
| `payments.payment.authorized` | Authorization succeeded |
| `payments.payment.captured` | Funds captured |
| `payments.payment.voided` | Authorization voided |
| `payments.payment.refunded` | Partial or full refund |

## Usage

```ts
const payments = createPaymentsKernel({
  tenancy: tenancy.service,
  rbac: rbac.service,
  orders: orders.service,
  outboxStore,
});

const payment = await payments.service.createPayment(actor, {
  orderId: committedOrder.orderId,
  amount: { currency: "USD", amountMinor: 5000 },
  provider: "stripe",
});
await payments.service.authorizePayment(actor, payment.paymentId, {
  providerReference: "pi_xxx",
});
await payments.service.capturePayment(actor, payment.paymentId);
```
