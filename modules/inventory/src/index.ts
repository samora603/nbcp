export { InventoryService } from "./application/inventory-service.js";
export type {
  ActorContext,
  ConsumedOrderEventPayload,
  ConsumedOrderLineSummary,
} from "./application/inventory-service.js";
export {
  createInventoryKernel,
} from "./application/create-inventory-kernel.js";
export type {
  CreateInventoryKernelOptions,
  InventoryKernel,
} from "./application/create-inventory-kernel.js";
export {
  InventoryPermissions,
  INVENTORY_PERMISSION_KEYS,
} from "./application/permissions.js";
export type { InventoryPermission } from "./application/permissions.js";
export {
  CONSUMED_ORDER_EVENT_TYPES,
  InventoryEventTypes,
  INVENTORY_EVENT_TYPE_SET,
  movementTypeForOrderEvent,
  publishedEventForMovementType,
} from "./domain/events.js";
export type {
  ConsumedOrderEventType,
  InventoryEventType,
} from "./domain/events.js";
export type {
  InventoryItem,
  InventoryItemView,
} from "./domain/inventory-item.js";
export {
  computeAvailable,
  toInventoryItemView,
  applyReserve,
  applyRelease,
  applyIssue,
  applyReceive,
  applyAdjust,
} from "./domain/inventory-item.js";
export type { Movement, MovementView, MovementType } from "./domain/movement.js";
export { toMovementView, idempotencyKey } from "./domain/movement.js";
export {
  InventoryError,
  ConflictError,
  NotFoundError,
  ValidationError,
  AuthorizationError,
  InsufficientStockError,
  ImmutableMovementError,
} from "./domain/errors.js";
