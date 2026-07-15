import { randomUUID } from "node:crypto";
import type { DomainEventEnvelope, UnitOfWork } from "@nbcp/outbox";
import type { InventoryRuntime } from "./ports.js";
import {
  toInventoryItemView,
  applyReserve,
  applyRelease,
  applyIssue,
  applyReceive,
  applyAdjust,
  type InventoryItem,
  type InventoryItemView,
} from "../domain/inventory-item.js";
import {
  toMovementView,
  idempotencyKey,
  type Movement,
  type MovementType,
  type MovementView,
} from "../domain/movement.js";
import {
  CONSUMED_ORDER_EVENT_TYPES,
  movementTypeForOrderEvent,
  publishedEventForMovementType,
} from "../domain/events.js";
import {
  AuthorizationError,
  InsufficientStockError,
  NotFoundError,
  ValidationError,
} from "../domain/errors.js";
import { InventoryPermissions } from "./permissions.js";

export interface ActorContext {
  principalId: string;
  organizationId: string;
  locationId?: string | null;
}

export interface ConsumedOrderLineSummary {
  orderLineId: string;
  catalogItemId: string;
  quantity: number;
  fulfilledQuantity: number;
  stockable: boolean;
}

/** Order event payload (consumed without importing @nbcp/orders). */
export interface ConsumedOrderEventPayload {
  eventId: string;
  eventType: string;
  eventVersion?: number;
  occurredAt: string;
  organizationId: string;
  orderId: string;
  inventoryIntent?: string;
  lineSummaries?: ConsumedOrderLineSummary[];
  lines?: Array<{ sku: string; quantity: number }>;
  fulfilledThisRequest?: Array<{ orderLineId: string; quantity: number }>;
}

/**
 * Inventory application facade (S6).
 * Executes ADR-0007 stock intents from Orders events — never imports Orders.
 */
export class InventoryService {
  constructor(private readonly runtime: InventoryRuntime) {}

  private movementPayload(
    envelope: DomainEventEnvelope,
    movement: Movement,
  ): Record<string, unknown> {
    return {
      eventId: envelope.eventId,
      eventType: envelope.type,
      eventVersion: envelope.version,
      occurredAt: envelope.occurredAt,
      organizationId: movement.organizationId,
      sku: movement.sku,
      quantity: movement.quantity,
      movementId: movement.movementId,
      sourceEventId: movement.sourceEventId,
    };
  }

