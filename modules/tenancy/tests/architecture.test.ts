import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createIdentityKernel } from "@nbcp/identity";
import { createTenancyKernel } from "../src/application/create-tenancy-kernel.js";
import { TenancyEventTypes } from "../src/domain/events.js";
import { TENANCY_EVENT_TYPE_SET } from "../src/domain/events.js";

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

describe("architecture: @nbcp/tenancy", () => {
  it("depends only on identity + outbox among modules", () => {
    const pkg = JSON.parse(
      readFileSync(join(packageRoot, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      nbcp?: { moduleDependencies?: string[] };
    };
    expect(pkg.nbcp?.moduleDependencies).toEqual(["identity"]);
    expect(pkg.dependencies?.["@nbcp/outbox"]).toBe("workspace:*");
    expect(pkg.dependencies?.["@nbcp/identity"]).toBe("workspace:*");
    for (const name of Object.keys(pkg.dependencies ?? {})) {
      expect(["@nbcp/rbac", "@nbcp/audit"].includes(name)).toBe(false);
    }
  });

  it("source does not import rbac/audit or identity internals", () => {
    const forbidden =
      /from\s+["']@nbcp\/(rbac|audit)|from\s+["'][^"']*modules\/(rbac|audit)|from\s+["']@nbcp\/identity\/(?![$"])|from\s+["'][^"']*identity\/src\//;
    for (const file of listTsFiles(join(packageRoot, "src"))) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(forbidden);
    }
  });

  it("createOrganization writes outbox in same successful path", async () => {
    const identity = createIdentityKernel();
    const { user, verificationToken } = await identity.service.registerLocalUser({
      email: "arch-tenancy@example.com",
      password: "password1",
    });
    await identity.service.verifyEmail({
      principalId: user.principalId,
      token: verificationToken,
    });
    const tenancy = createTenancyKernel({ identity: identity.service });
    await tenancy.service.createOrganization({
      name: "Arch",
      ownerPrincipalId: user.principalId,
    });
    const rows = await tenancy.outboxStore.query({
      type: TenancyEventTypes.OrganizationCreated,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("unpublished");
  });

  it("event types are catalog tenancy prefixes", () => {
    for (const t of TENANCY_EVENT_TYPE_SET) {
      expect(t.startsWith("tenancy.")).toBe(true);
    }
  });
});
