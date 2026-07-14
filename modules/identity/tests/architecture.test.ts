import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createIdentityKernel } from "../src/application/create-identity-kernel.js";
import { IDENTITY_EVENT_TYPE_SET } from "../src/domain/events.js";
import { IdentityEventTypes } from "../src/domain/events.js";

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

describe("architecture: @nbcp/identity", () => {
  it("depends only on @nbcp/outbox among workspace packages", () => {
    const pkg = JSON.parse(
      readFileSync(join(packageRoot, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      nbcp?: { moduleDependencies?: string[] };
    };
    expect(pkg.nbcp?.moduleDependencies).toEqual([]);
    expect(pkg.dependencies?.["@nbcp/outbox"]).toBe("workspace:*");
    for (const name of Object.keys(pkg.dependencies ?? {})) {
      expect(
        ["@nbcp/tenancy", "@nbcp/rbac", "@nbcp/audit"].includes(name),
      ).toBe(false);
    }
  });

  it("source does not import tenancy/rbac/audit modules", () => {
    const pattern =
      /from\s+["'][^"']*modules\/(tenancy|rbac|audit)|from\s+["']@nbcp\/(tenancy|rbac|audit)/;
    for (const file of listTsFiles(join(packageRoot, "src"))) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(pattern);
    }
  });

  it("SECURITY register writes outbox in same successful path", async () => {
    const kernel = createIdentityKernel();
    const before = await kernel.outboxStore.countByStatus();
    expect(before.unpublished).toBe(0);
    await kernel.service.registerLocalUser({
      email: "arch@example.com",
      password: "password1",
    });
    const after = await kernel.outboxStore.countByStatus();
    expect(after.unpublished).toBeGreaterThanOrEqual(1);
    const row = (await kernel.outboxStore.query({
      type: IdentityEventTypes.UserRegistered,
    }))[0];
    expect(row?.envelope.producer).toBe("identity");
  });

  it("emitted event types are catalog Identity types", () => {
    for (const t of IDENTITY_EVENT_TYPE_SET) {
      expect(t.startsWith("identity.")).toBe(true);
    }
  });
});
