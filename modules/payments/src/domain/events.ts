export const PaymentsEventTypes = {
  Created: "payments.payment.created",
  Authorized: "payments.payment.authorized",
  Captured: "payments.payment.captured",
  Voided: "payments.payment.voided",
  Refunded: "payments.payment.refunded",
} as const;

export type PaymentsEventType =
  (typeof PaymentsEventTypes)[keyof typeof PaymentsEventTypes];

export const PAYMENTS_EVENT_TYPE_SET: ReadonlySet<string> = new Set(
  Object.values(PaymentsEventTypes),
);
