import type { ReportingRuntime } from "./ports.js";
import type {
  FinancialFact,
  InventoryBalanceProjection,
  InventoryMovementFact,
  OrderFact,
  PaymentFact,
} from "../domain/projections.js";
import {
  calculateInventoryKpi,
  calculateOrderKpi,
  calculateRevenueKpi,
  movementTypeFromInventoryEvent,
} from "../domain/kpis.js";
import { ALL_CONSUMED_EVENT_TYPES } from "../domain/events.js";
import { AuthorizationError, ValidationError } from "../domain/errors.js";
import { ReportingPermissions } from "./permissions.js";

export interface ActorContext {
  principalId: string;
  organizationId: string;
  locationId?: string | null;
}

export interface ConsumedDomainEvent {
  eventId: string;
  eventType: string;
  eventVersion?: number;
  occurredAt: string;
  organizationId: string;
  payload: Record<string, unknown>;
}

export interface RevenueReport {
  organizationId: string;
  period: { from: string | null; to: string | null };
  revenue: number;
  refunds: number;
  netRevenue: number;
  currency: string | null;
}

export interface OrdersReport {
  organizationId: string;
  orderCount: number;
  fulfilledOrders: number;
  cancelledOrders: number;
  averageOrderValue: number;
  currency: string | null;
}

export interface InventoryReportRow {
  sku: string;
  onHand: number;
  reserved: number;
  available: number;
  movementCount: number;
}

/**
 * Reporting application facade (S7).
 * Read-model projections only — never mutates Orders, Payments, Inventory, or Ledger.
 */
export class ReportingService {
  constructor(private readonly runtime: ReportingRuntime) {}

  private async requireOrg(organizationId: string): Promise<void> {
    const org = await this.runtime.tenancy.getOrganization(organizationId);
    if (!org || org.status !== "active") {
      throw new ValidationError("organization not active");
    }
  }

  private async requireAuthorized(
    actor: ActorContext,
    permissionKey: string,
  ): Promise<void> {
    const membership = await this.runtime.tenancy.getMembership(
      actor.organizationId,
      actor.principalId,
    );
    if (!membership || membership.state !== "active") {
      throw new AuthorizationError("active membership required");
    }
    const decision = await this.runtime.rbac.authorize({
      principalId: actor.principalId,
      permissionKey,
      organizationId: actor.organizationId,
      locationId: actor.locationId ?? null,
    });
    if (!decision.allowed) {
      throw new AuthorizationError(
        `denied: ${decision.reason ?? permissionKey}`,
      );
    }
  }

  private async skipIfProcessed(
    organizationId: string,
    sourceEventId: string,
    handler: string,
  ): Promise<boolean> {
    return this.runtime.store.isProcessed(
      organizationId,
      sourceEventId,
      handler,
    );
  }

  private async markProcessed(
    organizationId: string,
    sourceEventId: string,
    handler: string,
  ): Promise<void> {
    await this.runtime.store.markProcessed({
      organizationId,
      sourceEventId,
      handler,
      processedAt: this.runtime.clock.now(),
    });
  }

  private moneyFromPayload(payload: Record<string, unknown>): {
    amount: number;
    currency: string;
  } {
    const totals = payload.totals as
      | { amountMinor?: number; currency?: string }
      | undefined;
    if (totals?.amountMinor != null && totals.currency) {
      return { amount: totals.amountMinor, currency: totals.currency };
    }
    const amount = Number(payload.amount ?? 0);
    const currency = String(payload.currency ?? "USD");
    return { amount, currency };
  }

  private async projectOrderEvent(event: ConsumedDomainEvent): Promise<void> {
    const handler = "order_fact";
    if (
      await this.skipIfProcessed(
        event.organizationId,
        event.eventId,
        handler,
      )
    ) {
      return;
    }

    const p = event.payload;
    const orderId = String(p.orderId ?? "");
    if (!orderId) {
      throw new ValidationError("orderId required in order event payload");
    }

    const existing =
      (await this.runtime.store.getOrderFact(
        event.organizationId,
        orderId,
      )) ??
      ({
        orderId,
        organizationId: event.organizationId,
        customerId: String(p.customerPartyId ?? ""),
        status: "draft",
        orderTotal: 0,
        currency: "USD",
        committedAt: null,
        fulfilledAt: null,
        cancelledAt: null,
        lastEventId: event.eventId,
        updatedAt: event.occurredAt,
      } satisfies OrderFact);

    const { amount, currency } = this.moneyFromPayload(p);
    const next: OrderFact = {
      ...existing,
      customerId: String(p.customerPartyId ?? existing.customerId),
      status: String(p.status ?? existing.status),
      orderTotal: amount || existing.orderTotal,
      currency,
      committedAt:
        event.eventType === "orders.order.committed"
          ? event.occurredAt
          : existing.committedAt,
      fulfilledAt:
        event.eventType === "orders.order.fulfilled"
          ? event.occurredAt
          : existing.fulfilledAt,
      cancelledAt:
        event.eventType === "orders.order.cancelled"
          ? event.occurredAt
          : existing.cancelledAt,
      lastEventId: event.eventId,
      updatedAt: event.occurredAt,
    };

    if (event.eventType === "orders.order.partially_fulfilled") {
      next.status = "partially_fulfilled";
    }

    await this.runtime.store.upsertOrderFact(next);
    await this.markProcessed(event.organizationId, event.eventId, handler);
  }

