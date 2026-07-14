import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createIdentityKernel } from "@nbcp/identity";
import { createTenancyKernel } from "@nbcp/tenancy";
import { createRbacKernel } from "../src/application/create-rbac-kernel.js";
import { RbacEventTypes, RBAC_EVENT_TYPE_SET } from "../src/domain/events.js";
import { CORE_PERMISSION_SEEDS } from "../src/application/catalog-seeds.js";

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

describe("architecture: @nbcp/rbac", () => {
  it("depends only on identity + tenancy + outbox among modules", () => {
    const pkg = JSON.parse(
      readFileSync(join(packageRoot, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      nbcp?: { moduleDependencies?: string[] };
    };
    expect(pkg.nbcp?.moduleDependencies).toEqual(["identity", "tenancy"]);
    expect(pkg.dependencies?.["@nbcp/outbox"]).toBe("workspace:*");
    expect(pkg.dependencies?.["@nbcp/identity"]).toBe("workspace:*");
    expect(pkg.dependencies?.["@nbcp/tenancy"]).toBe("workspace:*");
    for (const name of Object.keys(pkg.dependencies ?? {})) {
      expect(name === "@nbcp/audit").toBe(false);
    }
  });

  it("source does not import audit or module internals", () => {
    const forbidden =
      /from\s+["']@nbcp\/audit|from\s+["'][^"']*modules\/audit|from\s+["']@nbcp\/identity\/(?![$"])|from\s+["']@nbcp\/tenancy\/(?![$"])|from\s+["'][^"']*(identity|tenancy)\/src\//;
    for (const file of listTsFiles(join(packageRoot, "src"))) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(forbidden);
    }
  });

  it("bootstrap writes assignment granted to outbox", async () => {
    const identity = createIdentityKernel();
    const { user, verificationToken } = await identity.service.registerLocalUser(
      {
        email: "arch-rbac@example.com",
        password: "password1",
      },
    );
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
      name: "ArchRbac",
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
    const rows = await outboxStore.query({
      type: RbacEventTypes.RoleAssignmentGranted,
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[rows.length - 1]?.envelope.producer).toBe("rbac");
  });

  it("event types are catalog rbac prefixes", () => {
    for (const t of RBAC_EVENT_TYPE_SET) {
      expect(t.startsWith("rbac.")).toBe(true);
    }
  });

  it("core seeds do not invent keys outside catalog Core set", () => {
    const allowed = new Set(CORE_PERMISSION_SEEDS.map((s) => s.key));
    expect(allowed.has("tenancy.organization.manage")).toBe(true);
    expect(allowed.has("orders.create")).toBe(false);
  });
});
