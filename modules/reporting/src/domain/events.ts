/** Consumed event types (Reporting does not import source SoR modules). */
export const CONSUMED_ORDER_EVENTS = [
  "orders.order.created",
  "orders.order.committed",
  "orders.order.fulfilled",
  "orders.order.partially_fulfilled",
  "orders.order.cancelled",
] as const;

export const CONSUMED_PAYMENT_EVENTS = [
  "payments.payment.created",
  "payments.payment.authorized",
  "payments.payment.captured",
  "payments.payment.refunded",
  "payments.payment.voided",
] as const;

export const CONSUMED_INVENTORY_EVENTS = [
  "inventory.stock.reserved",
  "inventory.stock.released",
  "inventory.stock.issued",
  "inventory.stock.received",
  "inventory.stock.adjusted",
] as const;

export const CONSUMED_LEDGER_EVENTS = [
  "ledger.journal.posted",
  "ledger.journal.reversed",
] as const;

export const ALL_CONSUMED_EVENT_TYPES: ReadonlySet<string> = new Set([
  ...CONSUMED_ORDER_EVENTS,
  ...CONSUMED_PAYMENT_EVENTS,
  ...CONSUMED_INVENTORY_EVENTS,
  ...CONSUMED_LEDGER_EVENTS,
]);
