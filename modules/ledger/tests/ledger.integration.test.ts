import { describe, expect, it } from "vitest";
import { createIdentityKernel } from "@nbcp/identity";
import { createTenancyKernel } from "@nbcp/tenancy";
import { createRbacKernel } from "@nbcp/rbac";
import { createPartiesKernel } from "@nbcp/parties";
import { createCatalogKernel } from "@nbcp/catalog";
import { createOrdersKernel } from "@nbcp/orders";
import { createPaymentsKernel } from "@nbcp/payments";
import { PaymentsEventTypes } from "@nbcp/payments";
import { InMemoryUnitOfWorkFactory } from "@nbcp/outbox";
import { createLedgerKernel } from "../src/application/create-ledger-kernel.js";
import { CONSUMED_PAYMENT_EVENT_TYPES } from "../src/domain/posting-rules.js";
import { LedgerEventTypes } from "../src/domain/events.js";
import { ImmutableJournalError } from "../src/domain/errors.js";

async function registerVerified(
  identity: ReturnType<typeof createIdentityKernel>["service"],
  email: string,
) {
  const { user, verificationToken } = await identity.registerLocalUser({
    email,
    password: "password1",
  });
  await identity.verifyEmail({
    principalId: user.principalId,
    token: verificationToken,
  });
  return user;
}

async function bootLedgerStack(email: string) {
  const identity = createIdentityKernel();
  const owner = await registerVerified(identity.service, email);
  const outboxStore = identity.outboxStore;
  const tenancy = createTenancyKernel({
    identity: identity.service,
    outboxStore,
  });
  const org = await tenancy.service.createOrganization({
    name: "LedgerCo",
    ownerPrincipalId: owner.principalId,
  });
  const rbac = createRbacKernel({
    identity: identity.service,
    tenancy: tenancy.service,
    outboxStore,
  });
  await rbac.ready;
  await rbac.service.bootstrapOrganizationAdministrator({
    organizationId: org.organizationId,
    ownerPrincipalId: owner.principalId,
  });
  const parties = createPartiesKernel({
    identity: identity.service,
    tenancy: tenancy.service,
    rbac: rbac.service,
    outboxStore,
  });
  const catalog = createCatalogKernel({
    tenancy: tenancy.service,
    rbac: rbac.service,
    parties: parties.service,
    outboxStore,
  });
  const orders = createOrdersKernel({
    tenancy: tenancy.service,
    rbac: rbac.service,
    parties: parties.service,
    catalog: catalog.service,
    outboxStore,
  });
  const payments = createPaymentsKernel({
    tenancy: tenancy.service,
    rbac: rbac.service,
    orders: orders.service,
    outboxStore,
  });
  const ledger = createLedgerKernel({
    tenancy: tenancy.service,
    rbac: rbac.service,
    outboxStore,
  });
  const actor = {
    principalId: owner.principalId,
    organizationId: org.organizationId,
  };
  return { parties, catalog, orders, payments, ledger, actor, outboxStore };
}

function capturePayloadFromOutbox(
  envelope: {
    eventId: string;
    type: string;
    version: number;
    occurredAt: string;
    payload: Record<string, unknown>;
  },
  organizationId: string,
) {
  const p = envelope.payload;
  return {
    eventId: envelope.eventId,
    eventType: envelope.type,
    eventVersion: envelope.version,
    occurredAt: envelope.occurredAt,
    organizationId,
    paymentId: String(p.paymentId),
    orderId: String(p.orderId),
    amount: Number(p.amount),
    currency: String(p.currency),
  };
}

