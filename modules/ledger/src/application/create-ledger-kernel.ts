import { randomBytes } from "node:crypto";
import {
  InMemoryOutboxStore,
  InMemoryUnitOfWorkFactory,
  OutboxWriter,
} from "@nbcp/outbox";
import type { TenancyService } from "@nbcp/tenancy";
import type { RbacService } from "@nbcp/rbac";
import type { AuditService } from "@nbcp/audit";
import { LedgerService } from "./ledger-service.js";
import type { LedgerRuntime } from "./ports.js";
import {
  DEFAULT_POSTING_RULE_CONFIG,
  type PostingRuleConfig,
} from "../domain/posting-rules.js";
import { InMemoryJournalRepository } from "../infrastructure/in-memory-store.js";

export interface CreateLedgerKernelOptions {
  tenancy: TenancyService;
  rbac: RbacService;
  audit?: AuditService;
  outboxStore?: InMemoryOutboxStore;
  postingRules?: PostingRuleConfig;
}

export interface LedgerKernel {
  service: LedgerService;
  outboxStore: InMemoryOutboxStore;
  journals: InMemoryJournalRepository;
}

export function createLedgerKernel(
  options: CreateLedgerKernelOptions,
): LedgerKernel {
  const outboxStore = options.outboxStore ?? new InMemoryOutboxStore();
  const uowFactory = new InMemoryUnitOfWorkFactory({ store: outboxStore });
  const journals = new InMemoryJournalRepository();

  const runtime: LedgerRuntime = {
    uowFactory,
    outbox: new OutboxWriter(),
    tenancy: {
      async getOrganization(organizationId) {
        const org = await options.tenancy.getOrganization(organizationId);
        if (!org) return null;
        return {
          organizationId: org.organizationId,
          status: org.status,
        };
      },
      async getMembership(organizationId, principalId) {
        const m = await options.tenancy.getMembership(
          organizationId,
          principalId,
        );
        if (!m) return null;
        return { state: m.state };
      },
    },
    rbac: {
      authorize: (input) => options.rbac.authorize(input),
    },
    journals,
    postingRules: options.postingRules ?? DEFAULT_POSTING_RULE_CONFIG,
    ids: { id: () => randomBytes(16).toString("hex") },
    clock: { now: () => new Date().toISOString() },
    ...(options.audit
      ? {
          audit: {
            record: (input: {
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
            }) => options.audit!.record(input),
          },
        }
      : {}),
  };

  return {
    service: new LedgerService(runtime),
    outboxStore,
    journals,
  };
}