  private async projectPaymentEvent(event: ConsumedDomainEvent): Promise<void> {
    const handler = "payment_fact";
    if (
      await this.skipIfProcessed(
        event.organizationId,
        event.eventId,
        handler,
      )
    ) {
      return;
    }

    const p = event.payload;
    const paymentId = String(p.paymentId ?? "");
    if (!paymentId) {
      throw new ValidationError("paymentId required in payment event payload");
    }

    const existingList = await this.runtime.store.listPaymentFacts(
      event.organizationId,
    );
    const existing = existingList.find((f) => f.paymentId === paymentId);

    const { amount, currency } = this.moneyFromPayload(p);
    const statusFromType: Record<string, string> = {
      "payments.payment.created": "pending",
      "payments.payment.authorized": "authorized",
      "payments.payment.captured": "captured",
      "payments.payment.refunded": "refunded",
      "payments.payment.voided": "voided",
    };

    const next: PaymentFact = {
      paymentId,
      orderId: String(p.orderId ?? existing?.orderId ?? ""),
      organizationId: event.organizationId,
      status: statusFromType[event.eventType] ?? existing?.status ?? "pending",
      amount: amount || existing?.amount || 0,
      currency,
      authorizedAt:
        event.eventType === "payments.payment.authorized"
          ? event.occurredAt
          : (existing?.authorizedAt ?? null),
      capturedAt:
        event.eventType === "payments.payment.captured"
          ? event.occurredAt
          : (existing?.capturedAt ?? null),
      refundedAt:
        event.eventType === "payments.payment.refunded"
          ? event.occurredAt
          : (existing?.refundedAt ?? null),
      lastEventId: event.eventId,
      updatedAt: event.occurredAt,
    };

    if (
      event.eventType === "payments.payment.refunded" &&
      p.refundedAmountMinor != null &&
      Number(p.refundedAmountMinor) < next.amount
    ) {
      next.status = "partially_refunded";
    }

    await this.runtime.store.upsertPaymentFact(next);
    await this.markProcessed(event.organizationId, event.eventId, handler);
  }

  private async projectInventoryEvent(
    event: ConsumedDomainEvent,
  ): Promise<void> {
    const handler = "inventory_movement";
    if (
      await this.skipIfProcessed(
        event.organizationId,
        event.eventId,
        handler,
      )
    ) {
      return;
    }

    const p = event.payload;
    const movementId = String(p.movementId ?? event.eventId);
    const sku = String(p.sku ?? "");
    const quantity = Math.abs(Number(p.quantity ?? 0));
    const movementType =
      movementTypeFromInventoryEvent(event.eventType) ?? "unknown";

    const movement: InventoryMovementFact = {
      movementId,
      organizationId: event.organizationId,
      sku,
      movementType,
      quantity,
      occurredAt: event.occurredAt,
      sourceEventId: event.eventId,
    };

    const appended = await this.runtime.store.appendInventoryMovement(movement);
    if (!appended) {
      await this.markProcessed(event.organizationId, event.eventId, handler);
      return;
    }

    const balance =
      (await this.runtime.store.getInventoryBalance(
        event.organizationId,
        sku,
      )) ??
      ({
        organizationId: event.organizationId,
        sku,
        onHand: 0,
        reserved: 0,
        movementCount: 0,
        updatedAt: event.occurredAt,
      } satisfies InventoryBalanceProjection);

    const delta = Number(p.quantity ?? 0);
    const nextBalance: InventoryBalanceProjection = {
      ...balance,
      movementCount: balance.movementCount + 1,
      updatedAt: event.occurredAt,
    };

    switch (movementType) {
      case "reserve":
        nextBalance.reserved += quantity;
        break;
      case "release":
        nextBalance.reserved -= quantity;
        break;
      case "issue":
        nextBalance.onHand -= quantity;
        nextBalance.reserved -= quantity;
        break;
      case "receipt":
        nextBalance.onHand += quantity;
        break;
      case "adjustment":
        nextBalance.onHand += delta;
        break;
    }

    if (nextBalance.onHand < 0 || nextBalance.reserved < 0) {
      throw new ValidationError("inventory projection would go negative");
    }
    if (nextBalance.onHand < nextBalance.reserved) {
      throw new ValidationError(
        "inventory projection onHand below reserved after event",
      );
    }

    await this.runtime.store.upsertInventoryBalance(nextBalance);
    await this.markProcessed(event.organizationId, event.eventId, handler);
  }

