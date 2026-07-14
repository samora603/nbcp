import { describe, expect, it } from "vitest";
import { createIdentityKernel } from "@nbcp/identity";
import { createTenancyKernel } from "@nbcp/tenancy";
import { createRbacKernel } from "@nbcp/rbac";
import { createPartiesKernel } from "@nbcp/parties";
import { createCatalogKernel } from "@nbcp/catalog";
import { createOrdersKernel } from "../src/application/create-orders-kernel.js";
import { OrdersEventTypes } from "../src/domain/events.js";
import { OrdersPermissions } from "../src/application/permissions.js";
import {
  AuthorizationError,
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

async function bootOrders(email: string) {
  const identity = createIdentityKernel();
  const owner = await registerVerified(identity.service, email);
  const outboxStore = identity.outboxStore;
  const tenancy = createTenancyKernel({
    identity: identity.service,
    outboxStore,
  });
  const org = await tenancy.service.createOrganization({
    name: "OrdersCo",
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
  const actor = {
    principalId: owner.principalId,
    organizationId: org.organizationId,
  };
  return {
    identity,
    tenancy,
    rbac,
    parties,
    catalog,
    orders,
    owner,
    org,
    actor,
    outboxStore,
  };
}

describe("orders integration", () => {
  it("draft → commit → fulfill with ADR-0007 intents", async () => {
    const { parties, catalog, orders, actor, outboxStore } = await bootOrders(
      "flow@example.com",
    );
    const customer = await parties.service.createIndividual(actor, {
      displayName: "Buyer",
      roleKeys: ["customer"],
    });
    const item = await catalog.service.createItem(actor, {
      code: "SKU-100",
      name: "SKU 100",
      traits: ["goods"],
      status: "active",
      listPrice: { currency: "USD", amountMinor: 1500 },
    });

    const draft = await orders.service.createOrder(actor, {
      customerPartyId: customer.partyId,
    });
    expect(draft.status).toBe("draft");

    const withLine = await orders.service.addLine(actor, {
      orderId: draft.orderId,
      catalogItemId: item.catalogItemId,
      quantity: 2,
    });
    expect(withLine.lines).toHaveLength(1);
    expect(withLine.totals.amountMinor).toBe(3000);

    const committed = await orders.service.commitOrder(actor, draft.orderId);
    expect(committed.status).toBe("committed");
    expect(committed.lines[0]?.snapshot?.unitPrice.amountMinor).toBe(1500);

    const commitEvents = await outboxStore.query({
      type: OrdersEventTypes.OrderCommitted,
    });
    expect(commitEvents.length).toBeGreaterThanOrEqual(1);
    const commitPayload = commitEvents[commitEvents.length - 1]!.envelope
      .payload;
    expect(commitPayload.inventoryIntent).toBe("reserve");
    expect(commitPayload.organizationId).toBe(actor.organizationId);
    expect(Array.isArray(commitPayload.lineSummaries)).toBe(true);

    await catalog.service.setListPrice(actor, {
      catalogItemId: item.catalogItemId,
      money: { currency: "USD", amountMinor: 9999 },
    });
    const afterPriceChange = await orders.service.getOrder(
      actor.organizationId,
      draft.orderId,
    );
    expect(afterPriceChange?.lines[0]?.snapshot?.unitPrice.amountMinor).toBe(
      1500,
    );

    const fulfilled = await orders.service.fulfillOrder(actor, draft.orderId);
    expect(fulfilled.status).toBe("fulfilled");
    const fulfillEvents = await outboxStore.query({
      type: OrdersEventTypes.OrderFulfilled,
    });
    expect(
      fulfillEvents[fulfillEvents.length - 1]?.envelope.payload.inventoryIntent,
    ).toBe("issue");
  });

  it("cancel committed emits release intent", async () => {
    const { parties, catalog, orders, actor, outboxStore } = await bootOrders(
      "cancel@example.com",
    );
    const customer = await parties.service.createIndividual(actor, {
      displayName: "Buyer",
      roleKeys: ["customer"],
    });
    const item = await catalog.service.createItem(actor, {
      code: "SKU-200",
      name: "SKU 200",
      traits: ["service"],
      status: "active",
      listPrice: { currency: "USD", amountMinor: 5000 },
    });
    const order = await orders.service.createOrder(actor, {
      customerPartyId: customer.partyId,
    });
    await orders.service.addLine(actor, {
      orderId: order.orderId,
      catalogItemId: item.catalogItemId,
      quantity: 1,
    });
    await orders.service.commitOrder(actor, order.orderId);
    const cancelled = await orders.service.cancelOrder(actor, {
      orderId: order.orderId,
      reason: "customer_request",
    });
    expect(cancelled.status).toBe("cancelled");
    const events = await outboxStore.query({
      type: OrdersEventTypes.OrderCancelled,
    });
    expect(events[events.length - 1]?.envelope.payload.inventoryIntent).toBe(
      "release",
    );
  });

  it("partial fulfill then complete", async () => {
    const { parties, catalog, orders, actor } = await bootOrders(
      "partial@example.com",
    );
    const customer = await parties.service.createIndividual(actor, {
      displayName: "Buyer",
      roleKeys: ["customer"],
    });
    const item = await catalog.service.createItem(actor, {
      code: "SKU-300",
      name: "SKU 300",
      traits: ["goods"],
      status: "active",
      listPrice: { currency: "USD", amountMinor: 1000 },
    });
    const order = await orders.service.createOrder(actor, {
      customerPartyId: customer.partyId,
    });
    const withLine = await orders.service.addLine(actor, {
      orderId: order.orderId,
      catalogItemId: item.catalogItemId,
      quantity: 4,
    });
    await orders.service.commitOrder(actor, order.orderId);
    const partial = await orders.service.fulfillLines(actor, {
      orderId: order.orderId,
      lines: [
        {
          orderLineId: withLine.lines[0]!.orderLineId,
          quantity: 1,
        },
      ],
    });
    expect(partial.status).toBe("partially_fulfilled");
    expect(partial.lines[0]?.fulfilledQuantity).toBe(1);

    const done = await orders.service.fulfillOrder(actor, order.orderId);
    expect(done.status).toBe("fulfilled");
    expect(done.lines[0]?.fulfilledQuantity).toBe(4);
  });

  it("rejects invalid transitions and RBAC denials", async () => {
    const { identity, tenancy, rbac, parties, catalog, orders, org, actor } =
      await bootOrders("deny@example.com");
    const customer = await parties.service.createIndividual(actor, {
      displayName: "Buyer",
      roleKeys: ["customer"],
    });
    const item = await catalog.service.createItem(actor, {
      code: "SKU-400",
      name: "SKU 400",
      traits: ["goods"],
      status: "active",
      listPrice: { currency: "USD", amountMinor: 100 },
    });
    const order = await orders.service.createOrder(actor, {
      customerPartyId: customer.partyId,
    });
    await expect(
      orders.service.fulfillOrder(actor, order.orderId),
    ).rejects.toBeInstanceOf(ValidationError);

    await orders.service.addLine(actor, {
      orderId: order.orderId,
      catalogItemId: item.catalogItemId,
      quantity: 1,
    });
    await orders.service.commitOrder(actor, order.orderId);
    await orders.service.fulfillOrder(actor, order.orderId);
    await expect(
      orders.service.cancelOrder(actor, { orderId: order.orderId }),
    ).rejects.toBeInstanceOf(ValidationError);

    const other = await registerVerified(
      identity.service,
      "other-orders@example.com",
    );
    await tenancy.service.addMembership({
      organizationId: org.organizationId,
      principalId: other.principalId,
    });
    await expect(
      orders.service.createOrder(
        {
          principalId: other.principalId,
          organizationId: org.organizationId,
        },
        { customerPartyId: customer.partyId },
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);

    const allowed = await rbac.service.authorize({
      principalId: other.principalId,
      permissionKey: OrdersPermissions.OrderManage,
      organizationId: org.organizationId,
    });
    expect(allowed.allowed).toBe(false);
  });

  it("enforces tenant isolation", async () => {
    const a = await bootOrders("iso-a@example.com");
    const b = await bootOrders("iso-b@example.com");
    const customer = await a.parties.service.createIndividual(a.actor, {
      displayName: "A Customer",
      roleKeys: ["customer"],
    });
    const order = await a.orders.service.createOrder(a.actor, {
      customerPartyId: customer.partyId,
    });
    const cross = await b.orders.service.getOrder(
      b.actor.organizationId,
      order.orderId,
    );
    expect(cross).toBeNull();
  });
});
