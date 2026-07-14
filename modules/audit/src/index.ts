export { AuditService } from "./application/audit-service.js";
export type { AppendAuditCommand } from "./application/audit-service.js";
export { createAuditKernel } from "./application/create-audit-kernel.js";
export type {
  CreateAuditKernelOptions,
  AuditKernel,
} from "./application/create-audit-kernel.js";
export {
  createAuditEventIngestor,
  AUDIT_SECURITY_CONSUMER,
} from "./application/audit-event-ingestor.js";
export type { AuditEventIngestor } from "./application/audit-event-ingestor.js";
export { projectEnvelopeToAudit } from "./application/project-envelope.js";
export type { ProjectedAuditCommand } from "./application/project-envelope.js";
export {
  classifyEnvelopeType,
  KERNEL_SECURITY_EVENT_TYPES,
} from "./application/event-classification.js";
export { AuditPermissions } from "./application/permissions.js";
export type { AuditPermission } from "./application/permissions.js";
export { AuditEventTypes, AUDIT_EVENT_TYPE_SET } from "./domain/events.js";
export type { AuditEventType } from "./domain/events.js";
export type {
  AuditRecord,
  AuditRecordView,
  Actor,
  ActorKind,
  AuditOutcome,
  TargetRef,
  AuditMetadata,
} from "./domain/audit-record.js";
export { redactMetadata, METADATA_DENY_LIST } from "./domain/redaction.js";
export {
  AuditError,
  ValidationError,
  NotFoundError,
  ConflictError,
  RetentionError,
} from "./domain/errors.js";
export type {
  AuditQuery,
  AuditQueryResult,
  AuditRecordRepository,
  AuditRuntime,
} from "./application/ports.js";
