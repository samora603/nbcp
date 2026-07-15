import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createIdentityKernel } from "@nbcp/identity";
import { createTenancyKernel } from "@nbcp/tenancy";
import { createRbacKernel } from "@nbcp/rbac";
import { createInventoryKernel } from "../src/application/create-inventory-kernel.js";
import {
  InventoryEventTypes,
  INVENTORY_EVENT_TYPE_SET,
  CONSUMED_ORDER_EVENT_TYPES,
} from "../src/domain/events.js";
import { ImmutableMovementError } from "../src/domain/errors.js";
import { InMemoryUnitOfWorkFactory } from "@nbcp/outbox";

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

describe("architecture: @nbcp/inventory", () => {
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
    ]);
    for (const d of deps) {
      expect(allowed.has(d)).toBe(true);
    }
    for (const forbidden of [
      "@nbcp/orders",
      "@nbcp/payments",
      "@nbcp/ledger",
      "@nbcp/reporting",
      "@nbcp/catalog",
      "@nbcp/parties",
    ]) {
      expect(deps.includes(forbidden)).toBe(false);
    }
  });

  it("source does not import forbidden modules", () => {
    const forbidden =
      /from\s+["']@nbcp\/(orders|payments|ledger|reporting)|from\s+["'][^"']*(orders|payments|ledger|reporting)\/src\//;
    for (const file of listTsFiles(join(packageRoot, "src"))) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(forbidden);
    }
  });

  it("consumeOrderEvent publishes inventory events with org ownership", async () => {
    const identity = createIdentityKernel();
    const { user, verificationToken } =
      await identity.service.registerLocalUser({
        email: "arch-inv@example.com",
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
      name: "ArchInv",
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
    const inventory = createInventoryKernel({
      tenancy: tenancy.service,
      rbac: rbac.service,
      outboxStore,
    });
    const actor = {
      principalId: user.principalId,
      organizationId: org.organizationId,
    };
    await inventory.service.receiveStock(actor, { sku: "ARCH-SKU", quantity: 5 });
    await inventory.service.consumeOrderEvent(actor, {
      eventId: "arch-order-evt",
      eventType: CONSUMED_ORDER_EVENT_TYPES.OrderCommitted,
      occurredAt: "2026-07-15T00:00:00.000Z",
      organizationId: org.organizationId,
      orderId: "ord-arch",
      lines: [{ sku: "ARCH-SKU", quantity: 2 }],
    });
    const rows = await outboxStore.query({
      type: InventoryEventTypes.StockReserved,
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]?.envelope.organizationId).toBe(org.organizationId);
    expect(rows[0]?.envelope.producer).toBe("inventory");
    expect(rows[0]?.envelope.payload.movementId).toBeDefined();
  });

  it("movement history is append-only", async () => {
    const movement = {
      movementId: "m1",
      organizationId: "org",
      sku: "S",
      type: "receipt" as const,
      quantity: 1,
      sourceEventId: "e1",
      sourceEventType: "test",
      occurredAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const { InMemoryMovementRepository } = await import(
      "../src/infrastructure/in-memory-store.js"
    );
    const repo = new InMemoryMovementRepository();
    const uowFactory = new InMemoryUnitOfWorkFactory({
      store: new (await import("@nbcp/outbox")).InMemoryOutboxStore(),
    });
    const uow = uowFactory.start();
    await repo.append(uow, movement);
    await uow.commit();
    const uow2 = uowFactory.start();
    await expect(repo.append(uow2, movement)).rejects.toBeInstanceOf(
      ImmutableMovementError,
    );
  });

  it("event types are inventory prefixes", () => {
    for (const t of INVENTORY_EVENT_TYPE_SET) {
      expect(t.startsWith("inventory.")).toBe(true);
    }
  });
});