describe("ledger integration", () => {
  it("posts capture journal DR CASH_CLEARING / CR REVENUE", async () => {
    const ctx = await bootLedgerStack("capture@example.com");
    const customer = await ctx.parties.service.createIndividual(ctx.actor, {
      displayName: "Buyer",
      roleKeys: ["customer"],
    });
    const item = await ctx.catalog.service.createItem(ctx.actor, {
      code: "LED-SKU",
      name: "Ledger SKU",
      traits: ["goods"],
      status: "active",
      listPrice: { currency: "USD", amountMinor: 5000 },
    });
    const draft = await ctx.orders.service.createOrder(ctx.actor, {
      customerPartyId: customer.partyId,
    });
    await ctx.orders.service.addLine(ctx.actor, {
      orderId: draft.orderId,
      catalogItemId: item.catalogItemId,
      quantity: 1,
    });
    const order = await ctx.orders.service.commitOrder(ctx.actor, draft.orderId);
    const payment = await ctx.payments.service.createPayment(ctx.actor, {
      orderId: order.orderId,
      amount: { currency: "USD", amountMinor: 5000 },
      provider: "stripe",
    });
    await ctx.payments.service.authorizePayment(ctx.actor, payment.paymentId);
    await ctx.payments.service.capturePayment(ctx.actor, payment.paymentId);

    const captureEvents = await ctx.outboxStore.query({
      type: PaymentsEventTypes.Captured,
    });
    const payEnvelope = captureEvents[captureEvents.length - 1]!.envelope;
    const payload = capturePayloadFromOutbox(
      payEnvelope,
      ctx.actor.organizationId,
    );

    const journal = await ctx.ledger.service.consumeFinancialEvent(
      ctx.actor,
      payload,
    );
    expect(journal.status).toBe("posted");
    expect(journal.sourceEventId).toBe(payEnvelope.eventId);
    expect(journal.lines).toHaveLength(2);
    const debit = journal.lines.find((l) => l.direction === "debit");
    const credit = journal.lines.find((l) => l.direction === "credit");
    expect(debit?.accountCode).toBe("CASH_CLEARING");
    expect(credit?.accountCode).toBe("REVENUE");
    expect(debit?.amountMinor).toBe(5000);
    expect(credit?.amountMinor).toBe(5000);

    const posted = await ctx.outboxStore.query({
      type: LedgerEventTypes.JournalPosted,
    });
    expect(posted.length).toBeGreaterThanOrEqual(1);
    const lastPosted = posted[posted.length - 1]!.envelope.payload;
    expect(lastPosted.journalId).toBe(journal.journalId);
    expect(lastPosted.sourceEventId).toBe(payEnvelope.eventId);
  });

  it("posts refund journal DR REFUNDS / CR CASH_CLEARING", async () => {
    const ctx = await bootLedgerStack("refund@example.com");
    const customer = await ctx.parties.service.createIndividual(ctx.actor, {
      displayName: "Refunder",
      roleKeys: ["customer"],
    });
    const item = await ctx.catalog.service.createItem(ctx.actor, {
      code: "REF-SKU",
      name: "Ref SKU",
      traits: ["goods"],
      status: "active",
      listPrice: { currency: "USD", amountMinor: 3000 },
    });
    const draft = await ctx.orders.service.createOrder(ctx.actor, {
      customerPartyId: customer.partyId,
    });
    await ctx.orders.service.addLine(ctx.actor, {
      orderId: draft.orderId,
      catalogItemId: item.catalogItemId,
      quantity: 1,
    });
    const order = await ctx.orders.service.commitOrder(ctx.actor, draft.orderId);
    const payment = await ctx.payments.service.createPayment(ctx.actor, {
      orderId: order.orderId,
      amount: { currency: "USD", amountMinor: 3000 },
      provider: "stripe",
    });
    await ctx.payments.service.authorizePayment(ctx.actor, payment.paymentId);
    await ctx.payments.service.capturePayment(ctx.actor, payment.paymentId);
    await ctx.payments.service.refundPayment(ctx.actor, payment.paymentId, {
      refundAmountMinor: 1200,
    });

    const refundEvents = await ctx.outboxStore.query({
      type: PaymentsEventTypes.Refunded,
    });
    const payEnvelope = refundEvents[refundEvents.length - 1]!.envelope;
    const payload = {
      ...capturePayloadFromOutbox(payEnvelope, ctx.actor.organizationId),
      refundAmountMinor: Number(payEnvelope.payload.refundAmountMinor),
    };

    const journal = await ctx.ledger.service.consumeFinancialEvent(
      ctx.actor,
      payload,
    );
    const debit = journal.lines.find((l) => l.direction === "debit");
    const credit = journal.lines.find((l) => l.direction === "credit");
    expect(debit?.accountCode).toBe("REFUNDS");
    expect(credit?.accountCode).toBe("CASH_CLEARING");
    expect(debit?.amountMinor).toBe(1200);
  });

  it("idempotent: duplicate source event returns same journal", async () => {
    const ctx = await bootLedgerStack("idem@example.com");
    const payload = {
      eventId: "evt-idem-001",
      eventType: CONSUMED_PAYMENT_EVENT_TYPES.PaymentCaptured,
      eventVersion: 1,
      occurredAt: "2026-07-15T00:00:00.000Z",
      organizationId: ctx.actor.organizationId,
      paymentId: "pay-1",
      orderId: "ord-1",
      amount: 999,
      currency: "USD",
    };
    const first = await ctx.ledger.service.consumeFinancialEvent(
      ctx.actor,
      payload,
    );
    const second = await ctx.ledger.service.consumeFinancialEvent(
      ctx.actor,
      payload,
    );
    expect(second.journalId).toBe(first.journalId);
    const all = await ctx.ledger.service.findJournals(ctx.actor, {
      sourceEventType: CONSUMED_PAYMENT_EVENT_TYPES.PaymentCaptured,
    });
    const forEvent = all.filter((j) => j.sourceEventId === payload.eventId);
    expect(forEvent).toHaveLength(1);
  });

  it("reversal creates reversing entries and marks original reversed", async () => {
    const ctx = await bootLedgerStack("reverse@example.com");
    const payload = {
      eventId: "evt-rev-001",
      eventType: CONSUMED_PAYMENT_EVENT_TYPES.PaymentCaptured,
      eventVersion: 1,
      occurredAt: "2026-07-15T00:00:00.000Z",
      organizationId: ctx.actor.organizationId,
      paymentId: "pay-rev",
      orderId: "ord-rev",
      amount: 1500,
      currency: "USD",
    };
    const posted = await ctx.ledger.service.consumeFinancialEvent(
      ctx.actor,
      payload,
    );
    const { original, reversal } = await ctx.ledger.service.reverseJournal(
      ctx.actor,
      posted.journalId,
    );
    expect(original.status).toBe("reversed");
    expect(original.reversedByJournalId).toBe(reversal.journalId);
    expect(reversal.reversesJournalId).toBe(original.journalId);
    expect(reversal.lines[0]?.direction).toBe("credit");
    expect(reversal.lines[1]?.direction).toBe("debit");

    const reversedEvents = await ctx.outboxStore.query({
      type: LedgerEventTypes.JournalReversed,
    });
    expect(reversedEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("posted journals are immutable in repository", async () => {
    const ctx = await bootLedgerStack("immutable@example.com");
    const payload = {
      eventId: "evt-immut-001",
      eventType: CONSUMED_PAYMENT_EVENT_TYPES.PaymentCaptured,
      eventVersion: 1,
      occurredAt: "2026-07-15T00:00:00.000Z",
      organizationId: ctx.actor.organizationId,
      paymentId: "pay-immut",
      orderId: "ord-immut",
      amount: 100,
      currency: "USD",
    };
    const journal = await ctx.ledger.service.consumeFinancialEvent(
      ctx.actor,
      payload,
    );
    await expect(
      ctx.ledger.service.assertJournalMutable(
        ctx.actor.organizationId,
        journal.journalId,
      ),
    ).rejects.toBeInstanceOf(ImmutableJournalError);

    const tampered = structuredClone(journal);
    tampered.lines[0]!.amountMinor = 99999;
    const uowFactory = new InMemoryUnitOfWorkFactory({
      store: ctx.outboxStore,
    });
    const uow = uowFactory.start();
    await expect(ctx.ledger.journals.save(uow, tampered)).rejects.toBeInstanceOf(
      ImmutableJournalError,
    );
  });
});
