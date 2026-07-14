import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createIdentityKernel } from "@nbcp/identity";
import { createTenancyKernel } from "@nbcp/tenancy";
import { createRbacKernel } from "@nbcp/rbac";
import { createPartiesKernel } from "@nbcp/parties";
import {
  InMemoryUnitOfWorkFactory,
  OutboxWriter,
} from "@nbcp/outbox";
import { createCatalogKernel } from "../src/application/create-catalog-kernel.js";
import { CatalogEventTypes } from "../src/domain/events.js";
import { CatalogPermissions } from "../src/application/permissions.js";
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

async function bootCatalog(email: string) {
  const identity = createIdentityKernel();
  const owner = await registerVerified(identity.service, email);
  const outboxStore = identity.outboxStore;
  const tenancy = createTenancyKernel({
    identity: identity.service,
    outboxStore,
  });
  const org = await tenancy.service.createOrganization({
    name: "CatalogCo",
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
    owner,
    org,
    actor,
    outboxStore,
  };
}

describe("catalog integration", () => {
  it("creates goods and service offerings with prices and events", async () => {
    const { catalog, actor, outboxStore } = await bootCatalog(
      "goods@example.com",
    );
    const goods = await catalog.service.createItem(actor, {
      code: "WIDGET-01",
      name: "Widget",
      traits: ["goods"],
      status: "active",
      listPrice: { currency: "USD", amountMinor: 2500 },
    });
    expect(goods.traits).toContain("goods");
    expect(goods.stockable).toBe(true);
    expect(goods.status).toBe("active");

    const service = await catalog.service.createItem(actor, {
      code: "SVC-CONSULT",
      name: "Consultation",
      traits: ["service"],
      status: "active",
      listPrice: { currency: "USD", amountMinor: 15000 },
    });
    expect(service.traits).toContain("service");
    expect(service.stockable).toBe(false);

    const created = await outboxStore.query({
      type: CatalogEventTypes.ItemCreated,
    });
    expect(created.length).toBeGreaterThanOrEqual(2);
    expect(created[0]?.envelope.organizationId).toBe(actor.organizationId);
    expect(created[0]?.envelope.producer).toBe("catalog");

    const priceEvents = await outboxStore.query({
      type: CatalogEventTypes.PriceChanged,
    });
    expect(priceEvents.length).toBeGreaterThanOrEqual(2);
  });

  it("manages variants, availability, and orderability assert", async () => {
    const { catalog, actor, tenancy, org } = await bootCatalog(
      "var@example.com",
    );
    const location = await tenancy.service.addLocation({
      organizationId: org.organizationId,
      name: "Main Store",
      code: "main",
    });
    const item = await catalog.service.createItem(actor, {
      code: "SHIRT-01",
      name: "Shirt",
      traits: ["goods"],
      status: "active",
      listPrice: { currency: "USD", amountMinor: 4000 },
    });
    const withVariant = await catalog.service.addVariant(actor, {
      catalogItemId: item.catalogItemId,
      code: "M",
      name: "Medium",
      options: { size: "M" },
      listPrice: { currency: "USD", amountMinor: 4200 },
    });
    expect(withVariant.variants).toHaveLength(1);

    await catalog.service.setLocationApplicability(actor, {
      catalogItemId: item.catalogItemId,
      locationIds: [location.locationId],
    });

    await catalog.service.assertItemOrderable({
      organizationId: actor.organizationId,
      catalogItemId: item.catalogItemId,
      locationId: location.locationId,
    });

    await expect(
      catalog.service.assertItemOrderable({
        organizationId: actor.organizationId,
        catalogItemId: item.catalogItemId,
        locationId: "other-loc",
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    await catalog.service.inactivateItem(actor, item.catalogItemId);
    await expect(
      catalog.service.assertItemOrderable({
        organizationId: actor.organizationId,
        catalogItemId: item.catalogItemId,
        locationId: location.locationId,
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    await catalog.service.activateItem(actor, item.catalogItemId);
    await catalog.service.deleteItem(actor, item.catalogItemId);
    await expect(
      catalog.service.assertItemOrderable({
        organizationId: actor.organizationId,
        catalogItemId: item.catalogItemId,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("links optional supplier party and enforces tenant isolation", async () => {
    const a = await bootCatalog("sup-a@example.com");
    const supplier = await a.parties.service.createOrganizationParty(a.actor, {
      legalName: "Supply Co",
      roleKeys: ["supplier"],
    });
    const item = await a.catalog.service.createItem(a.actor, {
      code: "PART-9",
      name: "Part",
      traits: ["goods"],
      status: "active",
      supplierPartyId: supplier.partyId,
    });
    expect(item.supplierPartyId).toBe(supplier.partyId);

    const b = await bootCatalog("sup-b@example.com");
    const cross = await b.catalog.service.getItem(
      b.actor.organizationId,
      item.catalogItemId,
    );
    expect(cross).toBeNull();
  });

  it("denies manage without permission", async () => {
    const { identity, tenancy, rbac, catalog, org } = await bootCatalog(
      "deny-cat@example.com",
    );
    const other = await registerVerified(
      identity.service,
      "other-cat@example.com",
    );
    await tenancy.service.addMembership({
      organizationId: org.organizationId,
      principalId: other.principalId,
    });
    await expect(
      catalog.service.createItem(
        {
          principalId: other.principalId,
          organizationId: org.organizationId,
        },
        {
          code: "X",
          name: "Nope",
          traits: ["goods"],
        },
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);

    const allowed = await rbac.service.authorize({
      principalId: other.principalId,
      permissionKey: CatalogPermissions.ItemManage,
      organizationId: org.organizationId,
    });
    expect(allowed.allowed).toBe(false);
  });

  it("rolls back staged item when UoW does not commit", async () => {
    const { catalog, actor, outboxStore } = await bootCatalog(
      "rollback@example.com",
    );
    const before = (await outboxStore.query({})).length;
    const factory = new InMemoryUnitOfWorkFactory({ store: outboxStore });
    const writer = new OutboxWriter();
    const pending = factory.start();
    await catalog.items.save(pending, {
      catalogItemId: "rollback-item",
      organizationId: actor.organizationId,
      code: "RB-1",
      name: "Rollback",
      description: null,
      traits: ["goods"],
      status: "draft",
      orderable: false,
      stockable: true,
      taxCategoryId: null,
      supplierPartyId: null,
      locationIds: [],
      variants: [],
      prices: [],
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });
    writer.append(pending, {
      eventId: randomUUID(),
      type: CatalogEventTypes.ItemCreated,
      version: 1,
      occurredAt: new Date().toISOString(),
      producer: "catalog",
      organizationId: actor.organizationId,
      correlationId: null,
      payload: { catalogItemId: "rollback-item" },
    });
    await pending.rollback();

    expect(
      await catalog.items.findById(actor.organizationId, "rollback-item"),
    ).toBeNull();
    expect((await outboxStore.query({})).length).toBe(before);
  });
});
