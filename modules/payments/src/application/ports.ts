import type { UnitOfWork, UnitOfWorkFactory, OutboxWriter } from "@nbcp/outbox";
import type { Payment } from "../domain/payment.js";

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

export interface OrdersLookupPort {
  getOrder(
    organizationId: string,
    orderId: string,
  ): Promise<{
    orderId: string;
    status: string;
    currency: string;
    totals: { currency: string; amountMinor: number };
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

export interface PaymentRepository {
  save(uow: UnitOfWork, payment: Payment): Promise<void>;
  findById(
    organizationId: string,
    paymentId: string,
  ): Promise<Payment | null>;
  list(input: {
    organizationId: string;
    orderId?: string;
    status?: string;
  }): Promise<Payment[]>;
}

export interface PaymentsRuntime {
  uowFactory: UnitOfWorkFactory;
  outbox: OutboxWriter;
  tenancy: TenancyOrgLookup;
  rbac: RbacAuthorizePort;
  orders: OrdersLookupPort;
  audit?: AuditRecordPort;
  payments: PaymentRepository;
  ids: IdGenerator;
  clock: Clock;
}
