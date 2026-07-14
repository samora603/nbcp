export const OrdersEventTypes = {
  OrderCreated: "orders.order.created",
  OrderUpdated: "orders.order.updated",
  OrderCommitted: "orders.order.committed",
  OrderPartiallyFulfilled: "orders.order.partially_fulfilled",
  OrderFulfilled: "orders.order.fulfilled",
  OrderCancelled: "orders.order.cancelled",
  LineAdded: "orders.line.added",
  LineRemoved: "orders.line.removed",
  PricingFinalized: "orders.pricing.finalized",
} as const;

export type OrdersEventType =
  (typeof OrdersEventTypes)[keyof typeof OrdersEventTypes];

export const ORDERS_EVENT_TYPE_SET: ReadonlySet<string> = new Set(
  Object.values(OrdersEventTypes),
);
