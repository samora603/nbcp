import type { UnitOfWork, UnitOfWorkFactory, OutboxWriter } from "@nbcp/outbox";
import type { Journal } from "../domain/journal.js";
import type { PostingRuleConfig } from "../domain/posting-rules.js";

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

export interface JournalRepository {
  save(uow: UnitOfWork, journal: Journal): Promise<void>;
  findById(
    organizationId: string,
    journalId: string,
  ): Promise<Journal | null>;
  findBySourceEventId(
    organizationId: string,
    sourceEventId: string,
  ): Promise<Journal | null>;
  list(input: {
    organizationId: string;
    status?: string;
    sourceEventType?: string;
  }): Promise<Journal[]>;
}

export interface LedgerRuntime {
  uowFactory: UnitOfWorkFactory;
  outbox: OutboxWriter;
  tenancy: TenancyOrgLookup;
  rbac: RbacAuthorizePort;
  audit?: AuditRecordPort;
  journals: JournalRepository;
  postingRules: PostingRuleConfig;
  ids: IdGenerator;
  clock: Clock;
}
