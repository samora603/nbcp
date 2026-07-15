import type {
  FinancialFact,
  InventoryBalanceProjection,
  OrderFact,
  PaymentFact,
} from "./projections.js";
import { inventoryBalanceAvailable } from "./projections.js";

const PAYMENT_CAPTURED = "payments.payment.captured";
const PAYMENT_REFUNDED = "payments.payment.refunded";

export interface RevenueKpi {
  revenueMinor: number;
  refundsMinor: number;
  netRevenueMinor: number;
  currency: string | null;
}

export interface OrderKpi {
  orderCount: number;
  fulfilledOrders: number;
  cancelledOrders: number;
  averageOrderValueMinor: number;
  currency: string | null;
}

export interface InventoryKpiRow {
  sku: string;
  onHand: number;
  reserved: number;
  available: number;
  movementCount: number;
}

export function calculateRevenueKpi(
  financialFacts: readonly FinancialFact[],
  paymentFacts: readonly PaymentFact[],
  currencyFilter?: string,
): RevenueKpi {
  let revenueMinor = 0;
  let refundsMinor = 0;
  let currency: string | null = null;

  for (const fact of financialFacts) {
    if (fact.sourceEventType !== PAYMENT_CAPTURED) continue;
    if (currencyFilter && fact.currency !== currencyFilter) continue;
    currency = fact.currency;
    revenueMinor += fact.amount;
  }

  for (const fact of paymentFacts) {
    if (fact.status !== "refunded" && fact.status !== "partially_refunded") {
      continue;
    }
    if (currencyFilter && fact.currency !== currencyFilter) continue;
    currency = fact.currency;
    refundsMinor += fact.amount;
  }

  return {
    revenueMinor,
    refundsMinor,
    netRevenueMinor: revenueMinor - refundsMinor,
    currency,
  };
}

export function calculateOrderKpi(
  orderFacts: readonly OrderFact[],
  currencyFilter?: string,
): OrderKpi {
  const committed = orderFacts.filter((o) => {
    if (!o.committedAt) return false;
    if (currencyFilter && o.currency !== currencyFilter) return false;
    return true;
  });

  const fulfilledOrders = committed.filter(
    (o) => o.status === "fulfilled" || o.status === "partially_fulfilled",
  ).length;
  const cancelledOrders = committed.filter(
    (o) => o.status === "cancelled",
  ).length;

  let totalMinor = 0;
  let currency: string | null = null;
  for (const o of committed) {
    currency = o.currency;
    totalMinor += o.orderTotal;
  }

  const orderCount = committed.length;
  const averageOrderValueMinor =
    orderCount > 0 ? Math.round(totalMinor / orderCount) : 0;

  return {
    orderCount,
    fulfilledOrders,
    cancelledOrders,
    averageOrderValueMinor,
    currency,
  };
}

export function calculateInventoryKpi(
  balances: readonly InventoryBalanceProjection[],
): InventoryKpiRow[] {
  return balances.map((b) => ({
    sku: b.sku,
    onHand: b.onHand,
    reserved: b.reserved,
    available: inventoryBalanceAvailable(b),
    movementCount: b.movementCount,
  }));
}

export function movementTypeFromInventoryEvent(eventType: string): string | null {
  switch (eventType) {
    case "inventory.stock.reserved":
      return "reserve";
    case "inventory.stock.released":
      return "release";
    case "inventory.stock.issued":
      return "issue";
    case "inventory.stock.received":
      return "receipt";
    case "inventory.stock.adjusted":
      return "adjustment";
    default:
      return null;
  }
}
