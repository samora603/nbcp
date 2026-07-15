/** Permission catalog keys owned by Payments. */
export const PaymentsPermissions = {
  PaymentRead: "payments.payment.read",
  PaymentCreate: "payments.payment.create",
  PaymentCapture: "payments.payment.capture",
  PaymentRefund: "payments.payment.refund",
  PaymentCancel: "payments.payment.cancel",
} as const;

export type PaymentsPermission =
  (typeof PaymentsPermissions)[keyof typeof PaymentsPermissions];

export const PAYMENTS_PERMISSION_KEYS: readonly string[] = Object.values(
  PaymentsPermissions,
);
