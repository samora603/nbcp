import { describe, expect, it } from "vitest";
import {
  canTransition,
  isDraft,
  isTerminalStatus,
  toLineSummaries,
  type Order,
} from "../src/domain/order.js";
import {
  OrdersEventTypes,
  ORDERS_EVENT_TYPE_SET,
} from "../src/domain/events.js";
import { ORDERS_PERMISSION_KEYS } from "../src/application/permissions.js";

describe("orders domain unit", () => {
  it("enforces lifecycle transitions", () => {
    expect(canTransition("draft", "committed")).toBe(true);
    expect(canTransition("draft", "cancelled")).toBe(true);
    expect(canTransition("draft", "fulfilled")).toBe(false);
    expect(canTransition("committed", "fulfilled")).toBe(true);
    expect(canTransition("committed", "partially_fulfilled")).toBe(true);
    expect(canTransition("committed", "cancelled")).toBe(true);
    expect(canTransition("partially_fulfilled", "fulfilled")).toBe(true);
    expect(canTransition("fulfilled", "cancelled")).toBe(false);
    expect(canTransition("cancelled", "committed")).toBe(false);
  });

  it("terminal and draft helpers", () => {
    expect(isDraft("draft")).toBe(true);
    expect(isTerminalStatus("fulfilled")).toBe(true);
    expect(isTerminalStatus("cancelled")).toBe(true);
    expect(isTerminalStatus("committed")).toBe(false);
  });

  it("builds ADR-0007 line summaries", () => {
    const order: Order = {
      orderId: "o1",
      organizationId: "org",
      locationId: "loc",
      customerPartyId: "p1",
      status: "committed",
      type: "sale",
      currency: "USD",
      channel: null,
      externalRef: null,
      lines: [
        {
          orderLineId: "l1",
          catalogItemId: "c1",
          variantId: null,
          quantity: 3,
          fulfilledQuantity: 1,
          snapshot: {
            catalogName: "Widget",
            catalogCode: "W-1",
            unitPrice: { currency: "USD", amountMinor: 100 },
            stockable: true,
            snappedAt: "2026-01-01T00:00:00.000Z",
          },
          lineTotal: { currency: "USD", amountMinor: 300 },
        },
      ],
      totals: { currency: "USD", amountMinor: 300 },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      committedAt: "2026-01-01T00:00:00.000Z",
      cancelledAt: null,
      fulfilledAt: null,
    };
    const summaries = toLineSummaries(order);
    expect(summaries[0]?.stockable).toBe(true);
    expect(summaries[0]?.quantity).toBe(3);
    expect(summaries[0]?.fulfilledQuantity).toBe(1);
  });

  it("event and permission keys match catalog prefixes", () => {
    for (const t of ORDERS_EVENT_TYPE_SET) {
      expect(t.startsWith("orders.")).toBe(true);
    }
    expect(OrdersEventTypes.OrderCommitted).toBe("orders.order.committed");
    expect(ORDERS_PERMISSION_KEYS).toContain("orders.order.commit");
    expect(ORDERS_PERMISSION_KEYS).toContain("orders.order.fulfill");
  });
});
