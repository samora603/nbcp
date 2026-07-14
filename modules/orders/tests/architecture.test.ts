import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createIdentityKernel } from "@nbcp/identity";
import { createTenancyKernel } from "@nbcp/tenancy";
import { createRbacKernel } from "@nbcp/rbac";
import { createPartiesKernel } from "@nbcp/parties";
import { createCatalogKernel } from "@nbcp/catalog";
import { createOrdersKernel } from "../src/application/create-orders-kernel.js";
import {
  OrdersEventTypes,
  ORDERS_EVENT_TYPE_SET,
} from "../src/domain/events.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...listTsFiles(full));
    } else if (name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("architecture: @nbcp/orders", () => {
  it("depends on allow-listed modules only", () => {
    const pkg = JSON.parse(
      readFileSync(join(packageRoot, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    const deps = Object.keys(pkg.dependencies ?? {});
    const allowed = new Set([
      "@nbcp/outbox",
      "@nbcp/identity",
      "@nbcp/tenancy",
      "@nbcp/rbac",
      "@nbcp/audit",
      "@nbcp/parties",
      "@nbcp/catalog",
    ]);
    for (const d of deps) {
      expect(allowed.has(d)).toBe(true);
    }
    for (const forbidden of [
      "@nbcp/payments",
      "@nbcp/ledger",
      "@nbcp/inventory",
      "@nbcp/reporting",
    ]) {
      expect(deps.includes(forbidden)).toBe(false);
    }
  });

  it("source does not import forbidden modules or deep internals", () => {
    const forbidden =
      /from\s+["']@nbcp\/(payments|ledger|inventory|reporting)|from\s+["']@nbcp\/(identity|tenancy|rbac|audit|parties|catalog)\/(?![$"])|from\s+["'][^"']*(identity|tenancy|rbac|audit|parties|catalog)\/src\//;
    for (const file of listTsFiles(join(packageRoot, "src"))) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(forbidden);
    }
  });

  it("commit writes outbox with organization ownership", async () => {
    const identity = createIdentityKernel();
    const { user, verificationToken } =
      await identity.service.registerLocalUser({
        email: "arch-orders@example.com",
        password: "password1",
      });
    await identity.service.verifyEmail({
      principalId: user.principalId,
      token: verificationToken,
    });
    const outboxStore = identity.outboxStore;
    const tenancy = createTenancyKernel({
      identity: identity.service,
      outboxStore,
    });
    const org = await tenancy.service.createOrganization({
      name: "ArchOrders",
      ownerPrincipalId: user.principalId,
    });
    const rbac = createRbacKernel({
      identity: identity.service,
      tenancy: tenancy.service,
      outboxStore,
    });
    await rbac.ready;
    await rbac.service.bootstrapOrganizationAdministrator({
      organizationId: org.organizationId,
      ownerPrincipalId: user.principalId,
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
      principalId: user.principalId,
      organizationId: org.organizationId,
    };
    const customer = await parties.service.createIndividual(actor, {
      displayName: "Arch Customer",
      roleKeys: ["customer"],
    });
    const item = await catalog.service.createItem(actor, {
      code: "ARCH-SKU",
      name: "Arch SKU",
      traits: ["goods"],
      status: "active",
      listPrice: { currency: "USD", amountMinor: 100 },
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
    const rows = await outboxStore.query({
      type: OrdersEventTypes.OrderCommitted,
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]?.envelope.organizationId).toBe(org.organizationId);
    expect(rows[0]?.envelope.producer).toBe("orders");
    expect(rows[0]?.envelope.payload.inventoryIntent).toBe("reserve");
  });

  it("event types are orders prefixes", () => {
    for (const t of ORDERS_EVENT_TYPE_SET) {
      expect(t.startsWith("orders.")).toBe(true);
    }
  });
});
