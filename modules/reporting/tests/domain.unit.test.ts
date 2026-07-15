import { describe, expect, it } from "vitest";
import {
  calculateOrderKpi,
  calculateRevenueKpi,
  calculateInventoryKpi,
  movementTypeFromInventoryEvent,
} from "../src/domain/kpis.js";
import { inventoryBalanceAvailable } from "../src/domain/projections.js";
import { ALL_CONSUMED_EVENT_TYPES } from "../src/domain/events.js";
import { REPORTING_PERMISSION_KEYS } from "../src/application/permissions.js";

describe("reporting domain unit", () => {
  it("calculates revenue KPI from financial and payment facts", () => {
    const kpi = calculateRevenueKpi(
      [
        {
          journalId: "j1",
          organizationId: "org",
          sourceEventId: "pay-cap",
          sourceEventType: "payments.payment.captured",
          amount: 5000,
          currency: "USD",
          postedAt: "2026-01-01",
          projectionEventId: "e1",
        },
      ],
      [
        {
          paymentId: "p1",
          orderId: "o1",
          organizationId: "org",
          status: "refunded",
          amount: 1000,
          currency: "USD",
          authorizedAt: null,
          capturedAt: null,
          refundedAt: "2026-01-02",
          lastEventId: "e2",
          updatedAt: "2026-01-02",
        },
      ],
    );
    expect(kpi.revenueMinor).toBe(5000);
    expect(kpi.refundsMinor).toBe(1000);
    expect(kpi.netRevenueMinor).toBe(4000);
  });

  it("calculates order KPI including AOV", () => {
    const kpi = calculateOrderKpi([
      {
        orderId: "o1",
        organizationId: "org",
        customerId: "c1",
        status: "committed",
        orderTotal: 3000,
        currency: "USD",
        committedAt: "2026-01-01",
        fulfilledAt: null,
        cancelledAt: null,
        lastEventId: "e1",
        updatedAt: "2026-01-01",
      },
      {
        orderId: "o2",
        organizationId: "org",
        customerId: "c2",
        status: "fulfilled",
        orderTotal: 5000,
        currency: "USD",
        committedAt: "2026-01-02",
        fulfilledAt: "2026-01-03",
        cancelledAt: null,
        lastEventId: "e2",
        updatedAt: "2026-01-03",
      },
    ]);
    expect(kpi.orderCount).toBe(2);
    expect(kpi.fulfilledOrders).toBe(1);
    expect(kpi.averageOrderValueMinor).toBe(4000);
  });

  it("calculates inventory KPI rows", () => {
    const rows = calculateInventoryKpi([
      {
        organizationId: "org",
        sku: "SKU-1",
        onHand: 100,
        reserved: 20,
        movementCount: 5,
        updatedAt: "2026-01-01",
      },
    ]);
    expect(rows[0]?.available).toBe(80);
    expect(rows[0]?.movementCount).toBe(5);
  });

  it("maps inventory event types to movement types", () => {
    expect(movementTypeFromInventoryEvent("inventory.stock.reserved")).toBe(
      "reserve",
    );
    expect(movementTypeFromInventoryEvent("inventory.stock.released")).toBe(
      "release",
    );
    expect(inventoryBalanceAvailable({
      organizationId: "org",
      sku: "s",
      onHand: 10,
      reserved: 3,
      movementCount: 0,
      updatedAt: "x",
    })).toBe(7);
  });

  it("consumes known event types and permission prefixes", () => {
    expect(ALL_CONSUMED_EVENT_TYPES.has("orders.order.committed")).toBe(true);
    expect(ALL_CONSUMED_EVENT_TYPES.has("ledger.journal.posted")).toBe(true);
    for (const k of REPORTING_PERMISSION_KEYS) {
      expect(k.startsWith("reporting.")).toBe(true);
    }
  });
});
