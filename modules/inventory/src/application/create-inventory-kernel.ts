import { randomBytes } from "node:crypto";
import {
  InMemoryOutboxStore,
  InMemoryUnitOfWorkFactory,
  OutboxWriter,
} from "@nbcp/outbox";
import type { TenancyService } from "@nbcp/tenancy";
import type { RbacService } from "@nbcp/rbac";
import type { AuditService } from "@nbcp/audit";
import { InventoryService } from "./inventory-service.js";
import type { InventoryRuntime } from "./ports.js";
import {
  InMemoryInventoryItemRepository,
  InMemoryMovementRepository,
} from "../infrastructure/in-memory-store.js";

export interface CreateInventoryKernelOptions {
  tenancy: TenancyService;
  rbac: RbacService;
  audit?: AuditService;
  outboxStore?: InMemoryOutboxStore;
}

export interface InventoryKernel {
  service: InventoryService;
  outboxStore: InMemoryOutboxStore;
  items: InMemoryInventoryItemRepository;
  movements: InMemoryMovementRepository;
}

export function createInventoryKernel(
  options: CreateInventoryKernelOptions,
): InventoryKernel {
  const outboxStore = options.outboxStore ?? new InMemoryOutboxStore();
  const uowFactory = new InMemoryUnitOfWorkFactory({ store: outboxStore });
  const items = new InMemoryInventoryItemRepository();
  const movements = new InMemoryMovementRepository();

  const runtime: InventoryRuntime = {
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
    items,
    movements,
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
    service: new InventoryService(runtime),
    outboxStore,
    items,
    movements,
  };
}