  private async projectLedgerEvent(event: ConsumedDomainEvent): Promise<void> {
    const handler = "financial_fact";
    if (
      await this.skipIfProcessed(
        event.organizationId,
        event.eventId,
        handler,
      )
    ) {
      return;
    }

    const p = event.payload;
    const journalId = String(p.journalId ?? "");
    const sourceEventId = String(p.sourceEventId ?? "");
    const sourceEventType = String(p.sourceEventType ?? "");

    let amount = 0;
    let currency = "USD";
    const paymentFact = await this.runtime.store.getPaymentFactBySourceEvent(
      event.organizationId,
      sourceEventId,
    );
    if (paymentFact) {
      amount = paymentFact.amount;
      currency = paymentFact.currency;
    }

    const fact: FinancialFact = {
      journalId,
      organizationId: event.organizationId,
      sourceEventId,
      sourceEventType,
      amount,
      currency,
      postedAt: event.occurredAt,
      projectionEventId: event.eventId,
    };

    await this.runtime.store.appendFinancialFact(fact);
    await this.markProcessed(event.organizationId, event.eventId, handler);
  }

  /** Project a single consumed domain event (idempotent). */
  async consumeEvent(
    actor: ActorContext,
    event: ConsumedDomainEvent,
  ): Promise<void> {
    await this.requireOrg(actor.organizationId);
    await this.requireAuthorized(actor, ReportingPermissions.Read);

    if (!ALL_CONSUMED_EVENT_TYPES.has(event.eventType)) {
      throw new ValidationError(`unsupported event type: ${event.eventType}`);
    }
    if (event.organizationId !== actor.organizationId) {
      throw new ValidationError("organizationId mismatch");
    }

    if (event.eventType.startsWith("orders.")) {
      await this.projectOrderEvent(event);
      return;
    }
    if (event.eventType.startsWith("payments.")) {
      await this.projectPaymentEvent(event);
      return;
    }
    if (event.eventType.startsWith("inventory.")) {
      await this.projectInventoryEvent(event);
      return;
    }
    if (event.eventType.startsWith("ledger.")) {
      await this.projectLedgerEvent(event);
    }
  }

  async getRevenueReport(
    actor: ActorContext,
    filter: { from?: string; to?: string; currency?: string } = {},
  ): Promise<RevenueReport> {
    await this.requireAuthorized(actor, ReportingPermissions.KpiRead);
    const financialFacts = await this.runtime.store.listFinancialFacts(
      actor.organizationId,
    );
    const paymentFacts = await this.runtime.store.listPaymentFacts(
      actor.organizationId,
    );

    const inRange = (at: string) => {
      if (filter.from && at < filter.from) return false;
      if (filter.to && at > filter.to) return false;
      return true;
    };

    const filteredFinancial = financialFacts.filter((f) =>
      inRange(f.postedAt),
    );
    const filteredPayments = paymentFacts.filter((f) =>
      f.refundedAt ? inRange(f.refundedAt) : false,
    );

    const kpi = calculateRevenueKpi(
      filteredFinancial,
      filteredPayments,
      filter.currency,
    );

    return {
      organizationId: actor.organizationId,
      period: { from: filter.from ?? null, to: filter.to ?? null },
      revenue: kpi.revenueMinor,
      refunds: kpi.refundsMinor,
      netRevenue: kpi.netRevenueMinor,
      currency: kpi.currency,
    };
  }

  async getOrdersReport(actor: ActorContext): Promise<OrdersReport> {
    await this.requireAuthorized(actor, ReportingPermissions.KpiRead);
    const orderFacts = await this.runtime.store.listOrderFacts(
      actor.organizationId,
    );
    const kpi = calculateOrderKpi(orderFacts);
    return {
      organizationId: actor.organizationId,
      orderCount: kpi.orderCount,
      fulfilledOrders: kpi.fulfilledOrders,
      cancelledOrders: kpi.cancelledOrders,
      averageOrderValue: kpi.averageOrderValueMinor,
      currency: kpi.currency,
    };
  }

  async getInventoryReport(
    actor: ActorContext,
  ): Promise<InventoryReportRow[]> {
    await this.requireAuthorized(actor, ReportingPermissions.Read);
    const balances = await this.runtime.store.listInventoryBalances(
      actor.organizationId,
    );
    return calculateInventoryKpi(balances);
  }

  async rebuildFromEvents(
    actor: ActorContext,
    events: ConsumedDomainEvent[],
  ): Promise<void> {
    await this.requireAuthorized(actor, ReportingPermissions.Export);
    for (const event of events) {
      await this.consumeEvent(actor, event);
    }
  }
}
