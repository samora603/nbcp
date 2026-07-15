import { randomBytes } from "node:crypto";
import {
  InMemoryOutboxStore,
  InMemoryUnitOfWorkFactory,
  OutboxWriter,
} from "@nbcp/outbox";
import type { TenancyService } from "@nbcp/tenancy";
import type { RbacService } from "@nbcp/rbac";
import type { AuditService } from "@nbcp/audit";
import type { OrdersService } from "@nbcp/orders";
import { PaymentsService } from "./payments-service.js";
import type { PaymentsRuntime } from "./ports.js";
import { InMemoryPaymentRepository } from "../infrastructure/in-memory-store.js";

export interface CreatePaymentsKernelOptions {
  tenancy: TenancyService;
  rbac: RbacService;
  orders: OrdersService;
  audit?: AuditService;
  outboxStore?: InMemoryOutboxStore;
}

export interface PaymentsKernel {
  service: PaymentsService;
  outboxStore: InMemoryOutboxStore;
  payments: InMemoryPaymentRepository;
}

export function createPaymentsKernel(
  options: CreatePaymentsKernelOptions,
): PaymentsKernel {
  const outboxStore = options.outboxStore ?? new InMemoryOutboxStore();
  const uowFactory = new InMemoryUnitOfWorkFactory({ store: outboxStore });
  const payments = new InMemoryPaymentRepository();

  const runtime: PaymentsRuntime = {
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
    orders: {
      async getOrder(organizationId, orderId) {
        const order = await options.orders.getOrder(organizationId, orderId);
        if (!order) return null;
        return {
          orderId: order.orderId,
          status: order.status,
          currency: order.currency,
          totals: order.totals,
        };
      },
    },
    payments,
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
    service: new PaymentsService(runtime),
    outboxStore,
    payments,
  };
}
