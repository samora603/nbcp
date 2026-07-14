import { randomBytes } from "node:crypto";
import {
  InMemoryOutboxStore,
  InMemoryUnitOfWorkFactory,
  OutboxWriter,
  InMemoryProcessedEventsStore,
  InProcessEventDispatcher,
  OutboxRelay,
  NoopEventArchive,
  EventReplaySupport,
  type ProcessedEventsStore,
} from "@nbcp/outbox";
import { AuditService } from "./audit-service.js";
import type { AuditRuntime } from "./ports.js";
import { InMemoryAuditRecordRepository } from "../infrastructure/in-memory-store.js";
import {
  createAuditEventIngestor,
  type AuditEventIngestor,
} from "./audit-event-ingestor.js";

export interface CreateAuditKernelOptions {
  outboxStore?: InMemoryOutboxStore;
  processedEvents?: ProcessedEventsStore;
  emitRecordAppended?: boolean;
}

export interface AuditKernel {
  service: AuditService;
  outboxStore: InMemoryOutboxStore;
  records: InMemoryAuditRecordRepository;
  processedEvents: ProcessedEventsStore;
  ingestor: AuditEventIngestor;
  dispatcher: InProcessEventDispatcher;
  relay: OutboxRelay;
  replay: EventReplaySupport;
}

/**
 * Composition root for tests and early hosts.
 * Wire Identity/Tenancy/RBAC outbox → shared store → relay → audit ingestor.
 */
export function createAuditKernel(
  options: CreateAuditKernelOptions = {},
): AuditKernel {
  const outboxStore = options.outboxStore ?? new InMemoryOutboxStore();
  const uowFactory = new InMemoryUnitOfWorkFactory({ store: outboxStore });
  const records = new InMemoryAuditRecordRepository();
  const processedEvents =
    options.processedEvents ?? new InMemoryProcessedEventsStore();

  const runtime: AuditRuntime = {
    uowFactory,
    outbox: new OutboxWriter(),
    records,
    ids: {
      id: () => randomBytes(16).toString("hex"),
    },
    clock: {
      now: () => new Date().toISOString(),
    },
  };
  if (options.emitRecordAppended === true) {
    runtime.emitRecordAppended = true;
  }

  const service = new AuditService(runtime);
  const ingestor = createAuditEventIngestor(service, processedEvents);
  const dispatcher = new InProcessEventDispatcher();
  dispatcher.subscribe(async (envelope) => {
    await ingestor.handle(envelope);
  });

  const relay = new OutboxRelay({
    store: outboxStore,
    dispatcher,
    archive: new NoopEventArchive(),
  });

  const replay = new EventReplaySupport(outboxStore);

  return {
    service,
    outboxStore,
    records,
    processedEvents,
    ingestor,
    dispatcher,
    relay,
    replay,
  };
}
