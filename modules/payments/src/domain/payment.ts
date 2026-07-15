export type PaymentStatus =
  | "pending"
  | "authorized"
  | "captured"
  | "partially_refunded"
  | "refunded"
  | "voided"
  | "failed";

export interface Money {
  currency: string;
  amountMinor: number;
}

export interface Payment {
  paymentId: string;
  organizationId: string;
  orderId: string;
  amount: Money;
  currency: string;
  provider: string;
  providerReference: string | null;
  status: PaymentStatus;
  refundedAmountMinor: number;
  authorizedAt: string | null;
  capturedAt: string | null;
  refundedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PaymentView = Payment;

export function toPaymentView(payment: Payment): PaymentView {
  return structuredClone(payment);
}

export function isTerminalPaymentStatus(status: PaymentStatus): boolean {
  return (
    status === "refunded" ||
    status === "voided" ||
    status === "failed"
  );
}

const ALLOWED_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  pending: ["authorized", "failed"],
  authorized: ["captured", "voided", "failed"],
  captured: ["partially_refunded", "refunded"],
  partially_refunded: ["refunded"],
  refunded: [],
  voided: [],
  failed: [],
};

export function canTransition(
  from: PaymentStatus,
  to: PaymentStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function moneyValidationError(money: Money): string | null {
  if (!money.currency || !/^[A-Z]{3}$/.test(money.currency)) {
    return "currency must be ISO 4217 (3 uppercase letters)";
  }
  if (
    typeof money.amountMinor !== "number" ||
    !Number.isInteger(money.amountMinor) ||
    money.amountMinor <= 0
  ) {
    return "amountMinor must be a positive integer";
  }
  return null;
}
