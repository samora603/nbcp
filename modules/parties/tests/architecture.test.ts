import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createIdentityKernel } from "@nbcp/identity";
import { createTenancyKernel } from "@nbcp/tenancy";
import { createRbacKernel } from "@nbcp/rbac";
import { createPartiesKernel } from "../src/application/create-parties-kernel.js";
import { PartiesEventTypes, PARTIES_EVENT_TYPE_SET } from "../src/domain/events.js";

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

describe("architecture: @nbcp/parties", () => {
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
      "@nbcp/catalog",
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
      /from\s+["']@nbcp\/(catalog|orders|payments|ledger|inventory|reporting)|from\s+["']@nbcp\/(identity|tenancy|rbac|audit)\/(?![$"])|from\s+["'][^"']*(identity|tenancy|rbac|audit)\/src\//;
    for (const file of listTsFiles(join(packageRoot, "src"))) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(forbidden);
    }
  });

  it("createIndividual writes outbox in same path", async () => {
    const identity = createIdentityKernel();
    const { user, verificationToken } =
      await identity.service.registerLocalUser({
        email: "arch-parties@example.com",
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
      name: "ArchParties",
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
    await parties.service.createIndividual(
      {
        principalId: user.principalId,
        organizationId: org.organizationId,
      },
      { givenName: "Arch", familyName: "Test", roleKeys: ["customer"] },
    );
    const rows = await outboxStore.query({
      type: PartiesEventTypes.PartyCreated,
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]?.envelope.organizationId).toBe(org.organizationId);
    expect(rows[0]?.envelope.producer).toBe("parties");
  });

  it("event types are catalog parties prefixes", () => {
    for (const t of PARTIES_EVENT_TYPE_SET) {
      expect(t.startsWith("parties.")).toBe(true);
    }
  });
});
