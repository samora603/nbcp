import {
  IdentityEventTypes,
  IDENTITY_EVENT_TYPE_SET,
} from "@nbcp/identity";
import { TenancyEventTypes, TENANCY_EVENT_TYPE_SET } from "@nbcp/tenancy";
import { RbacEventTypes, RBAC_EVENT_TYPE_SET } from "@nbcp/rbac";

export type IngestEventClass =
  | "SECURITY"
  | "FINANCIAL"
  | "BUSINESS"
  | "AUDIT"
  | "OPERATIONAL"
  | "IGNORE";

/**
 * Kernel SECURITY types that must project into Audit (C6 / D3).
 * Plus FINANCIAL prefixes for metadata-only ingest (ADR-0005: Audit ≠ financial SoR).
 */
export const KERNEL_SECURITY_EVENT_TYPES: ReadonlySet<string> = new Set([
  ...IDENTITY_EVENT_TYPE_SET,
  ...TENANCY_EVENT_TYPE_SET,
  ...RBAC_EVENT_TYPE_SET,
]);

const FINANCIAL_PREFIXES = ["payments.", "ledger."] as const;

export function classifyEnvelopeType(type: string): IngestEventClass {
  if (KERNEL_SECURITY_EVENT_TYPES.has(type)) {
    return "SECURITY";
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

export {
  IdentityEventTypes,
  TenancyEventTypes,
  RbacEventTypes,
};
