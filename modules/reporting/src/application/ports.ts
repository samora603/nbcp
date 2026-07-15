import type {
  FinancialFact,
  InventoryBalanceProjection,
  InventoryMovementFact,
  OrderFact,
  PaymentFact,
  ProcessedProjectionEvent,
} from "../domain/projections.js";

export interface TenancyOrgLookup {
  getOrganization(organizationId: string): Promise<{
    organizationId: string;
    status: string;
  } | null>;
  getMembership(
    organizationId: string,
    principalId: string,
  ): Promise<{ state: string } | null>;
}

export interface RbacAuthorizePort {
  authorize(input: {
    principalId: string;
    permissionKey: string;
    organizationId: string;
    locationId?: string | null;
  }): Promise<{ allowed: boolean; reason?: string }>;
}

export interface Clock {
  now(): string;
}

export interface ProjectionStore {
  isProcessed(
    organizationId: string,
    sourceEventId: string,
    handler: string,
  ): Promise<boolean>;
  markProcessed(event: ProcessedProjectionEvent): Promise<void>;

  upsertOrderFact(fact: OrderFact): Promise<void>;
  getOrderFact(
    organizationId: string,
    orderId: string,
  ): Promise<OrderFact | null>;
  listOrderFacts(organizationId: string): Promise<OrderFact[]>;

  upsertPaymentFact(fact: PaymentFact): Promise<void>;
  getPaymentFactBySourceEvent(
    organizationId: string,
    sourceEventId: string,
  ): Promise<PaymentFact | null>;
  listPaymentFacts(organizationId: string): Promise<PaymentFact[]>;

  appendInventoryMovement(fact: InventoryMovementFact): Promise<boolean>;
  getInventoryBalance(
    organizationId: string,
    sku: string,
  ): Promise<InventoryBalanceProjection | null>;
  upsertInventoryBalance(balance: InventoryBalanceProjection): Promise<void>;
  listInventoryBalances(organizationId: string): Promise<InventoryBalanceProjection[]>;
  listInventoryMovements(organizationId: string): Promise<InventoryMovementFact[]>;

  appendFinancialFact(fact: FinancialFact): Promise<boolean>;
  listFinancialFacts(organizationId: string): Promise<FinancialFact[]>;
}

export interface ReportingRuntime {
  tenancy: TenancyOrgLookup;
  rbac: RbacAuthorizePort;
  store: ProjectionStore;
  clock: Clock;
}