  private publishMovementEvent(
    uow: UnitOfWork,
    movementType: MovementType,
    organizationId: string,
    movement: Movement,
  ): DomainEventEnvelope {
    const eventType = publishedEventForMovementType(movementType);
    const envelope: DomainEventEnvelope = {
      eventId: randomUUID(),
      type: eventType,
      version: 1,
      occurredAt: this.runtime.clock.now(),
      producer: "inventory",
      organizationId,
      correlationId: null,
      payload: {},
    };
    envelope.payload = this.movementPayload(envelope, movement);
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

  private resolveStockActions(
    payload: ConsumedOrderEventPayload,
    movementType: "reserve" | "release" | "issue",
  ): Array<{ sku: string; quantity: number }> {
    if (payload.lines?.length) {
      return payload.lines
        .filter((l) => l.quantity > 0)
        .map((l) => ({ sku: l.sku, quantity: l.quantity }));
    }

    const summaries = payload.lineSummaries ?? [];
    const stockable = summaries.filter((s) => s.stockable);

    if (movementType === "reserve") {
      return stockable.map((s) => ({
        sku: s.catalogItemId,
        quantity: s.quantity,
      }));
    }

    if (movementType === "release") {
      return stockable
        .map((s) => ({
          sku: s.catalogItemId,
          quantity: s.quantity - s.fulfilledQuantity,
        }))
        .filter((l) => l.quantity > 0);
    }

    if (movementType === "issue") {
      if (payload.fulfilledThisRequest?.length) {
        const byLine = new Map(summaries.map((s) => [s.orderLineId, s]));
        const actions: Array<{ sku: string; quantity: number }> = [];
        for (const req of payload.fulfilledThisRequest) {
          const summary = byLine.get(req.orderLineId);
          if (!summary?.stockable || req.quantity <= 0) continue;
          actions.push({
            sku: summary.catalogItemId,
            quantity: req.quantity,
          });
        }
        return actions;
      }
      return stockable.map((s) => ({
        sku: s.catalogItemId,
        quantity: s.quantity,
      }));
    }

    return [];
  }

  private async ensureItem(
    uow: UnitOfWork,
    organizationId: string,
    sku: string,
  ): Promise<InventoryItem> {
    const existing = await this.runtime.items.findBySku(organizationId, sku);
    if (existing) return existing;

    const now = this.runtime.clock.now();
    const item: InventoryItem = {
      inventoryItemId: this.runtime.ids.id(),
      organizationId,
      sku,
      onHand: 0,
      reserved: 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.runtime.items.save(uow, item);
    return item;
  }

  private async applyMovement(
    uow: UnitOfWork,
    organizationId: string,
    sku: string,
    movementType: MovementType,
    quantity: number,
    sourceEventId: string,
    sourceEventType: string,
    occurredAt: string,
  ): Promise<Movement> {
    const key = idempotencyKey(
      organizationId,
      sourceEventId,
      sku,
      movementType,
    );
    const existing = await this.runtime.movements.findByIdempotencyKey(key);
    if (existing) {
      return existing;
    }

    const now = this.runtime.clock.now();
    let item = await this.ensureItem(uow, organizationId, sku);

    try {
      switch (movementType) {
        case "reserve":
          item = applyReserve(item, quantity, now);
          break;
        case "release":
          item = applyRelease(item, quantity, now);
          break;
        case "issue":
          item = applyIssue(item, quantity, now);
          break;
        case "receipt":
          item = applyReceive(item, quantity, now);
          break;
        case "adjustment":
          item = applyAdjust(item, quantity, now);
          break;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("insufficient") || msg.includes("exceeds")) {
        throw new InsufficientStockError(msg);
      }
      throw new ValidationError(msg);
    }

    const movement: Movement = {
      movementId: this.runtime.ids.id(),
      organizationId,
      sku,
      type: movementType,
      quantity,
      sourceEventId,
      sourceEventType,
      occurredAt,
      createdAt: now,
    };

    await this.runtime.items.save(uow, item);
    await this.runtime.movements.append(uow, movement);
    this.publishMovementEvent(uow, movementType, organizationId, movement);
    return movement;
  }

  /**
   * ADR-0007 executor — consumes Orders lifecycle events.
   */
  async consumeOrderEvent(
    actor: ActorContext,
    payload: ConsumedOrderEventPayload,
  ): Promise<MovementView[]> {
    await this.requireOrg(actor.organizationId);

    const movementType = movementTypeForOrderEvent(payload.eventType);
    if (!movementType) {
      throw new ValidationError(
        `unsupported order event type: ${payload.eventType}`,
      );
    }

    const permission =
      movementType === "reserve"
        ? InventoryPermissions.StockReserve
        : movementType === "issue"
          ? InventoryPermissions.StockIssue
          : InventoryPermissions.StockReserve;
    await this.requireAuthorized(actor, permission);

    if (!payload.eventId?.trim()) {
      throw new ValidationError("eventId is required");
    }
    if (payload.organizationId !== actor.organizationId) {
      throw new ValidationError("organizationId mismatch");
    }

    const actions = this.resolveStockActions(payload, movementType);
    const uow = this.runtime.uowFactory.start();
    const movements: Movement[] = [];

    try {
      for (const action of actions) {
        const movement = await this.applyMovement(
          uow,
          actor.organizationId,
          action.sku,
          movementType,
          action.quantity,
          payload.eventId,
          payload.eventType,
          payload.occurredAt,
        );
        movements.push(movement);
      }
      await uow.commit();
    } catch (e) {
      throw e;
    }

    return movements.map(toMovementView);
  }

  async receiveStock(
    actor: ActorContext,
    input: { sku: string; quantity: number },
  ): Promise<{ item: InventoryItemView; movement: MovementView }> {
    await this.requireOrg(actor.organizationId);
    await this.requireAuthorized(actor, InventoryPermissions.StockReceive);

    const sku = input.sku?.trim();
    if (!sku) {
      throw new ValidationError("sku is required");
    }
    if (
      typeof input.quantity !== "number" ||
      !Number.isInteger(input.quantity) ||
      input.quantity <= 0
    ) {
      throw new ValidationError("quantity must be a positive integer");
    }

    const sourceEventId = this.runtime.ids.id();
    const now = this.runtime.clock.now();
    const uow = this.runtime.uowFactory.start();
    const movement = await this.applyMovement(
      uow,
      actor.organizationId,
      sku,
      "receipt",
      input.quantity,
      sourceEventId,
      InventoryPermissions.StockReceive,
      now,
    );
    await uow.commit();

    const item = await this.runtime.items.findBySku(
      actor.organizationId,
      sku,
    );
    if (!item) {
      throw new NotFoundError(`inventory item not found after receive: ${sku}`);
    }
    return { item: toInventoryItemView(item), movement: toMovementView(movement) };
  }

  async adjustStock(
    actor: ActorContext,
    input: { sku: string; delta: number },
  ): Promise<{ item: InventoryItemView; movement: MovementView }> {
    await this.requireOrg(actor.organizationId);
    await this.requireAuthorized(actor, InventoryPermissions.StockAdjust);

    const sku = input.sku?.trim();
    if (!sku) {
      throw new ValidationError("sku is required");
    }
    if (
      typeof input.delta !== "number" ||
      !Number.isInteger(input.delta) ||
      input.delta === 0
    ) {
      throw new ValidationError("delta must be a non-zero integer");
    }

    const existing = await this.runtime.items.findBySku(
      actor.organizationId,
      sku,
    );
    if (!existing) {
      throw new NotFoundError(`inventory item not found: ${sku}`);
    }

    const sourceEventId = this.runtime.ids.id();
    const now = this.runtime.clock.now();
    const uow = this.runtime.uowFactory.start();
    const movement = await this.applyMovement(
      uow,
      actor.organizationId,
      sku,
      "adjustment",
      input.delta,
      sourceEventId,
      InventoryPermissions.StockAdjust,
      now,
    );
    await uow.commit();

    const item = await this.runtime.items.findBySku(
      actor.organizationId,
      sku,
    );
    if (!item) {
      throw new NotFoundError(`inventory item not found after adjust: ${sku}`);
    }
    return { item: toInventoryItemView(item), movement: toMovementView(movement) };
  }

  async getItem(
    organizationId: string,
    sku: string,
  ): Promise<InventoryItemView | null> {
    const item = await this.runtime.items.findBySku(organizationId, sku);
    return item ? toInventoryItemView(item) : null;
  }

  async findItems(actor: ActorContext): Promise<InventoryItemView[]> {
    await this.requireAuthorized(actor, InventoryPermissions.StockRead);
    const rows = await this.runtime.items.list(actor.organizationId);
    return rows.map(toInventoryItemView);
  }

  async findMovements(
    actor: ActorContext,
    filter: { sku?: string; sourceEventId?: string } = {},
  ): Promise<MovementView[]> {
    await this.requireAuthorized(actor, InventoryPermissions.StockRead);
    const rows = await this.runtime.movements.list({
      organizationId: actor.organizationId,
      ...filter,
    });
    return rows.map(toMovementView);
  }
}
