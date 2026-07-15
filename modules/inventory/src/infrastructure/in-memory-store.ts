import type { UnitOfWork } from "@nbcp/outbox";
import type { InventoryItem } from "../domain/inventory-item.js";
import type { Movement } from "../domain/movement.js";
import type {
  InventoryItemRepository,
  MovementRepository,
} from "../application/ports.js";
import { ImmutableMovementError } from "../domain/errors.js";

export class InMemoryInventoryItemRepository implements InventoryItemRepository {
  private readonly bySku = new Map<string, InventoryItem>();

  private key(organizationId: string, sku: string): string {
    return `${organizationId}:${sku}`;
  }

  async save(uow: UnitOfWork, item: InventoryItem): Promise<void> {
    const snapshot = structuredClone(item);
    const k = this.key(item.organizationId, item.sku);
    uow.stageMutation(() => {
      this.bySku.set(k, snapshot);
    });
  }

  async findBySku(
    organizationId: string,
    sku: string,
  ): Promise<InventoryItem | null> {
    const item = this.bySku.get(this.key(organizationId, sku));
    return item ? structuredClone(item) : null;
  }

  async list(organizationId: string): Promise<InventoryItem[]> {
    return [...this.bySku.values()]
      .filter((i) => i.organizationId === organizationId)
      .map((i) => structuredClone(i));
  }
}

export class InMemoryMovementRepository implements MovementRepository {
  private readonly byId = new Map<string, Movement>();
  private readonly byIdempotency = new Map<string, Movement>();

  async append(uow: UnitOfWork, movement: Movement): Promise<void> {
    if (this.byId.has(movement.movementId)) {
      throw new ImmutableMovementError(
        `movement already exists: ${movement.movementId}`,
      );
    }
    const idemKey = `${movement.organizationId}:${movement.sourceEventId}:${movement.sku}:${movement.type}`;
    if (this.byIdempotency.has(idemKey)) {
      return;
    }

    const snapshot = structuredClone(movement);
    uow.stageMutation(() => {
      this.byId.set(movement.movementId, snapshot);
      this.byIdempotency.set(idemKey, snapshot);
    });
  }

  async findByIdempotencyKey(key: string): Promise<Movement | null> {
    const movement = this.byIdempotency.get(key);
    return movement ? structuredClone(movement) : null;
  }

  async list(input: {
    organizationId: string;
    sku?: string;
    sourceEventId?: string;
  }): Promise<Movement[]> {
    let rows = [...this.byId.values()].filter(
      (m) => m.organizationId === input.organizationId,
    );
    if (input.sku) {
      rows = rows.filter((m) => m.sku === input.sku);
    }
    if (input.sourceEventId) {
      rows = rows.filter((m) => m.sourceEventId === input.sourceEventId);
    }
    return rows.map((m) => structuredClone(m));
  }
}
