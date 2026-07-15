import { readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { loadPermissionCatalog } from "./parse-permission-catalog.js";
import { PERMISSION_KEY_PATTERN } from "./policy.js";
import type { CheckResult, Violation } from "./types.js";

/**
 * Extract string literals from CORE_PERMISSION_SEEDS / *Permissions objects.
 */
export function extractSeedPermissionKeys(source: string): string[] {
  const keys = new Set<string>();
  // Object style: key: "tenancy.organization.read"
  const re = /(?::|=)\s*["']([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const k = m[1]!;
    if (PERMISSION_KEY_PATTERN.test(k) && k.split(".").length >= 2) {
      // Exclude event-like past-tense if needed — permission verbs are present tense mostly
      keys.add(k);
    }
  }
  return [...keys];
}

export function checkPermissionGovernance(repoRoot: string): CheckResult {
  const catalogPath = join(repoRoot, "docs/reference/permission-catalog.md");
  const catalog = new Set(loadPermissionCatalog(catalogPath));
  const violations: Violation[] = [];

  if (catalog.size === 0) {
    violations.push({
      rule: "P-01",
      severity: "error",
      path: catalogPath,
      message: "permission catalog parsed empty",
    });
    return { name: "permissions.catalog", violations };
  }

  const seedFile = join(
    repoRoot,
    "modules/rbac/src/application/catalog-seeds.ts",
  );
  if (existsSync(seedFile)) {
    const text = readFileSync(seedFile, "utf8");
    for (const key of extractSeedPermissionKeys(text)) {
      // Skip role keys if any slipped
      if (key === "organization.administrator") continue;
      if (!catalog.has(key)) {
        violations.push({
          rule: "P-03",
          severity: "error",
          path: relative(repoRoot, seedFile),
          message: `RBAC seed permission not in catalog: ${key}`,
        });
      }
    }
  } else {
    violations.push({
      rule: "P-03",
      severity: "error",
      message: "missing modules/rbac/src/application/catalog-seeds.ts",
    });
  }

  // Progressive: permission const files in Core/Shared must ⊆ catalog
  for (const rel of [
    "modules/identity/src/application/permissions.ts",
    "modules/tenancy/src/application/permissions.ts",
    "modules/rbac/src/application/permissions.ts",
    "modules/audit/src/application/permissions.ts",
    "modules/parties/src/application/permissions.ts",
    "modules/catalog/src/application/permissions.ts",
    "modules/orders/src/application/permissions.ts",
    "modules/payments/src/application/permissions.ts",
    "modules/ledger/src/application/permissions.ts",
    "modules/inventory/src/application/permissions.ts",
    "modules/reporting/src/application/permissions.ts",
  ]) {
    const file = join(repoRoot, rel);
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf8");
    for (const key of extractSeedPermissionKeys(text)) {
      if (!catalog.has(key)) {
        violations.push({
          rule: "P-02",
          severity: "error",
          path: rel,
          message: `permission key not in catalog: ${key}`,
        });
      }
    }
  }

  return { name: "permissions.catalog", violations };
}

export function findUnknownPermissions(
  keys: string[],
  catalog: Set<string>,
): Violation[] {
  return keys
    .filter((k) => !catalog.has(k))
    .map((k) => ({
      rule: "P-02",
      severity: "error" as const,
      message: `permission key not in catalog: ${k}`,
    }));
}
