import { describe, expect, it } from "vitest";
import {
  canTransition,
  isTerminalPaymentStatus,
  moneyValidationError,
} from "../src/domain/payment.js";
import {
  PaymentsEventTypes,
  PAYMENTS_EVENT_TYPE_SET,
} from "../src/domain/events.js";
import { PAYMENTS_PERMISSION_KEYS } from "../src/application/permissions.js";

describe("payments domain unit", () => {
  it("enforces lifecycle transitions", () => {
    expect(canTransition("pending", "authorized")).toBe(true);
    expect(canTransition("pending", "failed")).toBe(true);
    expect(canTransition("pending", "captured")).toBe(false);
    expect(canTransition("authorized", "captured")).toBe(true);
    expect(canTransition("authorized", "voided")).toBe(true);
    expect(canTransition("authorized", "failed")).toBe(true);
    expect(canTransition("captured", "partially_refunded")).toBe(true);
    expect(canTransition("captured", "refunded")).toBe(true);
    expect(canTransition("partially_refunded", "refunded")).toBe(true);
    expect(canTransition("refunded", "partially_refunded")).toBe(false);
    expect(canTransition("voided", "captured")).toBe(false);
    expect(canTransition("failed", "authorized")).toBe(false);
  });

  it("terminal status helper", () => {
    expect(isTerminalPaymentStatus("refunded")).toBe(true);
    expect(isTerminalPaymentStatus("voided")).toBe(true);
    expect(isTerminalPaymentStatus("failed")).toBe(true);
    expect(isTerminalPaymentStatus("captured")).toBe(false);
  });

  it("validates money", () => {
    expect(moneyValidationError({ currency: "USD", amountMinor: 100 })).toBe(
      null,
    );
    expect(moneyValidationError({ currency: "usd", amountMinor: 100 })).not.toBe(
      null,
    );
    expect(moneyValidationError({ currency: "USD", amountMinor: 0 })).not.toBe(
      null,
    );
  });

  it("event and permission keys match catalog prefixes", () => {
    for (const t of PAYMENTS_EVENT_TYPE_SET) {
      expect(t.startsWith("payments.")).toBe(true);
    }
    expect(PaymentsEventTypes.Created).toBe("payments.payment.created");
    for (const k of PAYMENTS_PERMISSION_KEYS) {
      expect(k.startsWith("payments.")).toBe(true);
    }
  });
});
