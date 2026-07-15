/** Consumed order event types (Inventory does not import @nbcp/orders). */
export const CONSUMED_ORDER_EVENT_TYPES = {
  OrderCommitted: "orders.order.committed",
  OrderFulfilled: "orders.order.fulfilled",
  OrderPartiallyFulfilled: "orders.order.partially_fulfilled",
  OrderCancelled: "orders.order.cancelled",
} as const;

export type ConsumedOrderEventType =
  (typeof CONSUMED_ORDER_EVENT_TYPES)[keyof typeof CONSUMED_ORDER_EVENT_TYPES];

export const InventoryEventTypes = {
  StockReserved: "inventory.stock.reserved",
  StockReleased: "inventory.stock.released",
  StockIssued: "inventory.stock.issued",
  StockReceived: "inventory.stock.received",
  StockAdjusted: "inventory.stock.adjusted",
} as const;

export type InventoryEventType =
  (typeof InventoryEventTypes)[keyof typeof InventoryEventTypes];

export const INVENTORY_EVENT_TYPE_SET: ReadonlySet<string> = new Set(
  Object.values(InventoryEventTypes),
);

/** Maps order event type to inventory movement type. */
export function movementTypeForOrderEvent(
  eventType: string,
): "reserve" | "release" | "issue" | null {
  switch (eventType) {
    case CONSUMED_ORDER_EVENT_TYPES.OrderCommitted:
      return "reserve";
    case CONSUMED_ORDER_EVENT_TYPES.OrderCancelled:
      return "release";
    case CONSUMED_ORDER_EVENT_TYPES.OrderFulfilled:
    case CONSUMED_ORDER_EVENT_TYPES.OrderPartiallyFulfilled:
      return "issue";
    default:
      return null;
  }
}

export function publishedEventForMovementType(
  type: "reserve" | "release" | "issue" | "receipt" | "adjustment",
): string {
  switch (type) {
    case "reserve":
      return InventoryEventTypes.StockReserved;
    case "release":
      return InventoryEventTypes.StockReleased;
    case "issue":
      return InventoryEventTypes.StockIssued;
    case "receipt":
      return InventoryEventTypes.StockReceived;
    case "adjustment":
      return InventoryEventTypes.StockAdjusted;
  }
}
