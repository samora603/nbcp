export type { DomainEventEnvelope, EventOwnership } from "./envelope.js";
export {
  ownershipFromEnvelope,
  EVENT_TYPE_PATTERN,
  PRODUCER_PATTERN,
} from "./envelope.js";

export { validateEnvelope } from "./validate-envelope.js";

export {
  OutboxError,
  EnvelopeValidationError,
  DuplicateEventIdError,
  InactiveUnitOfWorkError,
  UnitOfWorkStateError,
} from "./errors.js";

export type {
  OutboxRecord,
  OutboxRecordStatus,
  OutboxQuery,
  OutboxStore,
} from "./outbox-store.js";

export { InMemoryOutboxStore } from "./in-memory-outbox-store.js";

export type {
  UnitOfWork,
  UnitOfWorkFactory,
  MutationCallback,
  InMemoryUnitOfWorkOptions,
} from "./unit-of-work.js";
export {
  InMemoryUnitOfWork,
  InMemoryUnitOfWorkFactory,
} from "./unit-of-work.js";

export { OutboxWriter } from "./outbox-writer.js";

export type { EventDispatcher } from "./dispatcher.js";
export { InProcessEventDispatcher } from "./dispatcher.js";

export type { EventArchive } from "./archive.js";
export { NoopEventArchive, InMemoryEventArchive } from "./archive.js";

export type { OutboxRelayOptions, RelayBatchResult } from "./relay.js";
export { OutboxRelay } from "./relay.js";

export type {
  ProcessedEventsStore,
  IdempotentHandler,
} from "./idempotency.js";
export {
  InMemoryProcessedEventsStore,
  deliverIdempotent,
} from "./idempotency.js";

export type { ReplayFilter, ReplayResult } from "./replay.js";
export { EventReplaySupport } from "./replay.js";

export type {
  OutboxMetrics,
  OutboxLogger,
  OutboxMetricName,
} from "./observability.js";
export {
  InMemoryOutboxMetrics,
  ConsoleOutboxLogger,
  SilentOutboxLogger,
} from "./observability.js";
