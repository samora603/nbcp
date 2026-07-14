import type { UnitOfWork, UnitOfWorkFactory, OutboxWriter } from "@nbcp/outbox";
import type { CatalogItem } from "../domain/catalog-item.js";

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

export interface CatalogItemRepository {
  save(uow: UnitOfWork, item: CatalogItem): Promise<void>;
  findById(
    organizationId: string,
    catalogItemId: string,
  ): Promise<CatalogItem | null>;
  findByCode(
    organizationId: string,
    code: string,
  ): Promise<CatalogItem | null>;
  list(input: {
    organizationId: string;
    status?: string;
    trait?: string;
    text?: string;
    locationId?: string;
  }): Promise<CatalogItem[]>;
}

export interface CatalogRuntime {
  uowFactory: UnitOfWorkFactory;
  outbox: OutboxWriter;
  tenancy: TenancyOrgLookup;
  rbac: RbacAuthorizePort;
  parties?: PartiesLookupPort;
  audit?: AuditRecordPort;
  items: CatalogItemRepository;
  ids: IdGenerator;
  clock: Clock;
}
