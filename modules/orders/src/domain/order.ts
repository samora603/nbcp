export type OrderStatus =
  | "draft"
  | "committed"
  | "partially_fulfilled"
  | "fulfilled"
  | "cancelled";

export type OrderType = "sale" | "return" | "credit";

export interface Money {
  currency: string;
  amountMinor: number;
}

export interface PriceSnapshot {
  catalogName: string;
  catalogCode: string;
  unitPrice: Money;
  stockable: boolean;
  snappedAt: string;
}

export interface OrderLine {
  orderLineId: string;
  catalogItemId: string;
  variantId: string | null;
  quantity: number;
  /** Quantity already fulfilled (0 until fulfill). */
  fulfilledQuantity: number;
  /** Provisional until commit; finalized on commit. */
  snapshot: PriceSnapshot | null;
  lineTotal: Money | null;
}

export interface Order {
  orderId: string;
  organizationId: string;
  locationId: string | null;
  customerPartyId: string;
  status: OrderStatus;
  type: OrderType;
  currency: string;
  channel: string | null;
  externalRef: string | null;
  lines: OrderLine[];
  totals: Money;
  createdAt: string;
  updatedAt: string;
  committedAt: string | null;
  cancelledAt: string | null;
  fulfilledAt: string | null;
}

export type OrderView = Order;

export function toOrderView(order: Order): OrderView {
  return structuredClone(order);
}

export function isTerminalStatus(status: OrderStatus): boolean {
  return status === "fulfilled" || status === "cancelled";
}

export function isDraft(status: OrderStatus): boolean {
  return status === "draft";
}

/** ADR-0007 line summary for Inventory consumers. */
export interface OrderLineSummary {
  orderLineId: string;
  catalogItemId: string;
  variantId: string | null;
  quantity: number;
  fulfilledQuantity: number;
  stockable: boolean;
}

export function toLineSummaries(order: Order): OrderLineSummary[] {
  return order.lines.map((l) => ({
    orderLineId: l.orderLineId,
    catalogItemId: l.catalogItemId,
    variantId: l.variantId,
    quantity: l.quantity,
    fulfilledQuantity: l.fulfilledQuantity,
    stockable: l.snapshot?.stockable ?? false,
  }));
}

const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  draft: ["committed", "cancelled"],
  committed: ["partially_fulfilled", "fulfilled", "cancelled"],
  partially_fulfilled: ["fulfilled", "cancelled"],
  fulfilled: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function recomputeTotals(lines: OrderLine[], currency: string): Money {
  let amountMinor = 0;
  for (const line of lines) {
    if (line.lineTotal) {
      if (line.lineTotal.currency !== currency) {
        throw new Error("currency mismatch across lines");
      }
      amountMinor += line.lineTotal.amountMinor;
    }
  }
  return { currency, amountMinor };
}

export function moneyValidationError(money: Money): string | null {
  if (!money.currency || !/^[A-Z]{3}$/.test(money.currency)) {
    return "currency must be ISO 4217 (3 uppercase letters)";
  }
  if (
    typeof money.amountMinor !== "number" ||
    !Number.isInteger(money.amountMinor) ||
    money.amountMinor < 0
  ) {
    return "amountMinor must be a non-negative integer";
  }
  return null;
}
