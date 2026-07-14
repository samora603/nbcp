import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createOutboxTestHarness, assertSameUnitOfWorkCoupling } from "../src/testing/harness.js";

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

describe("architecture: @nbcp/outbox isolation", () => {
  it("package.json does not depend on modules/*", () => {
    const pkg = JSON.parse(
      readFileSync(join(packageRoot, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      nbcp?: { forbidsModuleImports?: boolean };
    };
    expect(pkg.nbcp?.forbidsModuleImports).toBe(true);
    const deps = {
      ...pkg.dependencies,
      ...pkg.peerDependencies,
    };
    for (const name of Object.keys(deps)) {
      expect(
        ["@nbcp/identity", "@nbcp/tenancy", "@nbcp/rbac", "@nbcp/audit"].includes(
          name,
        ),
      ).toBe(false);
    }
  });

  it("source does not import modules/* paths", () => {
    const srcFiles = listTsFiles(join(packageRoot, "src"));
    const pattern =
      /from\s+["'][^"']*modules\/|from\s+["']@nbcp\/(identity|tenancy|rbac|audit)/;
    for (const file of srcFiles) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(pattern);
    }
  });

  it("provides same-UoW coupling helper for WP-02", async () => {
    const harness = createOutboxTestHarness();
    await expect(assertSameUnitOfWorkCoupling(harness)).resolves.toBeUndefined();
  });
});
