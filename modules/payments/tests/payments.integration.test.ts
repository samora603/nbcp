import { describe, expect, it } from "vitest";
import { createIdentityKernel } from "@nbcp/identity";
import { createTenancyKernel } from "@nbcp/tenancy";
import { createRbacKernel } from "@nbcp/rbac";
import { createPartiesKernel } from "@nbcp/parties";
import { createCatalogKernel } from "@nbcp/catalog";
import { createOrdersKernel } from "@nbcp/orders";
import { createPaymentsKernel } from "../src/application/create-payments-kernel.js";
import { PaymentsEventTypes } from "../src/domain/events.js";
import {
  ConflictError,
  ValidationError,
} from "../src/domain/errors.js";

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

async function bootPayments(email: string) {
  const identity = createIdentityKernel();
  const owner = await registerVerified(identity.service, email);
  const outboxStore = identity.outboxStore;
  const tenancy = createTenancyKernel({
    identity: identity.service,
    outboxStore,
  });
  const org = await tenancy.service.createOrganization({
    name: "PaymentsCo",
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
  const actor = {
    principalId: owner.principalId,
    organizationId: org.organizationId,
  };
  return {
    parties,
    catalog,
    orders,
    payments,
    actor,
    outboxStore,
  };
}

async function committedOrder(
  ctx: Awaited<ReturnType<typeof bootPayments>>,
  amountMinor = 5000,
) {
  const customer = await ctx.parties.service.createIndividual(ctx.actor, {
    displayName: "Payer",
    roleKeys: ["customer"],
  });
  const item = await ctx.catalog.service.createItem(ctx.actor, {
    code: "PAY-SKU",
    name: "Pay SKU",
    traits: ["goods"],
    status: "active",
    listPrice: { currency: "USD", amountMinor },
  });
  const draft = await ctx.orders.service.createOrder(ctx.actor, {
    customerPartyId: customer.partyId,
  });
  await ctx.orders.service.addLine(ctx.actor, {
    orderId: draft.orderId,
    catalogItemId: item.catalogItemId,
    quantity: 1,
  });
  return ctx.orders.service.commitOrder(ctx.actor, draft.orderId);
}

describe("payments integration", () => {
  it("full lifecycle: pending → authorized → captured", async () => {
    const ctx = await bootPayments("lifecycle@example.com");
    const order = await committedOrder(ctx);
    const created = await ctx.payments.service.createPayment(ctx.actor, {
      orderId: order.orderId,
      amount: { currency: "USD", amountMinor: 5000 },
      provider: "stripe",
    });
    expect(created.status).toBe("pending");

    const authorized = await ctx.payments.service.authorizePayment(
      ctx.actor,
      created.paymentId,
      { providerReference: "pi_test_123" },
    );
    expect(authorized.status).toBe("authorized");
    expect(authorized.providerReference).toBe("pi_test_123");
    expect(authorized.authorizedAt).not.toBeNull();

    const captured = await ctx.payments.service.capturePayment(
      ctx.actor,
      created.paymentId,
    );
    expect(captured.status).toBe("captured");
    expect(captured.capturedAt).not.toBeNull();

    const createdEvents = await ctx.outboxStore.query({
      type: PaymentsEventTypes.Created,
    });
    const capturedEvents = await ctx.outboxStore.query({
      type: PaymentsEventTypes.Captured,
    });
    expect(createdEvents.length).toBeGreaterThanOrEqual(1);
    expect(capturedEvents.length).toBeGreaterThanOrEqual(1);
    const payload = capturedEvents[capturedEvents.length - 1]!.envelope.payload;
    expect(payload.eventId).toBeDefined();
    expect(payload.eventType).toBe(PaymentsEventTypes.Captured);
    expect(payload.paymentId).toBe(created.paymentId);
    expect(payload.orderId).toBe(order.orderId);
    expect(payload.amount).toBe(5000);
    expect(payload.currency).toBe("USD");
  });

  it("voids authorized payment", async () => {
    const ctx = await bootPayments("void@example.com");
    const order = await committedOrder(ctx);
    const payment = await ctx.payments.service.createPayment(ctx.actor, {
      orderId: order.orderId,
      amount: { currency: "USD", amountMinor: 1000 },
      provider: "manual",
    });
    await ctx.payments.service.authorizePayment(ctx.actor, payment.paymentId);
    const voided = await ctx.payments.service.voidPayment(
      ctx.actor,
      payment.paymentId,
    );
    expect(voided.status).toBe("voided");
    const events = await ctx.outboxStore.query({
      type: PaymentsEventTypes.Voided,
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it("supports partial and full refunds", async () => {
    const ctx = await bootPayments("refund@example.com");
    const order = await committedOrder(ctx, 10000);
    const payment = await ctx.payments.service.createPayment(ctx.actor, {
      orderId: order.orderId,
      amount: { currency: "USD", amountMinor: 10000 },
      provider: "stripe",
    });
    await ctx.payments.service.authorizePayment(ctx.actor, payment.paymentId);
    await ctx.payments.service.capturePayment(ctx.actor, payment.paymentId);

    const partial = await ctx.payments.service.refundPayment(
      ctx.actor,
      payment.paymentId,
      { refundAmountMinor: 3000 },
    );
    expect(partial.status).toBe("partially_refunded");
    expect(partial.refundedAmountMinor).toBe(3000);

    const full = await ctx.payments.service.refundPayment(
      ctx.actor,
      payment.paymentId,
      { refundAmountMinor: 7000 },
    );
    expect(full.status).toBe("refunded");
    expect(full.refundedAmountMinor).toBe(10000);
    expect(full.refundedAt).not.toBeNull();

    const refundEvents = await ctx.outboxStore.query({
      type: PaymentsEventTypes.Refunded,
    });
    expect(refundEvents.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects invalid transitions and draft orders", async () => {
    const ctx = await bootPayments("reject@example.com");
    const customer = await ctx.parties.service.createIndividual(ctx.actor, {
      displayName: "Buyer",
      roleKeys: ["customer"],
    });
    const draft = await ctx.orders.service.createOrder(ctx.actor, {
      customerPartyId: customer.partyId,
    });

    await expect(
      ctx.payments.service.createPayment(ctx.actor, {
        orderId: draft.orderId,
        amount: { currency: "USD", amountMinor: 100 },
        provider: "stripe",
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    const order = await committedOrder(ctx);
    const payment = await ctx.payments.service.createPayment(ctx.actor, {
      orderId: order.orderId,
      amount: { currency: "USD", amountMinor: 1000 },
      provider: "stripe",
    });

    await expect(
      ctx.payments.service.capturePayment(ctx.actor, payment.paymentId),
    ).rejects.toBeInstanceOf(ConflictError);

    await ctx.payments.service.authorizePayment(ctx.actor, payment.paymentId);
    await ctx.payments.service.capturePayment(ctx.actor, payment.paymentId);

    await expect(
      ctx.payments.service.voidPayment(ctx.actor, payment.paymentId),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects refund exceeding captured amount", async () => {
    const ctx = await bootPayments("overrefund@example.com");
    const order = await committedOrder(ctx);
    const payment = await ctx.payments.service.createPayment(ctx.actor, {
      orderId: order.orderId,
      amount: { currency: "USD", amountMinor: 2000 },
      provider: "stripe",
    });
    await ctx.payments.service.authorizePayment(ctx.actor, payment.paymentId);
    await ctx.payments.service.capturePayment(ctx.actor, payment.paymentId);

    await expect(
      ctx.payments.service.refundPayment(ctx.actor, payment.paymentId, {
        refundAmountMinor: 3000,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
