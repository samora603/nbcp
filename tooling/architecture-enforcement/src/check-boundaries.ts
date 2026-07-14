import { readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import {
  CORE_PACKAGE_POLICY,
  FORBIDDEN_EDGES,
  CORE_MODULE_NAMES,
  SHARED_MODULE_NAMES,
  INFRA_PACKAGES,
} from "./policy.js";
import {
  extractImportSpecifiers,
  listTsFiles,
  readPackageJson,
  listWorkspaceModuleDirs,
} from "./fs-utils.js";
import type { CheckResult, Violation } from "./types.js";

function nbcpModuleName(dep: string): string | null {
  if (!dep.startsWith("@nbcp/")) return null;
  return dep.slice("@nbcp/".length);
}

function isDeepModuleImport(spec: string): boolean {
  // @nbcp/identity/src/... or @nbcp/identity/application/...
  const m = spec.match(/^@nbcp\/([a-z0-9-]+)\/(.+)$/);
  if (!m) return false;
  const rest = m[2]!;
  return (
    rest.startsWith("src/") ||
    rest.startsWith("application/") ||
    rest.startsWith("domain/") ||
    rest.startsWith("infrastructure/") ||
    rest.startsWith("api/")
  );
}

function layerOfModule(shortName: string): "CORE" | "SHARED" | "PRODUCT" | "UNKNOWN" {
  if (CORE_MODULE_NAMES.has(shortName)) return "CORE";
  if (SHARED_MODULE_NAMES.has(shortName)) return "SHARED";
  if (shortName.length > 0) return "PRODUCT";
  return "UNKNOWN";
}

export function checkPackageBoundaries(repoRoot: string): CheckResult {
  const violations: Violation[] = [];

  for (const policy of [...CORE_PACKAGE_POLICY, ...INFRA_PACKAGES]) {
    const dir = join(repoRoot, policy.path);
    const pkg = readPackageJson(dir);
    if (!pkg) {
      violations.push({
        rule: "D-01",
        severity: "error",
        path: policy.path,
        message: `missing package.json for ${policy.name}`,
      });
      continue;
    }

    for (const dep of Object.keys(pkg.dependencies)) {
      if (!dep.startsWith("@nbcp/")) continue;
      // Infra outbox allowed for all core
      if (dep === "@nbcp/outbox") continue;
      // Tooling packages may depend broadly — skip non-module
      if (dep === "@nbcp/architecture-enforcement") continue;

      const short = nbcpModuleName(dep)!;

      // Forbidden absolute edges
      for (const [from, to] of FORBIDDEN_EDGES) {
        if (pkg.name === from && dep === to) {
          violations.push({
            rule: "D-01",
            severity: "error",
            path: policy.path,
            message: `forbidden dependency ${from} → ${to}`,
          });
        }
      }

      // Payments → Ledger
      if (pkg.name === "@nbcp/payments" && dep === "@nbcp/ledger") {
        violations.push({
          rule: "D-02",
          severity: "error",
          path: policy.path,
          message: "Payments must not depend on Ledger",
        });
      }

      // Core policy allow-list for known packages
      const corePolicy = CORE_PACKAGE_POLICY.find((p) => p.name === pkg.name);
      if (corePolicy) {
        const targetIsModule =
          CORE_MODULE_NAMES.has(short) || SHARED_MODULE_NAMES.has(short);
        if (targetIsModule && !corePolicy.allowedModuleDeps.includes(dep)) {
          violations.push({
            rule: "D-01",
            severity: "error",
            path: policy.path,
            message: `${pkg.name} may not depend on ${dep} (allowed: ${corePolicy.allowedModuleDeps.join(", ") || "none"})`,
          });
        }
      }

      // Core must not depend on Shared/Product
      if (corePolicy && (SHARED_MODULE_NAMES.has(short) || layerOfModule(short) === "PRODUCT")) {
        if (!CORE_MODULE_NAMES.has(short)) {
          violations.push({
            rule: "B-02",
            severity: "error",
            path: policy.path,
            message: `Core package ${pkg.name} must not depend on Shared/Product ${dep}`,
          });
        }
      }
    }

    // Identity isolation
    if (pkg.name === "@nbcp/identity") {
      for (const dep of Object.keys(pkg.dependencies)) {
        if (dep.startsWith("@nbcp/") && dep !== "@nbcp/outbox") {
          violations.push({
            rule: "B-03",
            severity: "error",
            path: policy.path,
            message: `Identity must have zero module deps; found ${dep}`,
          });
        }
      }
    }
  }

  // Shared → Product: scan any future shared packages
  for (const modDir of listWorkspaceModuleDirs(repoRoot)) {
    const pkg = readPackageJson(modDir);
    if (!pkg) continue;
    const short = nbcpModuleName(pkg.name);
    if (!short || !SHARED_MODULE_NAMES.has(short)) continue;
    for (const dep of Object.keys(pkg.dependencies)) {
      const depShort = nbcpModuleName(dep);
      if (!depShort) continue;
      if (
        !CORE_MODULE_NAMES.has(depShort) &&
        !SHARED_MODULE_NAMES.has(depShort) &&
        dep.startsWith("@nbcp/") &&
        dep !== "@nbcp/outbox"
      ) {
        // Product-named module
        violations.push({
          rule: "B-01",
          severity: "error",
          path: relative(repoRoot, modDir),
          message: `Shared module ${pkg.name} must not depend on Product ${dep}`,
        });
      }
    }
  }

  // Absolute forbidden edges for any workspace module package
  for (const modDir of listWorkspaceModuleDirs(repoRoot)) {
    const pkg = readPackageJson(modDir);
    if (!pkg) continue;
    for (const dep of Object.keys(pkg.dependencies)) {
      for (const [from, to] of FORBIDDEN_EDGES) {
        if (pkg.name === from && dep === to) {
          violations.push({
            rule: from === "@nbcp/payments" ? "D-02" : "D-01",
            severity: "error",
            path: relative(repoRoot, modDir),
            message: `forbidden dependency ${from} → ${to}`,
          });
        }
      }
    }
  }

  return { name: "boundaries.packages", violations };
}

export function checkImportBoundaries(repoRoot: string): CheckResult {
  const violations: Violation[] = [];

  for (const policy of CORE_PACKAGE_POLICY) {
    const srcDir = join(repoRoot, policy.path, "src");
    for (const file of listTsFiles(srcDir)) {
      const text = readFileSync(file, "utf8");
      const rel = relative(repoRoot, file);
      for (const spec of extractImportSpecifiers(text)) {
        if (isDeepModuleImport(spec)) {
          violations.push({
            rule: "B-05",
            severity: "error",
            path: rel,
            message: `deep cross-module import forbidden: ${spec}`,
          });
        }

        // Domain purity: domain/ must not import nest/prisma/@nestjs
        if (file.includes(`${join(policy.path, "src", "domain")}`) || file.includes("/src/domain/")) {
          if (
            /@nestjs|prisma|express|fastify|nestjs/.test(spec) ||
            spec.includes("/infrastructure/")
          ) {
            violations.push({
              rule: "B-06",
              severity: "error",
              path: rel,
              message: `domain layer forbidden import: ${spec}`,
            });
          }
        }

        // Relative deep dive into another module
        if (
          /modules\/(identity|tenancy|rbac|audit)\//.test(spec) ||
          /\/(identity|tenancy|rbac|audit)\/src\//.test(spec)
        ) {
          violations.push({
            rule: "B-05",
            severity: "error",
            path: rel,
            message: `path-based module internal import forbidden: ${spec}`,
          });
        }
      }
    }
  }

  // Product → Shared direction: if products/* exist with package.json, Shared must not appear reverse — handled above
  const productsRoot = join(repoRoot, "products");
  if (existsSync(productsRoot)) {
    // Product packages may depend on Shared/Core; ensure they don't get depended on by Core (already covered)
  }

  return { name: "boundaries.imports", violations };
}

export function checkBoundaries(repoRoot: string): CheckResult[] {
  return [checkPackageBoundaries(repoRoot), checkImportBoundaries(repoRoot)];
}
