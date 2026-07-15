import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createIdentityKernel } from "@nbcp/identity";
import { createTenancyKernel } from "@nbcp/tenancy";
import { createRbacKernel } from "@nbcp/rbac";
import { createLedgerKernel } from "../src/application/create-ledger-kernel.js";
import {
  LedgerEventTypes,
  LEDGER_EVENT_TYPE_SET,
} from "../src/domain/events.js";
import { CONSUMED_PAYMENT_EVENT_TYPES } from "../src/domain/posting-rules.js";

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

describe("architecture: @nbcp/ledger", () => {
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
      "@nbcp/reporting",
      "@nbcp/catalog",
      "@nbcp/parties",
    ]) {
      expect(deps.includes(forbidden)).toBe(false);
    }
  });

  it("source does not import forbidden modules or deep internals", () => {
    const forbidden =
      /from\s+["']@nbcp\/(orders|payments|inventory|reporting)|from\s+["']@nbcp\/(identity|tenancy|rbac|audit)\/(?![$"])|from\s+["'][^"']*(orders|payments|inventory|reporting)\/src\//;
    for (const file of listTsFiles(join(packageRoot, "src"))) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(forbidden);
    }
  });

  it("consumeFinancialEvent writes ledger outbox with organization ownership", async () => {
    const identity = createIdentityKernel();
    const { user, verificationToken } =
      await identity.service.registerLocalUser({
        email: "arch-ledger@example.com",
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
      name: "ArchLedger",
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
    const ledger = createLedgerKernel({
      tenancy: tenancy.service,
      rbac: rbac.service,
      outboxStore,
    });
    const actor = {
      principalId: user.principalId,
      organizationId: org.organizationId,
    };
    const journal = await ledger.service.consumeFinancialEvent(actor, {
      eventId: "arch-evt-1",
      eventType: CONSUMED_PAYMENT_EVENT_TYPES.PaymentCaptured,
      eventVersion: 1,
      occurredAt: "2026-07-15T00:00:00.000Z",
      organizationId: org.organizationId,
      paymentId: "pay-arch",
      orderId: "ord-arch",
      amount: 500,
      currency: "USD",
    });
    const rows = await outboxStore.query({
      type: LedgerEventTypes.JournalPosted,
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]?.envelope.organizationId).toBe(org.organizationId);
    expect(rows[0]?.envelope.producer).toBe("ledger");
    expect(rows[0]?.envelope.payload.journalId).toBe(journal.journalId);
  });

  it("event types are ledger prefixes", () => {
    for (const t of LEDGER_EVENT_TYPE_SET) {
      expect(t.startsWith("ledger.")).toBe(true);
    }
  });
});
