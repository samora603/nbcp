import { randomBytes } from "node:crypto";
import {
  InMemoryOutboxStore,
  InMemoryUnitOfWorkFactory,
  OutboxWriter,
} from "@nbcp/outbox";
import type { TenancyService } from "@nbcp/tenancy";
import type { RbacService } from "@nbcp/rbac";
import type { AuditService } from "@nbcp/audit";
import type { PartiesService } from "@nbcp/parties";
import { CatalogService } from "./catalog-service.js";
import type { CatalogRuntime } from "./ports.js";
import { InMemoryCatalogItemRepository } from "../infrastructure/in-memory-store.js";

export interface CreateCatalogKernelOptions {
  tenancy: TenancyService;
  rbac: RbacService;
  parties?: PartiesService;
  audit?: AuditService;
  outboxStore?: InMemoryOutboxStore;
}

export interface CatalogKernel {
  service: CatalogService;
  outboxStore: InMemoryOutboxStore;
  items: InMemoryCatalogItemRepository;
}

export function createCatalogKernel(
  options: CreateCatalogKernelOptions,
): CatalogKernel {
  const outboxStore = options.outboxStore ?? new InMemoryOutboxStore();
  const uowFactory = new InMemoryUnitOfWorkFactory({ store: outboxStore });
  const items = new InMemoryCatalogItemRepository();

  const runtime: CatalogRuntime = {
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
      async listLocations(organizationId) {
        const locs = await options.tenancy.listLocations(organizationId);
        return locs.map((l) => ({
          locationId: l.locationId,
          status: l.status,
        }));
      },
    },
    rbac: {
      authorize: (input) => options.rbac.authorize(input),
    },
    items,
    ids: { id: () => randomBytes(16).toString("hex") },
    clock: { now: () => new Date().toISOString() },
    ...(options.parties
      ? {
          parties: {
            async getParty(organizationId: string, partyId: string) {
              const party = await options.parties!.getParty(
                organizationId,
                partyId,
              );
              if (!party) return null;
              return {
                partyId: party.partyId,
                status: party.status,
                roleKeys: party.roleKeys,
              };
            },
          },
        }
      : {}),
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
    service: new CatalogService(runtime),
    outboxStore,
    items,
  };
}
