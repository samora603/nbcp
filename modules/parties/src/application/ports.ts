import type { UnitOfWork, UnitOfWorkFactory, OutboxWriter } from "@nbcp/outbox";
import type { Party, PartyRelationship } from "../domain/party.js";

export interface IdentityPrincipalLookup {
  getUserById(principalId: string): Promise<{
    principalId: string;
    email: string;
    status: string;
  } | null>;
}

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

export interface PartyRepository {
  save(uow: UnitOfWork, party: Party): Promise<void>;
  findById(
    organizationId: string,
    partyId: string,
  ): Promise<Party | null>;
  findByPrincipal(
    organizationId: string,
    principalId: string,
  ): Promise<Party | null>;
  list(input: {
    organizationId: string;
    roleKey?: string;
    status?: string;
    kind?: string;
    text?: string;
  }): Promise<Party[]>;
}

export interface RelationshipRepository {
  save(uow: UnitOfWork, relationship: PartyRelationship): Promise<void>;
  findById(
    organizationId: string,
    relationshipId: string,
  ): Promise<PartyRelationship | null>;
  findActive(
    organizationId: string,
    fromPartyId: string,
    toPartyId: string,
    relationshipType: string,
  ): Promise<PartyRelationship | null>;
  listForParty(
    organizationId: string,
    partyId: string,
  ): Promise<PartyRelationship[]>;
}

export interface PartiesRuntime {
  uowFactory: UnitOfWorkFactory;
  outbox: OutboxWriter;
  identity: IdentityPrincipalLookup;
  tenancy: TenancyOrgLookup;
  rbac: RbacAuthorizePort;
  audit?: AuditRecordPort;
  parties: PartyRepository;
  relationships: RelationshipRepository;
  ids: IdGenerator;
  clock: Clock;
}
