import {
  IdentityEventTypes,
  IDENTITY_EVENT_TYPE_SET,
} from "@nbcp/identity";
import { TENANCY_EVENT_TYPE_SET } from "@nbcp/tenancy";
import { RBAC_EVENT_TYPE_SET } from "@nbcp/rbac";

export type IngestEventClass =
  | "SECURITY"
  | "FINANCIAL"
  | "BUSINESS"
  | "AUDIT"
  | "OPERATIONAL"
  | "IGNORE";

/** Parties SECURITY types (catalog) — avoid importing @nbcp/parties (Shared→cycle). */
const PARTIES_SECURITY_TYPES = [
  "parties.principal.linked",
  "parties.principal.unlinked",
] as const;

/**
 * SECURITY types that must project into Audit.
 */
export const KERNEL_SECURITY_EVENT_TYPES: ReadonlySet<string> = new Set([
  ...IDENTITY_EVENT_TYPE_SET,
  ...TENANCY_EVENT_TYPE_SET,
  ...RBAC_EVENT_TYPE_SET,
  ...PARTIES_SECURITY_TYPES,
]);

const FINANCIAL_PREFIXES = ["payments.", "ledger."] as const;

export function classifyEnvelopeType(type: string): IngestEventClass {
  if (KERNEL_SECURITY_EVENT_TYPES.has(type)) {
    return "SECURITY";
  }
  if (
    type.startsWith("parties.") ||
    type.startsWith("catalog.") ||
    type.startsWith("orders.") ||
    type.startsWith("inventory.") ||
    type.startsWith("reporting.")
  ) {
    return "BUSINESS";
  }
  if (FINANCIAL_PREFIXES.some((p) => type.startsWith(p))) {
    return "FINANCIAL";
  }
  if (type.startsWith("audit.")) {
    return "AUDIT";
  }
  return "IGNORE";
}

export function isHighVolumeSampledType(type: string): boolean {
  return type === IdentityEventTypes.SessionIssued;
}

export { IdentityEventTypes };
