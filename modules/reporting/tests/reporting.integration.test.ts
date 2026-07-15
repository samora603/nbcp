import { describe, expect, it } from "vitest";
import { createIdentityKernel } from "@nbcp/identity";
import { createTenancyKernel } from "@nbcp/tenancy";
import { createRbacKernel } from "@nbcp/rbac";
import { createPartiesKernel } from "@nbcp/parties";
import { createCatalogKernel } from "@nbcp/catalog";
import { createOrdersKernel } from "@nbcp/orders";
import { OrdersEventTypes } from "@nbcp/orders";
import { createPaymentsKernel } from "@nbcp/payments";
import { PaymentsEventTypes } from "@nbcp/payments";
import { createInventoryKernel } from "@nbcp/inventory";
import { InventoryEventTypes } from "@nbcp/inventory";
import { createLedgerKernel } from "@nbcp/ledger";
import { LedgerEventTypes } from "@nbcp/ledger";
import { createReportingKernel } from "../src/application/create-reporting-kernel.js";

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

async function bootPlatform(email: string) {
  const identity = createIdentityKernel();
  const owner = await registerVerified(identity.service, email);
  const outboxStore = identity.outboxStore;
  const tenancy = createTenancyKernel({
    identity: identity.service,
    outboxStore,
  });
  const org = await tenancy.service.createOrganization({
    name: "ReportCo",
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
  const inventory = createInventoryKernel({
    tenancy: tenancy.service,
    rbac: rbac.service,
    outboxStore,
  });
  const ledger = createLedgerKernel({
    tenancy: tenancy.service,
    rbac: rbac.service,
    outboxStore,
  });
  const reporting = createReportingKernel({
    tenancy: tenancy.service,
    rbac: rbac.service,
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
    inventory,
    ledger,
    reporting,
    actor,
    outboxStore,
  };
}

function toConsumed(
  envelope: {
    eventId: string;
    type: string;
    version: number;
    occurredAt: string;
    organizationId: string | null;
    payload: Record<string, unknown>;
  },
  organizationId: string,
) {
  return {
    eventId: envelope.eventId,
    eventType: envelope.type,
    eventVersion: envelope.version,
    occurredAt: envelope.occurredAt,
    organizationId,
    payload: envelope.payload,
  };
}

describe("reporting integration", () => {
  it("projects order, payment, inventory, and ledger facts end-to-end", async () => {
    const ctx = await bootPlatform("e2e@example.com");
    const customer = await ctx.parties.service.createIndividual(ctx.actor, {
      displayName: "Buyer",
      roleKeys: ["customer"],
    });
    const item = await ctx.catalog.service.createItem(ctx.actor, {
      code: "RPT-SKU",
      name: "Report SKU",
      traits: ["goods"],
      status: "active",
      stockable: true,
      listPrice: { currency: "USD", amountMinor: 2000 },
    });

    await ctx.inventory.service.receiveStock(ctx.actor, {
      sku: item.catalogItemId,
      quantity: 100,
    });
    const receivedEvents = await ctx.outboxStore.query({
      type: InventoryEventTypes.StockReceived,
    });
    await ctx.reporting.service.consumeEvent(
      ctx.actor,
      toConsumed(
        receivedEvents[receivedEvents.length - 1]!.envelope,
        ctx.actor.organizationId,
      ),
    );

    const draft = await ctx.orders.service.createOrder(ctx.actor, {
      customerPartyId: customer.partyId,
    });
    const createdEvents = await ctx.outboxStore.query({
      type: OrdersEventTypes.OrderCreated,
    });
    await ctx.reporting.service.consumeEvent(
      ctx.actor,
      toConsumed(
        createdEvents[createdEvents.length - 1]!.envelope,
        ctx.actor.organizationId,
      ),
    );

    await ctx.orders.service.addLine(ctx.actor, {
      orderId: draft.orderId,
      catalogItemId: item.catalogItemId,
      quantity: 4,
    });
    await ctx.orders.service.commitOrder(ctx.actor, draft.orderId);

    const commitEvents = await ctx.outboxStore.query({
      type: OrdersEventTypes.OrderCommitted,
    });
    const commitEnvelope = commitEvents[commitEvents.length - 1]!.envelope;
    await ctx.reporting.service.consumeEvent(
      ctx.actor,
      toConsumed(commitEnvelope, ctx.actor.organizationId),
    );
    await ctx.inventory.service.consumeOrderEvent(
      ctx.actor,
      {
        eventId: commitEnvelope.eventId,
        eventType: commitEnvelope.type,
        occurredAt: commitEnvelope.occurredAt,
        organizationId: ctx.actor.organizationId,
        orderId: String(commitEnvelope.payload.orderId),
        lineSummaries: commitEnvelope.payload.lineSummaries as never,
      },
    );

    const reservedEvents = await ctx.outboxStore.query({
      type: InventoryEventTypes.StockReserved,
    });
    await ctx.reporting.service.consumeEvent(
      ctx.actor,
      toConsumed(
        reservedEvents[reservedEvents.length - 1]!.envelope,
        ctx.actor.organizationId,
      ),
    );

    const payment = await ctx.payments.service.createPayment(ctx.actor, {
      orderId: draft.orderId,
      amount: { currency: "USD", amountMinor: 8000 },
      provider: "stripe",
    });
    await ctx.payments.service.authorizePayment(ctx.actor, payment.paymentId);
    await ctx.payments.service.capturePayment(ctx.actor, payment.paymentId);

    const capturePayEvents = await ctx.outboxStore.query({
      type: PaymentsEventTypes.Captured,
    });
    const capturePayEnvelope =
      capturePayEvents[capturePayEvents.length - 1]!.envelope;
    await ctx.reporting.service.consumeEvent(
      ctx.actor,
      toConsumed(capturePayEnvelope, ctx.actor.organizationId),
    );

    await ctx.ledger.service.consumeFinancialEvent(ctx.actor, {
      eventId: capturePayEnvelope.eventId,
      eventType: capturePayEnvelope.type,
      occurredAt: capturePayEnvelope.occurredAt,
      organizationId: ctx.actor.organizationId,
      paymentId: String(capturePayEnvelope.payload.paymentId),
      orderId: String(capturePayEnvelope.payload.orderId),
      amount: Number(capturePayEnvelope.payload.amount),
      currency: String(capturePayEnvelope.payload.currency),
    });

    const ledgerEvents = await ctx.outboxStore.query({
      type: LedgerEventTypes.JournalPosted,
    });
    await ctx.reporting.service.consumeEvent(
      ctx.actor,
      toConsumed(
        ledgerEvents[ledgerEvents.length - 1]!.envelope,
        ctx.actor.organizationId,
      ),
    );

    await ctx.orders.service.fulfillOrder(ctx.actor, draft.orderId);
    const fulfillEvents = await ctx.outboxStore.query({
      type: OrdersEventTypes.OrderFulfilled,
    });
    const fulfillEnvelope = fulfillEvents[fulfillEvents.length - 1]!.envelope;
    await ctx.reporting.service.consumeEvent(
      ctx.actor,
      toConsumed(fulfillEnvelope, ctx.actor.organizationId),
    );
    await ctx.inventory.service.consumeOrderEvent(
      ctx.actor,
      {
        eventId: fulfillEnvelope.eventId,
        eventType: fulfillEnvelope.type,
        occurredAt: fulfillEnvelope.occurredAt,
        organizationId: ctx.actor.organizationId,
        orderId: String(fulfillEnvelope.payload.orderId),
        lineSummaries: fulfillEnvelope.payload.lineSummaries as never,
      },
    );
    const issuedEvents = await ctx.outboxStore.query({
      type: InventoryEventTypes.StockIssued,
    });
    await ctx.reporting.service.consumeEvent(
      ctx.actor,
      toConsumed(
        issuedEvents[issuedEvents.length - 1]!.envelope,
        ctx.actor.organizationId,
      ),
    );

    const ordersReport = await ctx.reporting.service.getOrdersReport(ctx.actor);
    expect(ordersReport.orderCount).toBe(1);
    expect(ordersReport.fulfilledOrders).toBe(1);
    expect(ordersReport.averageOrderValue).toBe(8000);

    const revenueReport = await ctx.reporting.service.getRevenueReport(
      ctx.actor,
    );
    expect(revenueReport.revenue).toBe(8000);
    expect(revenueReport.netRevenue).toBe(8000);

    const inventoryReport = await ctx.reporting.service.getInventoryReport(
      ctx.actor,
    );
    const skuRow = inventoryReport.find((r) => r.sku === item.catalogItemId);
    expect(skuRow?.onHand).toBe(96);
    expect(skuRow?.reserved).toBe(0);
    expect(skuRow?.available).toBe(96);
    expect(skuRow?.movementCount).toBeGreaterThanOrEqual(2);

    const movements = await ctx.reporting.store.listInventoryMovements(
      ctx.actor.organizationId,
    );
    expect(movements.length).toBeGreaterThanOrEqual(2);
  });

  it("idempotent event consumption does not duplicate facts", async () => {
    const ctx = await bootPlatform("idem@example.com");
    const event = {
      eventId: "idem-order-evt",
      eventType: OrdersEventTypes.OrderCommitted,
      occurredAt: "2026-07-15T00:00:00.000Z",
      organizationId: ctx.actor.organizationId,
      payload: {
        orderId: "ord-idem",
        customerPartyId: "cust-1",
        status: "committed",
        totals: { currency: "USD", amountMinor: 1500 },
      },
    };
    await ctx.reporting.service.consumeEvent(ctx.actor, event);
    await ctx.reporting.service.consumeEvent(ctx.actor, event);
    const facts = await ctx.reporting.store.listOrderFacts(
      ctx.actor.organizationId,
    );
    expect(facts.filter((f) => f.orderId === "ord-idem")).toHaveLength(1);
    const ordersReport = await ctx.reporting.service.getOrdersReport(ctx.actor);
    expect(ordersReport.orderCount).toBe(1);
  });
});
