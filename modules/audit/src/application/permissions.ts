/** Permission catalog keys owned by Audit. Host enforces on query routes. */
export const AuditPermissions = {
  Read: "audit.read",
  RetentionManage: "audit.retention.manage",
} as const;

export type AuditPermission =
  (typeof AuditPermissions)[keyof typeof AuditPermissions];
