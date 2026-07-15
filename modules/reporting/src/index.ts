export { ReportingService } from "./application/reporting-service.js";
export type {
  ActorContext,
  ConsumedDomainEvent,
  RevenueReport,
  OrdersReport,
  InventoryReportRow,
} from "./application/reporting-service.js";
export {
  createReportingKernel,
} from "./application/create-reporting-kernel.js";
export type {
  CreateReportingKernelOptions,
  ReportingKernel,
} from "./application/create-reporting-kernel.js";
export {
  ReportingPermissions,
  REPORTING_PERMISSION_KEYS,
} from "./application/permissions.js";
export type { ReportingPermission } from "./application/permissions.js";
export {
  CONSUMED_ORDER_EVENTS,
  CONSUMED_PAYMENT_EVENTS,
  CONSUMED_INVENTORY_EVENTS,
  CONSUMED_LEDGER_EVENTS,
  ALL_CONSUMED_EVENT_TYPES,
} from "./domain/events.js";
export type {
  OrderFact,
  PaymentFact,
  InventoryMovementFact,
  InventoryBalanceProjection,
  FinancialFact,
} from "./domain/projections.js";
export { inventoryBalanceAvailable } from "./domain/projections.js";
export {
  calculateRevenueKpi,
  calculateOrderKpi,
  calculateInventoryKpi,
  movementTypeFromInventoryEvent,
} from "./domain/kpis.js";
export type {
  RevenueKpi,
  OrderKpi,
  InventoryKpiRow,
} from "./domain/kpis.js";
export {
  ReportingError,
  NotFoundError,
  ValidationError,
  AuthorizationError,
} from "./domain/errors.js";
