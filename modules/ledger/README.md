# `@nbcp/ledger`

Shared Business **Ledger** module (S5): immutable financial truth — balanced journals posted from consumed financial events.

## Payments contract ([ADR-0005](../../docs/adr/0005-financial-truth-and-projection-ownership.md))

Ledger **consumes** Payments outbox events; Payments never writes ledger tables.

| Consumed event | Posting (default rules) |
| --- | --- |
| `payments.payment.captured` | DR `CASH_CLEARING` / CR `REVENUE` |
| `payments.payment.refunded` | DR `REFUNDS` / CR `CASH_CLEARING` |

Account codes are **configurable** via `PostingRuleConfig` at kernel creation — not hardcoded in domain logic.

## Dependencies

* `@nbcp/outbox`, `@nbcp/tenancy`, `@nbcp/rbac`, `@nbcp/audit`
* `@nbcp/identity` (allowed for host wiring)

Must **not** depend on Orders, Payments, Inventory, or Reporting.

## Usage

```ts
const ledger = createLedgerKernel({
  tenancy: tenancy.service,
  rbac: rbac.service,
  outboxStore,
});

// Event projector / relay handler (no direct Payments import)
await ledger.service.consumeFinancialEvent(actor, {
  eventId: envelope.eventId,
  eventType: envelope.type,
  occurredAt: envelope.occurredAt,
  organizationId: envelope.organizationId,
  paymentId: String(envelope.payload.paymentId),
  orderId: String(envelope.payload.orderId),
  amount: Number(envelope.payload.amount),
  currency: String(envelope.payload.currency),
});
```

## Idempotency

`organizationId + sourceEventId` is unique. Re-consuming the same event returns the existing journal.

## Corrections

Posted journals are immutable. Use `reverseJournal` to create reversing entries; the original journal status becomes `reversed`.
