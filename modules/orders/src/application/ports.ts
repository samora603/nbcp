import type { UnitOfWork, UnitOfWorkFactory, OutboxWriter } from "@nbcp/outbox";
import type { Order } from "../domain/order.js";

export interface TenancyOrgLookup {
  getOrganization(organizationId: string): Promise<{
    organizationId: string;
    status: string;
  } | null>;
  getMembership(
    organizationId: string,
    principalId: string,
  ): Promise<{ state: string } | null>;
  listLocations(organizationId: string): Promise<
    Array<{ locationId: string; status: string }>
  >;
}

export interface RbacAuthorizePort {
  authorize(input: {
    principalId: string;
    permissionKey: string;
    organizationId: string;
    locationId?: string | null;
  }): Promise<{ allowed: boolean; reason?: string }>;
}

export interface PartiesLookupPort {
  getParty(
    organizationId: string,
    partyId: string,
  ): Promise<{
    partyId: string;
    status: string;
    roleKeys: string[];
  } | null>;
}

export interface CatalogLookupPort {
  getItem(
    organizationId: string,
    catalogItemId: string,
  ): Promise<{
    catalogItemId: string;
    code: string;
    name: string;
    status: string;
    stockable: boolean;
    traits: string[];
  } | null>;
  assertItemOrderable(input: {
    organizationId: string;
    catalogItemId: string;
    variantId?: string | null;
    locationId?: string | null;
  }): Promise<void>;
  resolveListPrice(input: {
    organizationId: string;
    catalogItemId: string;
    variantId?: string | null;
  }): Promise<{ currency: string; amountMinor: number } | null>;
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

export interface OrderRepository {
  save(uow: UnitOfWork, order: Order): Promise<void>;
  findById(organizationId: string, orderId: string): Promise<Order | null>;
  list(input: {
    organizationId: string;
    status?: string;
    customerPartyId?: string;
    locationId?: string;
  }): Promise<Order[]>;
}

export interface OrdersRuntime {
  uowFactory: UnitOfWorkFactory;
  outbox: OutboxWriter;
  tenancy: TenancyOrgLookup;
  rbac: RbacAuthorizePort;
  parties: PartiesLookupPort;
  catalog: CatalogLookupPort;
  audit?: AuditRecordPort;
  orders: OrderRepository;
  ids: IdGenerator;
  clock: Clock;
}
