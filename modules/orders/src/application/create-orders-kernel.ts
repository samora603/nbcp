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
import type { CatalogService } from "@nbcp/catalog";
import { OrdersService } from "./orders-service.js";
import type { OrdersRuntime } from "./ports.js";
import { InMemoryOrderRepository } from "../infrastructure/in-memory-store.js";

export interface CreateOrdersKernelOptions {
  tenancy: TenancyService;
  rbac: RbacService;
  parties: PartiesService;
  catalog: CatalogService;
  audit?: AuditService;
  outboxStore?: InMemoryOutboxStore;
}

export interface OrdersKernel {
  service: OrdersService;
  outboxStore: InMemoryOutboxStore;
  orders: InMemoryOrderRepository;
}

export function createOrdersKernel(
  options: CreateOrdersKernelOptions,
): OrdersKernel {
  const outboxStore = options.outboxStore ?? new InMemoryOutboxStore();
  const uowFactory = new InMemoryUnitOfWorkFactory({ store: outboxStore });
  const orders = new InMemoryOrderRepository();

  const runtime: OrdersRuntime = {
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
    parties: {
      async getParty(organizationId, partyId) {
        const party = await options.parties.getParty(organizationId, partyId);
        if (!party) return null;
        return {
          partyId: party.partyId,
          status: party.status,
          roleKeys: party.roleKeys,
        };
      },
    },
    catalog: {
      async getItem(organizationId, catalogItemId) {
        const item = await options.catalog.getItem(
          organizationId,
          catalogItemId,
        );
        if (!item) return null;
        return {
          catalogItemId: item.catalogItemId,
          code: item.code,
          name: item.name,
          status: item.status,
          stockable: item.stockable,
          traits: item.traits,
        };
      },
      assertItemOrderable: (input) => options.catalog.assertItemOrderable(input),
      resolveListPrice: (input) => options.catalog.resolveListPrice(input),
    },
    orders,
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
    service: new OrdersService(runtime),
    outboxStore,
    orders,
  };
}
