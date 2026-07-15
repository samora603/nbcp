export interface OrderFact {
  orderId: string;
  organizationId: string;
  customerId: string;
  status: string;
  orderTotal: number;
  currency: string;
  committedAt: string | null;
  fulfilledAt: string | null;
  cancelledAt: string | null;
  lastEventId: string;
  updatedAt: string;
}

export interface PaymentFact {
  paymentId: string;
  orderId: string;
  organizationId: string;
  status: string;
  amount: number;
  currency: string;
  authorizedAt: string | null;
  capturedAt: string | null;
  refundedAt: string | null;
  lastEventId: string;
  updatedAt: string;
}

export interface InventoryMovementFact {
  movementId: string;
  organizationId: string;
  sku: string;
  movementType: string;
  quantity: number;
  occurredAt: string;
  sourceEventId: string;
}

export interface InventoryBalanceProjection {
  organizationId: string;
  sku: string;
  onHand: number;
  reserved: number;
  movementCount: number;
  updatedAt: string;
}

export interface FinancialFact {
  journalId: string;
  organizationId: string;
  sourceEventId: string;
  sourceEventType: string;
  amount: number;
  currency: string;
  postedAt: string;
  projectionEventId: string;
}

export interface ProcessedProjectionEvent {
  organizationId: string;
  sourceEventId: string;
  handler: string;
  processedAt: string;
}

export function inventoryBalanceAvailable(
  balance: InventoryBalanceProjection,
): number {
  return balance.onHand - balance.reserved;
}
