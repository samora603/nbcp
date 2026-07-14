import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createIdentityKernel } from "@nbcp/identity";
import { createTenancyKernel } from "@nbcp/tenancy";
import { createRbacKernel } from "@nbcp/rbac";
import { createCatalogKernel } from "../src/application/create-catalog-kernel.js";
import {
  CatalogEventTypes,
  CATALOG_EVENT_TYPE_SET,
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

describe("architecture: @nbcp/catalog", () => {
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
    ]);
    for (const d of deps) {
      expect(allowed.has(d)).toBe(true);
    }
    for (const forbidden of [
      "@nbcp/orders",
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
      /from\s+["']@nbcp\/(orders|payments|ledger|inventory|reporting)|from\s+["']@nbcp\/(identity|tenancy|rbac|audit|parties)\/(?![$"])|from\s+["'][^"']*(identity|tenancy|rbac|audit|parties)\/src\//;
    for (const file of listTsFiles(join(packageRoot, "src"))) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(forbidden);
    }
  });

  it("createItem writes outbox in same path", async () => {
    const identity = createIdentityKernel();
    const { user, verificationToken } =
      await identity.service.registerLocalUser({
        email: "arch-catalog@example.com",
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
      name: "ArchCatalog",
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
    const catalog = createCatalogKernel({
      tenancy: tenancy.service,
      rbac: rbac.service,
      outboxStore,
    });
    await catalog.service.createItem(
      {
        principalId: user.principalId,
        organizationId: org.organizationId,
      },
      {
        code: "ARCH-1",
        name: "Arch Item",
        traits: ["goods"],
        status: "active",
      },
    );
    const rows = await outboxStore.query({
      type: CatalogEventTypes.ItemCreated,
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]?.envelope.organizationId).toBe(org.organizationId);
    expect(rows[0]?.envelope.producer).toBe("catalog");
  });

  it("event types are catalog prefixes", () => {
    for (const t of CATALOG_EVENT_TYPE_SET) {
      expect(t.startsWith("catalog.")).toBe(true);
    }
  });
});
