import { randomBytes } from "node:crypto";
import {
  InMemoryOutboxStore,
  InMemoryUnitOfWorkFactory,
  OutboxWriter,
} from "@nbcp/outbox";
import type { IdentityService } from "@nbcp/identity";
import type { TenancyService } from "@nbcp/tenancy";
import type { RbacService } from "@nbcp/rbac";
import type { AuditService } from "@nbcp/audit";
import { PartiesService } from "./parties-service.js";
import type { PartiesRuntime } from "./ports.js";
import {
  InMemoryPartyRepository,
  InMemoryRelationshipRepository,
} from "../infrastructure/in-memory-store.js";

export interface CreatePartiesKernelOptions {
  identity: IdentityService;
  tenancy: TenancyService;
  rbac: RbacService;
  audit?: AuditService;
  outboxStore?: InMemoryOutboxStore;
}

export interface PartiesKernel {
  service: PartiesService;
  outboxStore: InMemoryOutboxStore;
  parties: InMemoryPartyRepository;
}

export function createPartiesKernel(
  options: CreatePartiesKernelOptions,
): PartiesKernel {
  const outboxStore = options.outboxStore ?? new InMemoryOutboxStore();
  const uowFactory = new InMemoryUnitOfWorkFactory({ store: outboxStore });
  const parties = new InMemoryPartyRepository();
  const relationships = new InMemoryRelationshipRepository();

  const runtime: PartiesRuntime = {
    uowFactory,
    outbox: new OutboxWriter(),
    identity: {
      async getUserById(principalId) {
        const user = await options.identity.getUserById(principalId);
        if (!user) return null;
        return {
          principalId: user.principalId,
          email: user.email,
          status: user.status,
        };
      },
    },
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
    parties,
    relationships,
    ids: { id: () => randomBytes(16).toString("hex") },
    clock: { now: () => new Date().toISOString() },
  };
  if (options.audit) {
    runtime.audit = {
      record: (input) => options.audit!.record(input),
    };
  }

  return {
    service: new PartiesService(runtime),
    outboxStore,
    parties,
  };
}
