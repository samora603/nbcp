/** Permission catalog keys owned by Inventory. */
export const InventoryPermissions = {
  StockRead: "inventory.stock.read",
  StockReceive: "inventory.stock.receive",
  StockAdjust: "inventory.stock.adjust",
  StockReserve: "inventory.stock.reserve",
  StockIssue: "inventory.stock.issue",
} as const;

export type InventoryPermission =
  (typeof InventoryPermissions)[keyof typeof InventoryPermissions];

export const INVENTORY_PERMISSION_KEYS: readonly string[] = Object.values(
  InventoryPermissions,
);
