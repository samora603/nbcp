import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { AUDIT_EVENT_TYPE_SET } from "../src/domain/events.js";
import { KERNEL_SECURITY_EVENT_TYPES } from "../src/application/event-classification.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
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

function readPkg(relative: string) {
  return JSON.parse(
    readFileSync(join(repoRoot, relative), "utf8"),
  ) as {
    dependencies?: Record<string, string>;
    name?: string;
  };
}

describe("architecture: @nbcp/audit", () => {
  it("Identity/Tenancy/RBAC do not depend on Audit (DAG)", () => {
    for (const path of [
      "modules/identity/package.json",
      "modules/tenancy/package.json",
      "modules/rbac/package.json",
    ]) {
      const pkg = readPkg(path);
      expect(pkg.dependencies?.["@nbcp/audit"]).toBeUndefined();
    }
  });

  it("producer module sources do not import Audit", () => {
    const forbidden = /from\s+["']@nbcp\/audit|from\s+["'][^"']*modules\/audit/;
    for (const mod of ["identity", "tenancy", "rbac"]) {
      for (const file of listTsFiles(join(repoRoot, "modules", mod, "src"))) {
        const text = readFileSync(file, "utf8");
        expect(text, file).not.toMatch(forbidden);
      }
    }
  });

  it("Audit may depend on kernel facades + outbox only among modules", () => {
    const pkg = readPkg("modules/audit/package.json");
    expect(pkg.dependencies?.["@nbcp/outbox"]).toBe("workspace:*");
    expect(pkg.dependencies?.["@nbcp/identity"]).toBe("workspace:*");
    expect(pkg.dependencies?.["@nbcp/tenancy"]).toBe("workspace:*");
    expect(pkg.dependencies?.["@nbcp/rbac"]).toBe("workspace:*");
    for (const name of Object.keys(pkg.dependencies ?? {})) {
      expect(name.startsWith("@nbcp/") || !name.includes("product")).toBe(true);
      expect(["@nbcp/orders", "@nbcp/payments", "@nbcp/ledger"].includes(name)).toBe(
        false,
      );
    }
  });

  it("kernel SECURITY allow-list is non-empty and covers three producers", () => {
    expect(KERNEL_SECURITY_EVENT_TYPES.size).toBeGreaterThan(10);
    expect(KERNEL_SECURITY_EVENT_TYPES.has("identity.user.registered")).toBe(
      true,
    );
    expect(KERNEL_SECURITY_EVENT_TYPES.has("tenancy.organization.created")).toBe(
      true,
    );
    expect(
      KERNEL_SECURITY_EVENT_TYPES.has("rbac.role_assignment.granted"),
    ).toBe(true);
  });

  it("audit owned event types are AUDIT class prefixes", () => {
    for (const t of AUDIT_EVENT_TYPE_SET) {
      expect(t.startsWith("audit.")).toBe(true);
    }
  });

  it("audit source has no product module imports", () => {
    const forbidden =
      /from\s+["']@nbcp\/(orders|payments|ledger|inventory|catalog|parties)/;
    for (const file of listTsFiles(join(packageRoot, "src"))) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(forbidden);
    }
  });
});
