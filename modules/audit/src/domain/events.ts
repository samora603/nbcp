export const AuditEventTypes = {
  RecordAppended: "audit.record.appended",
  RetentionArchived: "audit.retention.archived",
  RetentionPurged: "audit.retention.purged",
} as const;

export type AuditEventType =
  (typeof AuditEventTypes)[keyof typeof AuditEventTypes];

export const AUDIT_EVENT_TYPE_SET: ReadonlySet<string> = new Set(
  Object.values(AuditEventTypes),
);
