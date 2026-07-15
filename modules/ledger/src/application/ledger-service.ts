import { randomUUID } from "node:crypto";
import type { DomainEventEnvelope, UnitOfWork } from "@nbcp/outbox";
import type { LedgerRuntime } from "./ports.js";
import {
  toJournalView,
  assertBalanced,
  assertImmutable,
  reverseLines,
  type Journal,
  type JournalLine,
  type JournalView,
} from "../domain/journal.js";
import {
  CONSUMED_PAYMENT_EVENT_TYPES,
  buildCaptureJournalLines,
  buildRefundJournalLines,
} from "../domain/posting-rules.js";
import { LedgerEventTypes } from "../domain/events.js";
import {
  AuthorizationError,
  ConflictError,
  ImmutableJournalError,
  NotFoundError,
  UnbalancedJournalError,
  ValidationError,
} from "../domain/errors.js";
import { LedgerPermissions } from "./permissions.js";

export interface ActorContext {
  principalId: string;
  organizationId: string;
  locationId?: string | null;
}

/** Financial event payload shape from Payments (consumed without importing Payments). */
export interface ConsumedFinancialEventPayload {
  eventId: string;
  eventType: string;
  eventVersion?: number;
  occurredAt: string;
  organizationId: string;
  paymentId: string;
  orderId: string;
  amount: number;
  currency: string;
  refundAmountMinor?: number;
}

/**
 * Ledger application facade (S5).
 * Posts balanced journals from consumed financial events — never imports Orders or Payments.
 */
export class LedgerService {
  constructor(private readonly runtime: LedgerRuntime) {}

  private journalEventPayload(
    envelope: DomainEventEnvelope,
    journal: Journal,
  ): Record<string, unknown> {
    return {
      eventId: envelope.eventId,
      eventType: envelope.type,
      eventVersion: envelope.version,
      occurredAt: envelope.occurredAt,
      journalId: journal.journalId,
      sourceEventId: journal.sourceEventId,
      sourceEventType: journal.sourceEventType,
      organizationId: journal.organizationId,
    };
  }

