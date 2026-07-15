import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createIdentityKernel } from "@nbcp/identity";
import { createTenancyKernel } from "@nbcp/tenancy";
import { createRbacKernel } from "@nbcp/rbac";
import { createPartiesKernel } from "@nbcp/parties";
import { createCatalogKernel } from "@nbcp/catalog";
import { createOrdersKernel } from "@nbcp/orders";
import { createPaymentsKernel } from "../src/application/create-payments-kernel.js";
import {
  PaymentsEventTypes,
  PAYMENTS_EVENT_TYPE_SET,
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

describe("architecture: @nbcp/payments", () => {
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
      "@nbcp/orders",
    ]);
    for (const d of deps) {
      expect(allowed.has(d)).toBe(true);
    }
    for (const forbidden of [
      "@nbcp/ledger",
      "@nbcp/inventory",
      "@nbcp/reporting",
      "@nbcp/catalog",
      "@nbcp/parties",
    ]) {
      expect(deps.includes(forbidden)).toBe(false);
    }
  });

  it("source does not import forbidden modules or deep internals", () => {
    const forbidden =
      /from\s+["']@nbcp\/(ledger|inventory|reporting)|from\s+["']@nbcp\/(identity|tenancy|rbac|audit|orders)\/(?![$"])|from\s+["'][^"']*(ledger|inventory|reporting)\/src\//;
    for (const file of listTsFiles(join(packageRoot, "src"))) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(forbidden);
    }
  });

  it("create writes outbox with organization ownership", async () => {
    const identity = createIdentityKernel();
    const { user, verificationToken } =
      await identity.service.registerLocalUser({
        email: "arch-payments@example.com",
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
      name: "ArchPayments",
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
    const payments = createPaymentsKernel({
      tenancy: tenancy.service,
      rbac: rbac.service,
      orders: orders.service,
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
      code: "ARCH-PAY",
      name: "Arch Pay",
      traits: ["goods"],
      status: "active",
      listPrice: { currency: "USD", amountMinor: 500 },
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
    const payment = await payments.service.createPayment(actor, {
      orderId: order.orderId,
      amount: { currency: "USD", amountMinor: 500 },
      provider: "manual",
    });
    const rows = await outboxStore.query({
      type: PaymentsEventTypes.Created,
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]?.envelope.organizationId).toBe(org.organizationId);
    expect(rows[0]?.envelope.producer).toBe("payments");
    expect(rows[0]?.envelope.payload.paymentId).toBe(payment.paymentId);
    expect(rows[0]?.envelope.payload.eventType).toBe(
      PaymentsEventTypes.Created,
    );
  });

  it("event types are payments prefixes", () => {
    for (const t of PAYMENTS_EVENT_TYPE_SET) {
      expect(t.startsWith("payments.")).toBe(true);
    }
  });
});
