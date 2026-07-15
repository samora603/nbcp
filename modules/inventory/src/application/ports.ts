import type { UnitOfWork, UnitOfWorkFactory, OutboxWriter } from "@nbcp/outbox";
import type { InventoryItem } from "../domain/inventory-item.js";
import type { Movement } from "../domain/movement.js";

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

export interface AuditRecordPort {
  record(input: {
    actor: {
      kind: "principal" | "system";
      principalId?: string | null;
    };
    action: string;
    organizationId: string;
    target?: { type: string; id: string } | null;
    metadata?: Record<string, unknown>;
    sourceModule: string;
    sourceEventId?: string | null;
    outcome?: "success" | "failure" | "denied";
  }): Promise<unknown>;
}

export interface Clock {
  now(): string;
}

export interface IdGenerator {
  id(): string;
}

export interface InventoryItemRepository {
  save(uow: UnitOfWork, item: InventoryItem): Promise<void>;
  findBySku(
    organizationId: string,
    sku: string,
  ): Promise<InventoryItem | null>;
  list(organizationId: string): Promise<InventoryItem[]>;
}

export interface MovementRepository {
  append(uow: UnitOfWork, movement: Movement): Promise<void>;
  findByIdempotencyKey(key: string): Promise<Movement | null>;
  list(input: {
    organizationId: string;
    sku?: string;
    sourceEventId?: string;
  }): Promise<Movement[]>;
}

export interface InventoryRuntime {
  uowFactory: UnitOfWorkFactory;
  outbox: OutboxWriter;
  tenancy: TenancyOrgLookup;
  rbac: RbacAuthorizePort;
  audit?: AuditRecordPort;
  items: InventoryItemRepository;
  movements: MovementRepository;
  ids: IdGenerator;
  clock: Clock;
}
