import { readFileSync } from "node:fs";
import { EVENT_TYPE_PATTERN } from "./policy.js";
import type { Violation } from "./types.js";

export interface CatalogEvent {
  type: string;
  owner: string;
  classification: string;
  replayable: string;
  version: string;
  status: string;
}

const ROW =
  /^\|\s*`([^`]+)`\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]*)\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|/;

export function parseEventCatalog(markdown: string): CatalogEvent[] {
  const events: CatalogEvent[] = [];
  for (const line of markdown.split("\n")) {
    const m = line.match(ROW);
    if (!m) continue;
    const type = m[1]!.trim();
    if (!EVENT_TYPE_PATTERN.test(type)) continue;
    events.push({
      type,
      owner: m[2]!.trim(),
      classification: m[3]!.trim(),
      replayable: m[5]!.trim(),
      version: m[6]!.trim(),
      status: m[7]!.trim(),
    });
  }
  return events;
}

export function loadEventCatalog(catalogPath: string): CatalogEvent[] {
  return parseEventCatalog(readFileSync(catalogPath, "utf8"));
}

export function validateCatalogSchema(
  events: CatalogEvent[],
): Violation[] {
  const violations: Violation[] = [];
  const seen = new Set<string>();
  const allowedClass = new Set([
    "SECURITY",
    "FINANCIAL",
    "BUSINESS",
    "AUDIT",
    "OPERATIONAL",
    "ANALYTICS",
  ]);
  const allowedStatus = new Set([
    "Planned",
    "Published",
    "Deprecated",
    "Retired",
  ]);

  for (const e of events) {
    if (seen.has(e.type)) {
      violations.push({
        rule: "E-05",
        severity: "error",
        message: `duplicate catalog type: ${e.type}`,
      });
    }
    seen.add(e.type);
    if (!allowedClass.has(e.classification)) {
      violations.push({
        rule: "E-05",
        severity: "error",
        message: `invalid classification for ${e.type}: ${e.classification}`,
      });
    }
    if (!allowedStatus.has(e.status)) {
      violations.push({
        rule: "E-05",
        severity: "error",
        message: `invalid status for ${e.type}: ${e.status}`,
      });
    }
    if (!e.version.trim()) {
      violations.push({
        rule: "E-05",
        severity: "error",
        message: `missing version for ${e.type}`,
      });
    }
    if (!e.owner.trim()) {
      violations.push({
        rule: "E-05",
        severity: "error",
        message: `missing owner for ${e.type}`,
      });
    }
  }
  return violations;
}

/** Owner module display name → event prefix. */
export const OWNER_TO_PREFIX: Record<string, string> = {
  Identity: "identity.",
  Tenancy: "tenancy.",
  RBAC: "rbac.",
  Audit: "audit.",
  Parties: "parties.",
  Catalog: "catalog.",
  Orders: "orders.",
  Payments: "payments.",
  Ledger: "ledger.",
  Inventory: "inventory.",
  Reporting: "reporting.",
  Notifications: "notifications.",
  Scheduling: "scheduling.",
  Files: "files.",
  Integrations: "integrations.",
};

export function ownerMatchesType(owner: string, type: string): boolean {
  const prefix = OWNER_TO_PREFIX[owner];
  if (!prefix) return true; // unknown owner — skip strict check
  return type.startsWith(prefix);
}
