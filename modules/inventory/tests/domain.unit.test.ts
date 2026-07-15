import { describe, expect, it } from "vitest";
import {
  computeAvailable,
  applyReserve,
  applyRelease,
  applyIssue,
  applyReceive,
  applyAdjust,
  type InventoryItem,
} from "../src/domain/inventory-item.js";
import { idempotencyKey } from "../src/domain/movement.js";
import {
  CONSUMED_ORDER_EVENT_TYPES,
  InventoryEventTypes,
  INVENTORY_EVENT_TYPE_SET,
  movementTypeForOrderEvent,
  publishedEventForMovementType,
} from "../src/domain/events.js";
import { INVENTORY_PERMISSION_KEYS } from "../src/application/permissions.js";

const baseItem = (): InventoryItem => ({
  inventoryItemId: "i1",
  organizationId: "org",
  sku: "SKU-1",
  onHand: 100,
  reserved: 20,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("inventory domain unit", () => {
  const now = "2026-07-15T00:00:00.000Z";

  it("computes available = onHand - reserved", () => {
    expect(computeAvailable(baseItem())).toBe(80);
  });

  it("reserve increases reserved and decreases available", () => {
    const next = applyReserve(baseItem(), 10, now);
    expect(next.reserved).toBe(30);
    expect(computeAvailable(next)).toBe(70);
  });

  it("rejects reserve when insufficient available", () => {
    expect(() => applyReserve(baseItem(), 90, now)).toThrow(/insufficient/);
  });

  it("release decreases reserved", () => {
    const next = applyRelease(baseItem(), 5, now);
    expect(next.reserved).toBe(15);
    expect(computeAvailable(next)).toBe(85);
  });

  it("rejects over-release", () => {
    expect(() => applyRelease(baseItem(), 25, now)).toThrow(/exceeds reserved/);
  });

  it("issue decreases onHand and reserved", () => {
    const next = applyIssue(baseItem(), 10, now);
    expect(next.onHand).toBe(90);
    expect(next.reserved).toBe(10);
    expect(computeAvailable(next)).toBe(80);
  });

  it("rejects over-issue", () => {
    expect(() => applyIssue(baseItem(), 25, now)).toThrow(/exceeds reserved/);
  });

  it("receive increases onHand", () => {
    const next = applyReceive(baseItem(), 50, now);
    expect(next.onHand).toBe(150);
    expect(computeAvailable(next)).toBe(130);
  });

  it("rejects invalid adjustment below reserved", () => {
    expect(() => applyAdjust(baseItem(), -90, now)).toThrow(/below reserved/);
  });

  it("maps ADR-0007 order events to movement types", () => {
    expect(
      movementTypeForOrderEvent(CONSUMED_ORDER_EVENT_TYPES.OrderCommitted),
    ).toBe("reserve");
    expect(
      movementTypeForOrderEvent(CONSUMED_ORDER_EVENT_TYPES.OrderCancelled),
    ).toBe("release");
    expect(
      movementTypeForOrderEvent(CONSUMED_ORDER_EVENT_TYPES.OrderFulfilled),
    ).toBe("issue");
    expect(
      movementTypeForOrderEvent(
        CONSUMED_ORDER_EVENT_TYPES.OrderPartiallyFulfilled,
      ),
    ).toBe("issue");
  });

  it("maps movement types to published inventory events", () => {
    expect(publishedEventForMovementType("reserve")).toBe(
      InventoryEventTypes.StockReserved,
    );
    expect(publishedEventForMovementType("release")).toBe(
      InventoryEventTypes.StockReleased,
    );
    expect(publishedEventForMovementType("issue")).toBe(
      InventoryEventTypes.StockIssued,
    );
  });

  it("idempotency key includes org, source event, sku, and type", () => {
    expect(idempotencyKey("org", "evt", "SKU", "reserve")).toBe(
      "org:evt:SKU:reserve",
    );
  });

  it("event and permission keys match catalog prefixes", () => {
    for (const t of INVENTORY_EVENT_TYPE_SET) {
      expect(t.startsWith("inventory.")).toBe(true);
    }
    for (const k of INVENTORY_PERMISSION_KEYS) {
      expect(k.startsWith("inventory.")).toBe(true);
    }
  });
});
