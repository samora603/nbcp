import { describe, expect, it } from "vitest";
import { createIdentityKernel } from "@nbcp/identity";
import { createTenancyKernel } from "@nbcp/tenancy";
import { createRbacKernel } from "@nbcp/rbac";
import { createPartiesKernel } from "@nbcp/parties";
import { createCatalogKernel } from "@nbcp/catalog";
import { createOrdersKernel } from "@nbcp/orders";
import { OrdersEventTypes } from "@nbcp/orders";
import { createInventoryKernel } from "../src/application/create-inventory-kernel.js";
import { InventoryEventTypes } from "../src/domain/events.js";
import { InsufficientStockError } from "../src/domain/errors.js";

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

async function bootStack(email: string) {
  const identity = createIdentityKernel();
  const owner = await registerVerified(identity.service, email);
  const outboxStore = identity.outboxStore;
  const tenancy = createTenancyKernel({
    identity: identity.service,
    outboxStore,
  });
  const org = await tenancy.service.createOrganization({
    name: "InvCo",
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
  const inventory = createInventoryKernel({
    tenancy: tenancy.service,
    rbac: rbac.service,
    outboxStore,
  });
  const actor = {
    principalId: owner.principalId,
    organizationId: org.organizationId,
  };
  return { parties, catalog, orders, inventory, actor, outboxStore };
}

function orderPayloadFromEnvelope(
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
    orderId: String(envelope.payload.orderId),
    inventoryIntent: envelope.payload.inventoryIntent as string | undefined,
    lineSummaries: envelope.payload.lineSummaries as
      | Array<{
          orderLineId: string;
          catalogItemId: string;
          quantity: number;
          fulfilledQuantity: number;
          stockable: boolean;
        }>
      | undefined,
    fulfilledThisRequest: envelope.payload.fulfilledThisRequest as
      | Array<{ orderLineId: string; quantity: number }>
      | undefined,
  };
}

describe("inventory integration", () => {
  it("receive → reserve → issue → available stays correct", async () => {
    const ctx = await bootStack("flow@example.com");
    const customer = await ctx.parties.service.createIndividual(ctx.actor, {
      displayName: "Buyer",
      roleKeys: ["customer"],
    });
    const item = await ctx.catalog.service.createItem(ctx.actor, {
      code: "INV-100",
      name: "Stockable Widget",
      traits: ["goods"],
      status: "active",
      stockable: true,
      listPrice: { currency: "USD", amountMinor: 1000 },
    });

    const received = await ctx.inventory.service.receiveStock(ctx.actor, {
      sku: item.catalogItemId,
      quantity: 50,
    });
    expect(received.item.onHand).toBe(50);
    expect(received.item.reserved).toBe(0);
    expect(received.item.available).toBe(50);

    const draft = await ctx.orders.service.createOrder(ctx.actor, {
      customerPartyId: customer.partyId,
    });
    await ctx.orders.service.addLine(ctx.actor, {
      orderId: draft.orderId,
      catalogItemId: item.catalogItemId,
      quantity: 10,
    });
    await ctx.orders.service.commitOrder(ctx.actor, draft.orderId);

    const commitEvents = await ctx.outboxStore.query({
      type: OrdersEventTypes.OrderCommitted,
    });
    const commitEnvelope = commitEvents[commitEvents.length - 1]!.envelope;
    const reserveMovements = await ctx.inventory.service.consumeOrderEvent(
      ctx.actor,
      orderPayloadFromEnvelope(commitEnvelope, ctx.actor.organizationId),
    );
    expect(reserveMovements).toHaveLength(1);
    expect(reserveMovements[0]?.type).toBe("reserve");
    expect(reserveMovements[0]?.quantity).toBe(10);

    const afterReserve = await ctx.inventory.service.getItem(
      ctx.actor.organizationId,
      item.catalogItemId,
    );
    expect(afterReserve?.onHand).toBe(50);
    expect(afterReserve?.reserved).toBe(10);
    expect(afterReserve?.available).toBe(40);

    await ctx.orders.service.fulfillOrder(ctx.actor, draft.orderId);
    const fulfillEvents = await ctx.outboxStore.query({
      type: OrdersEventTypes.OrderFulfilled,
    });
    const fulfillEnvelope = fulfillEvents[fulfillEvents.length - 1]!.envelope;
    const issueMovements = await ctx.inventory.service.consumeOrderEvent(
      ctx.actor,
      orderPayloadFromEnvelope(fulfillEnvelope, ctx.actor.organizationId),
    );
    expect(issueMovements[0]?.type).toBe("issue");

    const afterIssue = await ctx.inventory.service.getItem(
      ctx.actor.organizationId,
      item.catalogItemId,
    );
    expect(afterIssue?.onHand).toBe(40);
    expect(afterIssue?.reserved).toBe(0);
    expect(afterIssue?.available).toBe(40);

    const reservedEvents = await ctx.outboxStore.query({
      type: InventoryEventTypes.StockReserved,
    });
    const issuedEvents = await ctx.outboxStore.query({
      type: InventoryEventTypes.StockIssued,
    });
    expect(reservedEvents.length).toBeGreaterThanOrEqual(1);
    expect(issuedEvents.length).toBeGreaterThanOrEqual(1);
    expect(issuedEvents[issuedEvents.length - 1]?.envelope.payload.sku).toBe(
      item.catalogItemId,
    );
  });

  it("cancel releases unissued reservation", async () => {
    const ctx = await bootStack("cancel@example.com");
    const customer = await ctx.parties.service.createIndividual(ctx.actor, {
      displayName: "Buyer",
      roleKeys: ["customer"],
    });
    const item = await ctx.catalog.service.createItem(ctx.actor, {
      code: "INV-200",
      name: "Widget 2",
      traits: ["goods"],
      status: "active",
      stockable: true,
      listPrice: { currency: "USD", amountMinor: 500 },
    });
    await ctx.inventory.service.receiveStock(ctx.actor, {
      sku: item.catalogItemId,
      quantity: 20,
    });

    const draft = await ctx.orders.service.createOrder(ctx.actor, {
      customerPartyId: customer.partyId,
    });
    await ctx.orders.service.addLine(ctx.actor, {
      orderId: draft.orderId,
      catalogItemId: item.catalogItemId,
      quantity: 5,
    });
    await ctx.orders.service.commitOrder(ctx.actor, draft.orderId);

    const commitEvents = await ctx.outboxStore.query({
      type: OrdersEventTypes.OrderCommitted,
    });
    await ctx.inventory.service.consumeOrderEvent(
      ctx.actor,
      orderPayloadFromEnvelope(
        commitEvents[commitEvents.length - 1]!.envelope,
        ctx.actor.organizationId,
      ),
    );

    await ctx.orders.service.cancelOrder(ctx.actor, {
      orderId: draft.orderId,
    });
    const cancelEvents = await ctx.outboxStore.query({
      type: OrdersEventTypes.OrderCancelled,
    });
    const releaseMovements = await ctx.inventory.service.consumeOrderEvent(
      ctx.actor,
      orderPayloadFromEnvelope(
        cancelEvents[cancelEvents.length - 1]!.envelope,
        ctx.actor.organizationId,
      ),
    );
    expect(releaseMovements[0]?.type).toBe("release");

    const afterRelease = await ctx.inventory.service.getItem(
      ctx.actor.organizationId,
      item.catalogItemId,
    );
    expect(afterRelease?.reserved).toBe(0);
    expect(afterRelease?.available).toBe(20);
  });

  it("rejects reservation when insufficient stock", async () => {
    const ctx = await bootStack("short@example.com");
    const customer = await ctx.parties.service.createIndividual(ctx.actor, {
      displayName: "Buyer",
      roleKeys: ["customer"],
    });
    const item = await ctx.catalog.service.createItem(ctx.actor, {
      code: "INV-300",
      name: "Widget 3",
      traits: ["goods"],
      status: "active",
      stockable: true,
      listPrice: { currency: "USD", amountMinor: 100 },
    });
    await ctx.inventory.service.receiveStock(ctx.actor, {
      sku: item.catalogItemId,
      quantity: 2,
    });

    const draft = await ctx.orders.service.createOrder(ctx.actor, {
      customerPartyId: customer.partyId,
    });
    await ctx.orders.service.addLine(ctx.actor, {
      orderId: draft.orderId,
      catalogItemId: item.catalogItemId,
      quantity: 5,
    });
    await ctx.orders.service.commitOrder(ctx.actor, draft.orderId);

    const commitEvents = await ctx.outboxStore.query({
      type: OrdersEventTypes.OrderCommitted,
    });
    await expect(
      ctx.inventory.service.consumeOrderEvent(
        ctx.actor,
        orderPayloadFromEnvelope(
          commitEvents[commitEvents.length - 1]!.envelope,
          ctx.actor.organizationId,
        ),
      ),
    ).rejects.toBeInstanceOf(InsufficientStockError);
  });

  it("idempotent order event consumption", async () => {
    const ctx = await bootStack("idem@example.com");
    const payload = {
      eventId: "order-evt-idem",
      eventType: OrdersEventTypes.OrderCommitted,
      eventVersion: 1,
      occurredAt: "2026-07-15T00:00:00.000Z",
      organizationId: ctx.actor.organizationId,
      orderId: "ord-1",
      lineSummaries: [
        {
          orderLineId: "l1",
          catalogItemId: "sku-idem",
          quantity: 3,
          fulfilledQuantity: 0,
          stockable: true,
        },
      ],
    };
    await ctx.inventory.service.receiveStock(ctx.actor, {
      sku: "sku-idem",
      quantity: 10,
    });
    const first = await ctx.inventory.service.consumeOrderEvent(
      ctx.actor,
      payload,
    );
    const second = await ctx.inventory.service.consumeOrderEvent(
      ctx.actor,
      payload,
    );
    expect(second[0]?.movementId).toBe(first[0]?.movementId);
    const movements = await ctx.inventory.service.findMovements(ctx.actor, {
      sourceEventId: payload.eventId,
    });
    expect(movements.filter((m) => m.type === "reserve")).toHaveLength(1);
  });

  it("adjustStock respects reserved floor", async () => {
    const ctx = await bootStack("adjust@example.com");
    await ctx.inventory.service.receiveStock(ctx.actor, {
      sku: "adj-sku",
      quantity: 10,
    });
    await ctx.inventory.service.consumeOrderEvent(ctx.actor, {
      eventId: "adj-reserve",
      eventType: OrdersEventTypes.OrderCommitted,
      occurredAt: "2026-07-15T00:00:00.000Z",
      organizationId: ctx.actor.organizationId,
      orderId: "o1",
      lines: [{ sku: "adj-sku", quantity: 8 }],
    });
    await expect(
      ctx.inventory.service.adjustStock(ctx.actor, {
        sku: "adj-sku",
        delta: -5,
      }),
    ).rejects.toThrow();
    const adjusted = await ctx.inventory.service.adjustStock(ctx.actor, {
      sku: "adj-sku",
      delta: -2,
    });
    expect(adjusted.item.onHand).toBe(8);
    expect(adjusted.item.reserved).toBe(8);
    expect(adjusted.item.available).toBe(0);
  });
});
