import { randomUUID } from "node:crypto";
import type { DomainEventEnvelope, UnitOfWork } from "@nbcp/outbox";
import type { OrdersRuntime } from "./ports.js";
import {
  toOrderView,
  isDraft,
  isTerminalStatus,
  canTransition,
  recomputeTotals,
  toLineSummaries,
  type Order,
  type OrderLine,
  type OrderStatus,
  type OrderType,
  type OrderView,
  type PriceSnapshot,
} from "../domain/order.js";
import { OrdersEventTypes } from "../domain/events.js";
import {
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from "../domain/errors.js";
import { OrdersPermissions } from "./permissions.js";

export interface ActorContext {
  principalId: string;
  organizationId: string;
  locationId?: string | null;
}

/**
 * Orders application facade (S3).
 * Owns commercial commitments; Inventory reacts to events (ADR-0007) — Orders never mutates stock.
 */
export class OrdersService {
  constructor(private readonly runtime: OrdersRuntime) {}

  private publish(
    uow: UnitOfWork,
    type: string,
    organizationId: string,
    payload: Record<string, unknown>,
  ): DomainEventEnvelope {
    const envelope: DomainEventEnvelope = {
      eventId: randomUUID(),
      type,
      version: 1,
      occurredAt: this.runtime.clock.now(),
      producer: "orders",
      organizationId,
      correlationId: null,
      payload,
    };
    this.runtime.outbox.append(uow, envelope);
    return envelope;
  }

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

  private async requireOrder(
    organizationId: string,
    orderId: string,
  ): Promise<Order> {
    const order = await this.runtime.orders.findById(organizationId, orderId);
    if (!order) {
      throw new NotFoundError(`order not found: ${orderId}`);
    }
    return order;
  }

  private async assertCustomerUsable(
    organizationId: string,
    partyId: string,
  ): Promise<void> {
    const party = await this.runtime.parties.getParty(organizationId, partyId);
    if (!party) {
      throw new NotFoundError(`customer party not found: ${partyId}`);
    }
    if (party.status !== "active" && party.status !== "draft") {
      throw new ValidationError(
        `customer party not usable for business: ${party.status}`,
      );
    }
  }

  private async assertLocation(
    organizationId: string,
    locationId: string,
  ): Promise<void> {
    const locs = await this.runtime.tenancy.listLocations(organizationId);
    const loc = locs.find((l) => l.locationId === locationId);
    if (!loc || loc.status !== "active") {
      throw new ValidationError(`location not active: ${locationId}`);
    }
  }

  /** ADR-0007 payload block shared by commit / fulfill / cancel. */
  private inventorySignalPayload(order: Order): Record<string, unknown> {
    return {
      orderId: order.orderId,
      organizationId: order.organizationId,
      locationId: order.locationId,
      customerPartyId: order.customerPartyId,
      status: order.status,
      totals: order.totals,
      lineSummaries: toLineSummaries(order),
      /** Inventory intent markers (docs / consumers) — Orders does not mutate stock. */
      inventoryIntent:
        order.status === "committed"
          ? "reserve"
          : order.status === "cancelled"
            ? "release"
            : order.status === "fulfilled" ||
                order.status === "partially_fulfilled"
              ? "issue"
              : null,
    };
  }

  async createOrder(
    actor: ActorContext,
    input: {
      customerPartyId: string;
      locationId?: string | null;
      type?: OrderType;
      channel?: string | null;
      externalRef?: string | null;
      currency?: string;
    },
  ): Promise<OrderView> {
    await this.requireOrg(actor.organizationId);
    await this.requireAuthorized(actor, OrdersPermissions.OrderManage);

    const customerPartyId = input.customerPartyId?.trim();
    if (!customerPartyId) {
      throw new ValidationError("customerPartyId required");
    }
    await this.assertCustomerUsable(actor.organizationId, customerPartyId);

    const locationId = input.locationId ?? actor.locationId ?? null;
    if (locationId) {
      await this.assertLocation(actor.organizationId, locationId);
    }

    const currency = (input.currency ?? "USD").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new ValidationError("currency must be ISO 4217");
    }

    const now = this.runtime.clock.now();
    const order: Order = {
      orderId: this.runtime.ids.id(),
      organizationId: actor.organizationId,
      locationId,
      customerPartyId,
      status: "draft",
      type: input.type ?? "sale",
      currency,
      channel: input.channel ?? null,
      externalRef: input.externalRef ?? null,
      lines: [],
      totals: { currency, amountMinor: 0 },
      createdAt: now,
      updatedAt: now,
      committedAt: null,
      cancelledAt: null,
      fulfilledAt: null,
    };

    const uow = this.runtime.uowFactory.start();
    await this.runtime.orders.save(uow, order);
    this.publish(uow, OrdersEventTypes.OrderCreated, actor.organizationId, {
      orderId: order.orderId,
      customerPartyId: order.customerPartyId,
      status: order.status,
      locationId: order.locationId,
    });
    await uow.commit();
    return toOrderView(order);
  }

  async addLine(
    actor: ActorContext,
    input: {
      orderId: string;
      catalogItemId: string;
      variantId?: string | null;
      quantity: number;
    },
  ): Promise<OrderView> {
    await this.requireAuthorized(actor, OrdersPermissions.OrderManage);
    const order = await this.requireOrder(actor.organizationId, input.orderId);
    if (!isDraft(order.status)) {
      throw new ValidationError("lines can only be added to draft orders");
    }
    if (
      typeof input.quantity !== "number" ||
      !Number.isInteger(input.quantity) ||
      input.quantity < 1
    ) {
      throw new ValidationError("quantity must be a positive integer");
    }

    const catalogItemId = input.catalogItemId?.trim();
    if (!catalogItemId) {
      throw new ValidationError("catalogItemId required");
    }

    const assertInput: {
      organizationId: string;
      catalogItemId: string;
      variantId?: string | null;
      locationId?: string | null;
    } = {
      organizationId: actor.organizationId,
      catalogItemId,
    };
    if (input.variantId !== undefined) assertInput.variantId = input.variantId;
    if (order.locationId) assertInput.locationId = order.locationId;
    await this.runtime.catalog.assertItemOrderable(assertInput);

    const item = await this.runtime.catalog.getItem(
      actor.organizationId,
      catalogItemId,
    );
    if (!item) {
      throw new NotFoundError(`catalog item not found: ${catalogItemId}`);
    }

    const priceInput: {
      organizationId: string;
      catalogItemId: string;
      variantId?: string | null;
    } = { organizationId: actor.organizationId, catalogItemId };
    if (input.variantId !== undefined) priceInput.variantId = input.variantId;
    const price = await this.runtime.catalog.resolveListPrice(priceInput);
    if (!price) {
      throw new ValidationError("catalog item has no list price");
    }
    if (price.currency !== order.currency) {
      throw new ValidationError(
        `line currency ${price.currency} does not match order ${order.currency}`,
      );
    }

    const now = this.runtime.clock.now();
    const provisional: PriceSnapshot = {
      catalogName: item.name,
      catalogCode: item.code,
      unitPrice: {
        currency: price.currency,
        amountMinor: price.amountMinor,
      },
      stockable: item.stockable,
      snappedAt: now,
    };
    const line: OrderLine = {
      orderLineId: this.runtime.ids.id(),
      catalogItemId,
      variantId: input.variantId ?? null,
      quantity: input.quantity,
      fulfilledQuantity: 0,
      snapshot: provisional,
      lineTotal: {
        currency: price.currency,
        amountMinor: price.amountMinor * input.quantity,
      },
    };

    const lines = [...order.lines, line];
    const next: Order = {
      ...order,
      lines,
      totals: recomputeTotals(lines, order.currency),
      updatedAt: now,
    };

    const uow = this.runtime.uowFactory.start();
    await this.runtime.orders.save(uow, next);
    this.publish(uow, OrdersEventTypes.LineAdded, actor.organizationId, {
      orderId: next.orderId,
      orderLineId: line.orderLineId,
      catalogItemId: line.catalogItemId,
      quantity: line.quantity,
    });
    this.publish(uow, OrdersEventTypes.OrderUpdated, actor.organizationId, {
      orderId: next.orderId,
      changedFields: ["lines"],
    });
    await uow.commit();
    return toOrderView(next);
  }

  async updateLineQuantity(
    actor: ActorContext,
    input: { orderId: string; orderLineId: string; quantity: number },
  ): Promise<OrderView> {
    await this.requireAuthorized(actor, OrdersPermissions.OrderManage);
    const order = await this.requireOrder(actor.organizationId, input.orderId);
    if (!isDraft(order.status)) {
      throw new ValidationError("only draft lines can be updated");
    }
    if (
      typeof input.quantity !== "number" ||
      !Number.isInteger(input.quantity) ||
      input.quantity < 1
    ) {
      throw new ValidationError("quantity must be a positive integer");
    }
    const idx = order.lines.findIndex(
      (l) => l.orderLineId === input.orderLineId,
    );
    if (idx < 0) {
      throw new NotFoundError(`order line not found: ${input.orderLineId}`);
    }
    const current = order.lines[idx]!;
    if (!current.snapshot || !current.lineTotal) {
      throw new ValidationError("line missing price snapshot");
    }
    const updated: OrderLine = {
      ...current,
      quantity: input.quantity,
      lineTotal: {
        currency: current.snapshot.unitPrice.currency,
        amountMinor: current.snapshot.unitPrice.amountMinor * input.quantity,
      },
    };
    const lines = [...order.lines];
    lines[idx] = updated;
    const next: Order = {
      ...order,
      lines,
      totals: recomputeTotals(lines, order.currency),
      updatedAt: this.runtime.clock.now(),
    };
    const uow = this.runtime.uowFactory.start();
    await this.runtime.orders.save(uow, next);
    this.publish(uow, OrdersEventTypes.OrderUpdated, actor.organizationId, {
      orderId: next.orderId,
      changedFields: ["lines"],
    });
    await uow.commit();
    return toOrderView(next);
  }

  async removeLine(
    actor: ActorContext,
    input: { orderId: string; orderLineId: string },
  ): Promise<OrderView> {
    await this.requireAuthorized(actor, OrdersPermissions.OrderManage);
    const order = await this.requireOrder(actor.organizationId, input.orderId);
    if (!isDraft(order.status)) {
      throw new ValidationError("only draft lines can be removed");
    }
    if (!order.lines.some((l) => l.orderLineId === input.orderLineId)) {
      throw new NotFoundError(`order line not found: ${input.orderLineId}`);
    }
    const lines = order.lines.filter(
      (l) => l.orderLineId !== input.orderLineId,
    );
    const next: Order = {
      ...order,
      lines,
      totals: recomputeTotals(lines, order.currency),
      updatedAt: this.runtime.clock.now(),
    };
    const uow = this.runtime.uowFactory.start();
    await this.runtime.orders.save(uow, next);
    this.publish(uow, OrdersEventTypes.LineRemoved, actor.organizationId, {
      orderId: next.orderId,
      orderLineId: input.orderLineId,
    });
    this.publish(uow, OrdersEventTypes.OrderUpdated, actor.organizationId, {
      orderId: next.orderId,
      changedFields: ["lines"],
    });
    await uow.commit();
    return toOrderView(next);
  }

  async commitOrder(
    actor: ActorContext,
    orderId: string,
  ): Promise<OrderView> {
    await this.requireAuthorized(actor, OrdersPermissions.OrderCommit);
    const order = await this.requireOrder(actor.organizationId, orderId);
    if (!canTransition(order.status, "committed")) {
      throw new ValidationError(
        `cannot commit from status ${order.status}`,
      );
    }
    if (order.lines.length === 0) {
      throw new ValidationError("cannot commit order without lines");
    }
    await this.assertCustomerUsable(
      actor.organizationId,
      order.customerPartyId,
    );

    const now = this.runtime.clock.now();
    const lines: OrderLine[] = [];
    for (const line of order.lines) {
      const assertInput: {
        organizationId: string;
        catalogItemId: string;
        variantId?: string | null;
        locationId?: string | null;
      } = {
        organizationId: actor.organizationId,
        catalogItemId: line.catalogItemId,
      };
      if (line.variantId) assertInput.variantId = line.variantId;
      if (order.locationId) assertInput.locationId = order.locationId;
      await this.runtime.catalog.assertItemOrderable(assertInput);

      const item = await this.runtime.catalog.getItem(
        actor.organizationId,
        line.catalogItemId,
      );
      if (!item) {
        throw new NotFoundError(
          `catalog item not found: ${line.catalogItemId}`,
        );
      }
      const priceInput: {
        organizationId: string;
        catalogItemId: string;
        variantId?: string | null;
      } = {
        organizationId: actor.organizationId,
        catalogItemId: line.catalogItemId,
      };
      if (line.variantId) priceInput.variantId = line.variantId;
      const price = await this.runtime.catalog.resolveListPrice(priceInput);
      if (!price || price.currency !== order.currency) {
        throw new ValidationError(
          `cannot finalize price for line ${line.orderLineId}`,
        );
      }
      const snapshot: PriceSnapshot = {
        catalogName: item.name,
        catalogCode: item.code,
        unitPrice: {
          currency: price.currency,
          amountMinor: price.amountMinor,
        },
        stockable: item.stockable,
        snappedAt: now,
      };
      lines.push({
        ...line,
        snapshot,
        lineTotal: {
          currency: price.currency,
          amountMinor: price.amountMinor * line.quantity,
        },
      });
    }

    const next: Order = {
      ...order,
      status: "committed",
      lines,
      totals: recomputeTotals(lines, order.currency),
      committedAt: now,
      updatedAt: now,
    };

    const uow = this.runtime.uowFactory.start();
    await this.runtime.orders.save(uow, next);
    // ADR-0007: inventoryIntent "reserve" — Orders does not call Inventory.
    this.publish(
      uow,
      OrdersEventTypes.OrderCommitted,
      actor.organizationId,
      {
        ...this.inventorySignalPayload(next),
        inventoryIntent: "reserve",
      },
    );
    this.publish(
      uow,
      OrdersEventTypes.PricingFinalized,
      actor.organizationId,
      {
        orderId: next.orderId,
        totals: next.totals,
        lineSummaries: toLineSummaries(next),
      },
    );
    await uow.commit();
    return toOrderView(next);
  }

  async fulfillOrder(
    actor: ActorContext,
    orderId: string,
  ): Promise<OrderView> {
    await this.requireAuthorized(actor, OrdersPermissions.OrderFulfill);
    const order = await this.requireOrder(actor.organizationId, orderId);
    if (
      !canTransition(order.status, "fulfilled") &&
      order.status !== "partially_fulfilled" &&
      order.status !== "committed"
    ) {
      throw new ValidationError(
        `cannot fulfill from status ${order.status}`,
      );
    }
    if (order.status === "fulfilled") {
      return toOrderView(order);
    }
    if (order.status !== "committed" && order.status !== "partially_fulfilled") {
      throw new ValidationError(
        `cannot fulfill from status ${order.status}`,
      );
    }

    const now = this.runtime.clock.now();
    const lines = order.lines.map((l) => ({
      ...l,
      fulfilledQuantity: l.quantity,
    }));
    const next: Order = {
      ...order,
      status: "fulfilled",
      lines,
      fulfilledAt: now,
      updatedAt: now,
    };

    const uow = this.runtime.uowFactory.start();
    await this.runtime.orders.save(uow, next);
    // ADR-0007: inventoryIntent "issue"
    this.publish(
      uow,
      OrdersEventTypes.OrderFulfilled,
      actor.organizationId,
      {
        ...this.inventorySignalPayload(next),
        inventoryIntent: "issue",
      },
    );
    await uow.commit();
    return toOrderView(next);
  }

  async fulfillLines(
    actor: ActorContext,
    input: {
      orderId: string;
      lines: Array<{ orderLineId: string; quantity: number }>;
    },
  ): Promise<OrderView> {
    await this.requireAuthorized(actor, OrdersPermissions.OrderFulfill);
    const order = await this.requireOrder(actor.organizationId, input.orderId);
    if (order.status !== "committed" && order.status !== "partially_fulfilled") {
      throw new ValidationError(
        `cannot partially fulfill from status ${order.status}`,
      );
    }

    const byId = new Map(order.lines.map((l) => [l.orderLineId, l]));
    const lines = order.lines.map((l) => ({ ...l }));
    for (const req of input.lines) {
      if (
        typeof req.quantity !== "number" ||
        !Number.isInteger(req.quantity) ||
        req.quantity < 1
      ) {
        throw new ValidationError("fulfill quantity must be a positive integer");
      }
      const idx = lines.findIndex((l) => l.orderLineId === req.orderLineId);
      if (idx < 0 || !byId.has(req.orderLineId)) {
        throw new NotFoundError(`order line not found: ${req.orderLineId}`);
      }
      const line = lines[idx]!;
      const remaining = line.quantity - line.fulfilledQuantity;
      if (req.quantity > remaining) {
        throw new ValidationError(
          `fulfill quantity ${req.quantity} exceeds remaining ${remaining}`,
        );
      }
      lines[idx] = {
        ...line,
        fulfilledQuantity: line.fulfilledQuantity + req.quantity,
      };
    }

    const allDone = lines.every((l) => l.fulfilledQuantity >= l.quantity);
    const toStatus: OrderStatus = allDone ? "fulfilled" : "partially_fulfilled";
    if (!canTransition(order.status, toStatus) && order.status !== toStatus) {
      // committed → partially_fulfilled or fulfilled is allowed
      if (
        !(
          (order.status === "committed" ||
            order.status === "partially_fulfilled") &&
          (toStatus === "partially_fulfilled" || toStatus === "fulfilled")
        )
      ) {
        throw new ValidationError(
          `cannot transition from ${order.status} to ${toStatus}`,
        );
      }
    }

    const now = this.runtime.clock.now();
    const next: Order = {
      ...order,
      status: toStatus,
      lines,
      updatedAt: now,
      fulfilledAt: allDone ? now : order.fulfilledAt,
    };

    const uow = this.runtime.uowFactory.start();
    await this.runtime.orders.save(uow, next);
    const eventType = allDone
      ? OrdersEventTypes.OrderFulfilled
      : OrdersEventTypes.OrderPartiallyFulfilled;
    this.publish(uow, eventType, actor.organizationId, {
      ...this.inventorySignalPayload(next),
      inventoryIntent: "issue",
      fulfilledThisRequest: input.lines,
    });
    await uow.commit();
    return toOrderView(next);
  }

  async cancelOrder(
    actor: ActorContext,
    input: { orderId: string; reason?: string },
  ): Promise<OrderView> {
    await this.requireAuthorized(actor, OrdersPermissions.OrderCancel);
    const order = await this.requireOrder(actor.organizationId, input.orderId);
    if (!canTransition(order.status, "cancelled")) {
      throw new ValidationError(
        `cannot cancel from status ${order.status}`,
      );
    }
    if (isTerminalStatus(order.status)) {
      throw new ValidationError("order already terminal");
    }

    const now = this.runtime.clock.now();
    const next: Order = {
      ...order,
      lines: order.lines.map((l) => ({ ...l })),
      status: "cancelled",
      cancelledAt: now,
      updatedAt: now,
    };

    const uow = this.runtime.uowFactory.start();
    await this.runtime.orders.save(uow, next);
    // ADR-0007: inventoryIntent "release" (unissued reservations)
    this.publish(
      uow,
      OrdersEventTypes.OrderCancelled,
      actor.organizationId,
      {
        ...this.inventorySignalPayload(next),
        inventoryIntent: "release",
        reason: input.reason ?? null,
      },
    );
    await uow.commit();
    return toOrderView(next);
  }

  async getOrder(
    organizationId: string,
    orderId: string,
  ): Promise<OrderView | null> {
    const order = await this.runtime.orders.findById(organizationId, orderId);
    return order ? toOrderView(order) : null;
  }

  async findOrders(
    actor: ActorContext,
    filter: {
      status?: string;
      customerPartyId?: string;
      locationId?: string;
    } = {},
  ): Promise<OrderView[]> {
    await this.requireAuthorized(actor, OrdersPermissions.OrderRead);
    const rows = await this.runtime.orders.list({
      organizationId: actor.organizationId,
      ...filter,
    });
    return rows.map(toOrderView);
  }
}
