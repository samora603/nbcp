import { randomUUID } from "node:crypto";
import type { DomainEventEnvelope, UnitOfWork } from "@nbcp/outbox";
import type { PaymentsRuntime } from "./ports.js";
import {
  toPaymentView,
  canTransition,
  moneyValidationError,
  type Payment,
  type PaymentView,
  type PaymentStatus,
} from "../domain/payment.js";
import { PaymentsEventTypes } from "../domain/events.js";
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../domain/errors.js";
import { PaymentsPermissions } from "./permissions.js";

export interface ActorContext {
  principalId: string;
  organizationId: string;
  locationId?: string | null;
}

const PAYABLE_ORDER_STATUSES = new Set([
  "committed",
  "partially_fulfilled",
  "fulfilled",
]);

/**
 * Payments application facade (S4).
 * Owns payment lifecycle; Ledger consumes events (ADR-0005) — Payments never posts journals.
 */
export class PaymentsService {
  constructor(private readonly runtime: PaymentsRuntime) {}

  private paymentPayload(
    envelope: DomainEventEnvelope,
    payment: Payment,
    extra: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      eventId: envelope.eventId,
      eventType: envelope.type,
      eventVersion: envelope.version,
      occurredAt: envelope.occurredAt,
      paymentId: payment.paymentId,
      orderId: payment.orderId,
      amount: payment.amount.amountMinor,
      currency: payment.currency,
      organizationId: payment.organizationId,
      ...extra,
    };
  }

  private publishPaymentEvent(
    uow: UnitOfWork,
    type: string,
    organizationId: string,
    payment: Payment,
    extra: Record<string, unknown> = {},
  ): DomainEventEnvelope {
    const envelope: DomainEventEnvelope = {
      eventId: randomUUID(),
      type,
      version: 1,
      occurredAt: this.runtime.clock.now(),
      producer: "payments",
      organizationId,
      correlationId: null,
      payload: {},
    };
    envelope.payload = this.paymentPayload(envelope, payment, extra);
    this.runtime.outbox.append(uow, envelope);
    return envelope;
  }

  private async requireOrg(organizationId: string): Promise<void> {
    const org = await this.runtime.tenancy.getOrganization(organizationId);
    if (!org || org.status !== "active") {
      throw new ValidationError("organization not active");
    }
  }

  private async requireAuthorized(
    actor: ActorContext,
    permissionKey: string,
  ): Promise<void> {
    const membership = await this.runtime.tenancy.getMembership(
      actor.organizationId,
      actor.principalId,
    );
    if (!membership || membership.state !== "active") {
      throw new AuthorizationError("active membership required");
    }
    const decision = await this.runtime.rbac.authorize({
      principalId: actor.principalId,
      permissionKey,
      organizationId: actor.organizationId,
      locationId: actor.locationId ?? null,
    });
    if (!decision.allowed) {
      throw new AuthorizationError(
        `denied: ${decision.reason ?? permissionKey}`,
      );
    }
  }

  private async requirePayment(
    organizationId: string,
    paymentId: string,
  ): Promise<Payment> {
    const payment = await this.runtime.payments.findById(
      organizationId,
      paymentId,
    );
    if (!payment) {
      throw new NotFoundError(`payment not found: ${paymentId}`);
    }
    return payment;
  }

  private async requirePayableOrder(
    organizationId: string,
    orderId: string,
    amountCurrency: string,
  ): Promise<void> {
    const order = await this.runtime.orders.getOrder(organizationId, orderId);
    if (!order) {
      throw new NotFoundError(`order not found: ${orderId}`);
    }
    if (!PAYABLE_ORDER_STATUSES.has(order.status)) {
      throw new ValidationError(
        `order not payable in status: ${order.status}`,
      );
    }
    if (order.currency !== amountCurrency) {
      throw new ValidationError("payment currency must match order currency");
    }
  }

  private transition(
    payment: Payment,
    to: PaymentStatus,
    now: string,
  ): Payment {
    if (!canTransition(payment.status, to)) {
      throw new ConflictError(
        `invalid transition: ${payment.status} → ${to}`,
      );
    }
    return { ...payment, status: to, updatedAt: now };
  }

  async createPayment(
    actor: ActorContext,
    input: {
      orderId: string;
      amount: { currency: string; amountMinor: number };
      provider: string;
      providerReference?: string | null;
    },
  ): Promise<PaymentView> {
    await this.requireOrg(actor.organizationId);
    await this.requireAuthorized(actor, PaymentsPermissions.PaymentCreate);

    const amountErr = moneyValidationError(input.amount);
    if (amountErr) {
      throw new ValidationError(amountErr);
    }
    if (!input.provider?.trim()) {
      throw new ValidationError("provider is required");
    }

    await this.requirePayableOrder(
      actor.organizationId,
      input.orderId,
      input.amount.currency,
    );

    const now = this.runtime.clock.now();
    const payment: Payment = {
      paymentId: this.runtime.ids.id(),
      organizationId: actor.organizationId,
      orderId: input.orderId,
      amount: { ...input.amount },
      currency: input.amount.currency,
      provider: input.provider.trim(),
      providerReference: input.providerReference ?? null,
      status: "pending",
      refundedAmountMinor: 0,
      authorizedAt: null,
      capturedAt: null,
      refundedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const uow = this.runtime.uowFactory.start();
    await this.runtime.payments.save(uow, payment);
    const envelope = this.publishPaymentEvent(
      uow,
      PaymentsEventTypes.Created,
      actor.organizationId,
      payment,
    );
    await uow.commit();

    if (this.runtime.audit) {
      await this.runtime.audit.record({
        actor: { kind: "principal", principalId: actor.principalId },
        action: "payments.payment.create",
        organizationId: actor.organizationId,
        target: { type: "payment", id: payment.paymentId },
        sourceModule: "payments",
        sourceEventId: envelope.eventId,
      });
    }

    return toPaymentView(payment);
  }

  async authorizePayment(
    actor: ActorContext,
    paymentId: string,
    input: { providerReference?: string | null } = {},
  ): Promise<PaymentView> {
    await this.requireOrg(actor.organizationId);
    await this.requireAuthorized(actor, PaymentsPermissions.PaymentCreate);

    const existing = await this.requirePayment(actor.organizationId, paymentId);
    const now = this.runtime.clock.now();
    let next = this.transition(existing, "authorized", now);
    next = {
      ...next,
      authorizedAt: now,
      providerReference:
        input.providerReference ?? existing.providerReference,
    };

    const uow = this.runtime.uowFactory.start();
    await this.runtime.payments.save(uow, next);
    this.publishPaymentEvent(
      uow,
      PaymentsEventTypes.Authorized,
      actor.organizationId,
      next,
    );
    await uow.commit();

    return toPaymentView(next);
  }

  async capturePayment(
    actor: ActorContext,
    paymentId: string,
  ): Promise<PaymentView> {
    await this.requireOrg(actor.organizationId);
    await this.requireAuthorized(actor, PaymentsPermissions.PaymentCapture);

    const existing = await this.requirePayment(actor.organizationId, paymentId);
    const now = this.runtime.clock.now();
    const next: Payment = {
      ...this.transition(existing, "captured", now),
      capturedAt: now,
    };

    const uow = this.runtime.uowFactory.start();
    await this.runtime.payments.save(uow, next);
    this.publishPaymentEvent(
      uow,
      PaymentsEventTypes.Captured,
      actor.organizationId,
      next,
    );
    await uow.commit();

    return toPaymentView(next);
  }

  async voidPayment(
    actor: ActorContext,
    paymentId: string,
  ): Promise<PaymentView> {
    await this.requireOrg(actor.organizationId);
    await this.requireAuthorized(actor, PaymentsPermissions.PaymentCancel);

    const existing = await this.requirePayment(actor.organizationId, paymentId);
    const now = this.runtime.clock.now();
    const next = this.transition(existing, "voided", now);

    const uow = this.runtime.uowFactory.start();
    await this.runtime.payments.save(uow, next);
    this.publishPaymentEvent(
      uow,
      PaymentsEventTypes.Voided,
      actor.organizationId,
      next,
    );
    await uow.commit();

    return toPaymentView(next);
  }

  async refundPayment(
    actor: ActorContext,
    paymentId: string,
    input: { refundAmountMinor: number },
  ): Promise<PaymentView> {
    await this.requireOrg(actor.organizationId);
    await this.requireAuthorized(actor, PaymentsPermissions.PaymentRefund);

    const existing = await this.requirePayment(actor.organizationId, paymentId);
    if (
      existing.status !== "captured" &&
      existing.status !== "partially_refunded"
    ) {
      throw new ConflictError(
        `refund not allowed from status: ${existing.status}`,
      );
    }

    if (
      typeof input.refundAmountMinor !== "number" ||
      !Number.isInteger(input.refundAmountMinor) ||
      input.refundAmountMinor <= 0
    ) {
      throw new ValidationError("refundAmountMinor must be a positive integer");
    }

    const capturedAmount = existing.amount.amountMinor;
    const newRefundedTotal =
      existing.refundedAmountMinor + input.refundAmountMinor;
    if (newRefundedTotal > capturedAmount) {
      throw new ValidationError("refund exceeds captured amount");
    }

    const now = this.runtime.clock.now();
    const toStatus: PaymentStatus =
      newRefundedTotal === capturedAmount ? "refunded" : "partially_refunded";

    if (!canTransition(existing.status, toStatus)) {
      throw new ConflictError(
        `invalid transition: ${existing.status} → ${toStatus}`,
      );
    }

    const next: Payment = {
      ...existing,
      status: toStatus,
      refundedAmountMinor: newRefundedTotal,
      refundedAt: existing.refundedAt ?? now,
      updatedAt: now,
    };

    const uow = this.runtime.uowFactory.start();
    await this.runtime.payments.save(uow, next);
    this.publishPaymentEvent(
      uow,
      PaymentsEventTypes.Refunded,
      actor.organizationId,
      next,
      {
        refundAmountMinor: input.refundAmountMinor,
        refundedAmountMinor: newRefundedTotal,
      },
    );
    await uow.commit();

    return toPaymentView(next);
  }

  async failPayment(
    actor: ActorContext,
    paymentId: string,
  ): Promise<PaymentView> {
    await this.requireOrg(actor.organizationId);
    await this.requireAuthorized(actor, PaymentsPermissions.PaymentCreate);

    const existing = await this.requirePayment(actor.organizationId, paymentId);
    const now = this.runtime.clock.now();
    const next = this.transition(existing, "failed", now);

    const uow = this.runtime.uowFactory.start();
    await this.runtime.payments.save(uow, next);
    await uow.commit();

    return toPaymentView(next);
  }

  async getPayment(
    organizationId: string,
    paymentId: string,
  ): Promise<PaymentView | null> {
    const payment = await this.runtime.payments.findById(
      organizationId,
      paymentId,
    );
    return payment ? toPaymentView(payment) : null;
  }

  async findPayments(
    actor: ActorContext,
    filter: { orderId?: string; status?: string } = {},
  ): Promise<PaymentView[]> {
    await this.requireAuthorized(actor, PaymentsPermissions.PaymentRead);
    const rows = await this.runtime.payments.list({
      organizationId: actor.organizationId,
      ...filter,
    });
    return rows.map(toPaymentView);
  }
}
