import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createIdentityKernel } from "@nbcp/identity";
import { createTenancyKernel } from "@nbcp/tenancy";
import { createRbacKernel } from "@nbcp/rbac";
import { createReportingKernel } from "../src/application/create-reporting-kernel.js";
import { OrdersEventTypes } from "@nbcp/orders";

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

describe("architecture: @nbcp/reporting", () => {
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
      "@nbcp/inventory",
      "@nbcp/ledger",
      "@nbcp/catalog",
      "@nbcp/parties",
    ]) {
      expect(deps.includes(forbidden)).toBe(false);
    }
  });

  it("source does not import forbidden SoR modules", () => {
    const forbidden =
      /from\s+["']@nbcp\/(orders|payments|inventory|ledger|catalog|parties)|from\s+["'][^"']*(orders|payments|inventory|ledger|catalog)\/src\//;
    for (const file of listTsFiles(join(packageRoot, "src"))) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(forbidden);
    }
  });

  it("consumeEvent is read-only projection (no outbox writer in runtime)", async () => {
    const identity = createIdentityKernel();
    const { user, verificationToken } =
      await identity.service.registerLocalUser({
        email: "arch-rpt@example.com",
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
      name: "ArchReport",
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
    const reporting = createReportingKernel({
      tenancy: tenancy.service,
      rbac: rbac.service,
    });
    const actor = {
      principalId: user.principalId,
      organizationId: org.organizationId,
    };
    const beforeCount = (await outboxStore.query({})).length;
    await reporting.service.consumeEvent(actor, {
      eventId: "arch-evt",
      eventType: OrdersEventTypes.OrderCommitted,
      occurredAt: "2026-07-15T00:00:00.000Z",
      organizationId: org.organizationId,
      payload: {
        orderId: "o-arch",
        customerPartyId: "c1",
        status: "committed",
        totals: { currency: "USD", amountMinor: 100 },
      },
    });
    const afterCount = (await outboxStore.query({})).length;
    expect(afterCount).toBe(beforeCount);
    const fact = await reporting.store.getOrderFact(
      org.organizationId,
      "o-arch",
    );
    expect(fact?.status).toBe("committed");
  });
});
