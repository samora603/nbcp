/**
 * Tool-agnostic architecture policy (ADR-0006).
 * Maps layers and allowed kernel edges without binding to a specific linter.
 */

export type ModuleLayer = "CORE" | "SHARED" | "PRODUCT" | "INFRA" | "APP" | "TOOLING";

export interface PackagePolicy {
  /** Workspace path relative to repo root, e.g. modules/identity */
  path: string;
  /** npm package name */
  name: string;
  layer: ModuleLayer;
  /** Allowed @nbcp/* module dependencies (package short names or full). */
  allowedModuleDeps: readonly string[];
}

/** Known Core kernel packages and legal DAG edges (ADR-0002 / ADR-0006). */
export const CORE_PACKAGE_POLICY: readonly PackagePolicy[] = [
  {
    path: "modules/identity",
    name: "@nbcp/identity",
    layer: "CORE",
    allowedModuleDeps: [],
  },
  {
    path: "modules/tenancy",
    name: "@nbcp/tenancy",
    layer: "CORE",
    allowedModuleDeps: ["@nbcp/identity"],
  },
  {
    path: "modules/rbac",
    name: "@nbcp/rbac",
    layer: "CORE",
    allowedModuleDeps: ["@nbcp/identity", "@nbcp/tenancy"],
  },
  {
    path: "modules/audit",
    name: "@nbcp/audit",
    layer: "CORE",
    allowedModuleDeps: ["@nbcp/identity", "@nbcp/tenancy", "@nbcp/rbac"],
  },
];

/** Shared packages with legal Core/Audit deps (ADR-0002). */
export const SHARED_PACKAGE_POLICY: readonly PackagePolicy[] = [
  {
    path: "modules/parties",
    name: "@nbcp/parties",
    layer: "SHARED",
    allowedModuleDeps: [
      "@nbcp/identity",
      "@nbcp/tenancy",
      "@nbcp/rbac",
      "@nbcp/audit",
    ],
  },
  {
    path: "modules/catalog",
    name: "@nbcp/catalog",
    layer: "SHARED",
    allowedModuleDeps: [
      "@nbcp/identity",
      "@nbcp/tenancy",
      "@nbcp/rbac",
      "@nbcp/audit",
      "@nbcp/parties",
    ],
  },
  {
    path: "modules/orders",
    name: "@nbcp/orders",
    layer: "SHARED",
    allowedModuleDeps: [
      "@nbcp/identity",
      "@nbcp/tenancy",
      "@nbcp/rbac",
      "@nbcp/audit",
      "@nbcp/parties",
      "@nbcp/catalog",
    ],
  },
];

export const INFRA_PACKAGES: readonly PackagePolicy[] = [
  {
    path: "packages/outbox",
    name: "@nbcp/outbox",
    layer: "INFRA",
    allowedModuleDeps: [],
  },
];

/** Forbidden absolute edges (from → to). */
export const FORBIDDEN_EDGES: ReadonlyArray<readonly [string, string]> = [
  ["@nbcp/identity", "@nbcp/tenancy"],
  ["@nbcp/identity", "@nbcp/rbac"],
  ["@nbcp/identity", "@nbcp/audit"],
  ["@nbcp/tenancy", "@nbcp/rbac"],
  ["@nbcp/tenancy", "@nbcp/audit"],
  ["@nbcp/rbac", "@nbcp/audit"],
  ["@nbcp/payments", "@nbcp/ledger"],
];

export const DOMAIN_MODULE_NAMES = new Set([
  "identity",
  "tenancy",
  "rbac",
  "audit",
  "parties",
  "catalog",
  "orders",
  "payments",
  "ledger",
  "inventory",
  "reporting",
  "notifications",
  "scheduling",
  "files",
  "integrations",
]);

export const CORE_MODULE_NAMES = new Set([
  "identity",
  "tenancy",
  "rbac",
  "audit",
]);

export const SHARED_MODULE_NAMES = new Set([
  "parties",
  "catalog",
  "orders",
  "payments",
  "ledger",
  "inventory",
  "reporting",
  "notifications",
  "scheduling",
  "files",
  "integrations",
]);

/** Modules that MUST publish SECURITY events via @nbcp/outbox. */
export const SECURITY_OUTBOX_MODULES = [
  "modules/identity",
  "modules/tenancy",
  "modules/rbac",
] as const;

export const REQUIRED_ADRS = [
  "docs/adr/0001-platform-technology-foundation.md",
  "docs/adr/0002-domain-map.md",
  "docs/adr/0003-event-contracts-and-outbox.md",
  "docs/adr/0004-event-retention-replay-rebuild.md",
  "docs/adr/0005-financial-truth-and-projection-ownership.md",
  "docs/adr/0006-architecture-enforcement-and-governance.md",
  "docs/adr/0007-orders-inventory-reservation-and-issue-timing.md",
] as const;

export const REQUIRED_ARCHITECTURE_DOCS = [
  "docs/architecture/domain-map.md",
  "docs/architecture/module-standard.md",
  "docs/architecture/event-contracts.md",
  "docs/architecture/tenant-access-model.md",
  "docs/reference/event-catalog.md",
  "docs/reference/permission-catalog.md",
  "docs/implementation/architecture-automation-backlog.md",
] as const;

export const EVENT_TYPE_PATTERN =
  /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

export const PERMISSION_KEY_PATTERN =
  /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