  private publishLedgerEvent(
    uow: UnitOfWork,
    type: string,
    organizationId: string,
    journal: Journal,
  ): DomainEventEnvelope {
    const envelope: DomainEventEnvelope = {
      eventId: randomUUID(),
      type,
      version: 1,
      occurredAt: this.runtime.clock.now(),
      producer: "ledger",
      organizationId,
      correlationId: null,
      payload: {},
    };
    envelope.payload = this.journalEventPayload(envelope, journal);
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

  private async requireJournal(
    organizationId: string,
    journalId: string,
  ): Promise<Journal> {
    const journal = await this.runtime.journals.findById(
      organizationId,
      journalId,
    );
    if (!journal) {
      throw new NotFoundError(`journal not found: ${journalId}`);
    }
    return journal;
  }

  private validateConsumedPayload(
    payload: ConsumedFinancialEventPayload,
    actorOrgId: string,
  ): void {
    if (!payload.eventId?.trim()) {
      throw new ValidationError("eventId is required");
    }
    if (!payload.eventType?.trim()) {
      throw new ValidationError("eventType is required");
    }
    if (!payload.organizationId?.trim()) {
      throw new ValidationError("organizationId is required");
    }
    if (payload.organizationId !== actorOrgId) {
      throw new ValidationError("organizationId mismatch");
    }
    if (!payload.paymentId?.trim()) {
      throw new ValidationError("paymentId is required");
    }
    if (!payload.orderId?.trim()) {
      throw new ValidationError("orderId is required");
    }
    if (!payload.currency || !/^[A-Z]{3}$/.test(payload.currency)) {
      throw new ValidationError("currency must be ISO 4217");
    }
    if (
      typeof payload.amount !== "number" ||
      !Number.isInteger(payload.amount) ||
      payload.amount <= 0
    ) {
      throw new ValidationError("amount must be a positive integer");
    }
  }

  private resolvePostingAmount(
    payload: ConsumedFinancialEventPayload,
  ): number {
    if (payload.eventType === CONSUMED_PAYMENT_EVENT_TYPES.PaymentRefunded) {
      const refund = payload.refundAmountMinor ?? payload.amount;
      if (
        typeof refund !== "number" ||
        !Number.isInteger(refund) ||
        refund <= 0
      ) {
        throw new ValidationError("refundAmountMinor must be a positive integer");
      }
      return refund;
    }
    return payload.amount;
  }

  private buildLinesForEvent(
    journalId: string,
    payload: ConsumedFinancialEventPayload,
    amountMinor: number,
  ): JournalLine[] {
    const input = {
      journalId,
      currency: payload.currency,
      amountMinor,
      lineIds: this.runtime.ids,
    };
    if (payload.eventType === CONSUMED_PAYMENT_EVENT_TYPES.PaymentCaptured) {
      return buildCaptureJournalLines(this.runtime.postingRules, input);
    }
    if (payload.eventType === CONSUMED_PAYMENT_EVENT_TYPES.PaymentRefunded) {
      return buildRefundJournalLines(this.runtime.postingRules, input);
    }
    throw new ValidationError(`unsupported event type: ${payload.eventType}`);
  }

  private async postJournalFromEvent(
    actor: ActorContext,
    payload: ConsumedFinancialEventPayload,
  ): Promise<JournalView> {
    await this.requireOrg(actor.organizationId);
    await this.requireAuthorized(actor, LedgerPermissions.JournalPost);
    this.validateConsumedPayload(payload, actor.organizationId);

    const existing = await this.runtime.journals.findBySourceEventId(
      actor.organizationId,
      payload.eventId,
    );
    if (existing) {
      return toJournalView(existing);
    }

    const amountMinor = this.resolvePostingAmount(payload);
    const now = this.runtime.clock.now();
    const journalId = this.runtime.ids.id();
    const lines = this.buildLinesForEvent(journalId, payload, amountMinor);

    try {
      assertBalanced(lines);
    } catch (e) {
      throw new UnbalancedJournalError(
        e instanceof Error ? e.message : "journal unbalanced",
      );
    }

    const journal: Journal = {
      journalId,
      organizationId: actor.organizationId,
      sourceEventId: payload.eventId,
      sourceEventType: payload.eventType,
      externalRef: payload.eventId,
      status: "posted",
      lines,
      reversesJournalId: null,
      reversedByJournalId: null,
      postedAt: payload.occurredAt || now,
      createdAt: now,
      updatedAt: now,
    };

    const uow = this.runtime.uowFactory.start();
    await this.runtime.journals.save(uow, journal);
    const envelope = this.publishLedgerEvent(
      uow,
      LedgerEventTypes.JournalPosted,
      actor.organizationId,
      journal,
    );
    await uow.commit();

    if (this.runtime.audit) {
      await this.runtime.audit.record({
        actor: { kind: "principal", principalId: actor.principalId },
        action: "ledger.journal.post",
        organizationId: actor.organizationId,
        target: { type: "journal", id: journal.journalId },
        sourceModule: "ledger",
        sourceEventId: envelope.eventId,
        metadata: {
          consumedEventId: payload.eventId,
          consumedEventType: payload.eventType,
        },
      });
    }

    return toJournalView(journal);
  }

  /**
   * Event consumer entry point — routes supported financial event types.
   */
  async consumeFinancialEvent(
    actor: ActorContext,
    payload: ConsumedFinancialEventPayload,
  ): Promise<JournalView> {
    const supported = new Set<string>([
      CONSUMED_PAYMENT_EVENT_TYPES.PaymentCaptured,
      CONSUMED_PAYMENT_EVENT_TYPES.PaymentRefunded,
    ]);
    if (!supported.has(payload.eventType)) {
      throw new ValidationError(
        `unsupported financial event type: ${payload.eventType}`,
      );
    }
    return this.postJournalFromEvent(actor, payload);
  }

  async reverseJournal(
    actor: ActorContext,
    journalId: string,
  ): Promise<{ original: JournalView; reversal: JournalView }> {
    await this.requireOrg(actor.organizationId);
    await this.requireAuthorized(actor, LedgerPermissions.JournalReverse);

    const original = await this.requireJournal(actor.organizationId, journalId);
    if (original.status !== "posted") {
      throw new ConflictError(
        `only posted journals can be reversed; status=${original.status}`,
      );
    }
    if (original.reversedByJournalId) {
      throw new ConflictError("journal already reversed");
    }

    const now = this.runtime.clock.now();
    const reversalId = this.runtime.ids.id();
    const reversalLines = reverseLines(
      original,
      reversalId,
      this.runtime.ids,
    );

    try {
      assertBalanced(reversalLines);
    } catch (e) {
      throw new UnbalancedJournalError(
        e instanceof Error ? e.message : "reversal journal unbalanced",
      );
    }

    const reversalJournal: Journal = {
      journalId: reversalId,
      organizationId: original.organizationId,
      sourceEventId: this.runtime.ids.id(),
      sourceEventType: "ledger.journal.reversal",
      externalRef: original.journalId,
      status: "posted",
      lines: reversalLines,
      reversesJournalId: original.journalId,
      reversedByJournalId: null,
      postedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    const reversedOriginal: Journal = {
      ...original,
      status: "reversed",
      reversedByJournalId: reversalId,
      updatedAt: now,
    };

    const uow = this.runtime.uowFactory.start();
    await this.runtime.journals.save(uow, reversalJournal);
    await this.runtime.journals.save(uow, reversedOriginal);
    this.publishLedgerEvent(
      uow,
      LedgerEventTypes.JournalPosted,
      actor.organizationId,
      reversalJournal,
    );
    this.publishLedgerEvent(
      uow,
      LedgerEventTypes.JournalReversed,
      actor.organizationId,
      reversedOriginal,
    );
    await uow.commit();

    return {
      original: toJournalView(reversedOriginal),
      reversal: toJournalView(reversalJournal),
    };
  }

  async getJournal(
    organizationId: string,
    journalId: string,
  ): Promise<JournalView | null> {
    const journal = await this.runtime.journals.findById(
      organizationId,
      journalId,
    );
    return journal ? toJournalView(journal) : null;
  }

  async findJournals(
    actor: ActorContext,
    filter: { status?: string; sourceEventType?: string } = {},
  ): Promise<JournalView[]> {
    await this.requireAuthorized(actor, LedgerPermissions.JournalRead);
    const rows = await this.runtime.journals.list({
      organizationId: actor.organizationId,
      ...filter,
    });
    return rows.map(toJournalView);
  }

  /** Guard for immutability — posted/reversed journals cannot be replaced. */
  async assertJournalMutable(
    organizationId: string,
    journalId: string,
  ): Promise<void> {
    const journal = await this.requireJournal(organizationId, journalId);
    try {
      assertImmutable(journal);
    } catch {
      throw new ImmutableJournalError(
        `journal ${journalId} is immutable (status=${journal.status})`,
      );
    }
  }
}
