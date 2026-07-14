/** Permission catalog keys owned by Orders. */
export const OrdersPermissions = {
  OrderRead: "orders.order.read",
  OrderManage: "orders.order.manage",
  OrderCommit: "orders.order.commit",
  OrderFulfill: "orders.order.fulfill",
  OrderCancel: "orders.order.cancel",
} as const;

export type OrdersPermission =
  (typeof OrdersPermissions)[keyof typeof OrdersPermissions];

export const ORDERS_PERMISSION_KEYS: readonly string[] = Object.values(
  OrdersPermissions,
);
