import { randomUUID } from "node:crypto";
import type { DomainEventEnvelope } from "../envelope.js";
import type { OutboxStore } from "../outbox-store.js";
import { InMemoryOutboxStore } from "../in-memory-outbox-store.js";
import {
  InMemoryUnitOfWorkFactory,
  type UnitOfWork,
  type UnitOfWorkFactory,
} from "../unit-of-work.js";
import { OutboxWriter } from "../outbox-writer.js";

/**
 * Test / architecture harness for WP-02+ (SECURITY mutation ⇒ outbox in same UoW).
 */
export interface OutboxTestHarness {
  store: OutboxStore;
  uowFactory: UnitOfWorkFactory;
  writer: OutboxWriter;
  /** Mutable side-effect flag / store for test aggregates. */
  testState: { committedMutations: number };
}

export function createOutboxTestHarness(): OutboxTestHarness {
  const store = new InMemoryOutboxStore();
  const uowFactory = new InMemoryUnitOfWorkFactory({ store });
  const writer = new OutboxWriter();
  return {
    store,
    uowFactory,
    writer,
    testState: { committedMutations: 0 },
  };
}

export interface FixtureEnvelopeOptions {
  eventId?: string;
  type?: string;
  producer?: string;
  organizationId?: string | null;
  correlationId?: string | null;
  version?: number;
  payload?: Record<string, unknown>;
}

/** Catalog-aligned fixture (Identity-style SECURITY example). */
export function createFixtureEnvelope(
  overrides: FixtureEnvelopeOptions = {},
): DomainEventEnvelope {
  return {
    eventId: overrides.eventId ?? randomUUID(),
    type: overrides.type ?? "identity.user.registered",
    version: overrides.version ?? 1,
    occurredAt: new Date().toISOString(),
    producer: overrides.producer ?? "identity",
    organizationId:
      overrides.organizationId === undefined ? null : overrides.organizationId,
    correlationId:
      overrides.correlationId === undefined ? null : overrides.correlationId,
    payload: overrides.payload ?? { principalId: "p-fixture" },
  };
}

/**
 * Run a mutation + outbox append in one UoW and commit.
 */
export async function commitMutationWithOutbox(
  harness: OutboxTestHarness,
  envelope: DomainEventEnvelope,
): Promise<UnitOfWork> {
  const uow = harness.uowFactory.start();
  uow.stageMutation(() => {
    harness.testState.committedMutations += 1;
  });
  harness.writer.append(uow, envelope);
  await uow.commit();
  return uow;
}

/**
 * Assert outbox contains eventId after a successful path (WP-02 architecture helper).
 */
export async function assertOutboxContains(
  store: OutboxStore,
  eventId: string,
): Promise<void> {
  const row = await store.getByEventId(eventId);
  if (!row) {
    throw new Error(`Expected outbox row for eventId "${eventId}"`);
  }
}

/**
 * Assert outbox does not contain eventId (e.g. after rollback).
 */
export async function assertOutboxMissing(
  store: OutboxStore,
  eventId: string,
): Promise<void> {
  const row = await store.getByEventId(eventId);
  if (row) {
    throw new Error(`Did not expect outbox row for eventId "${eventId}"`);
  }
}

/**
 * Architecture-style proof: commit ⇒ row present; rollback ⇒ row absent.
 */
export async function assertSameUnitOfWorkCoupling(
  harness: OutboxTestHarness,
): Promise<void> {
  const ok = createFixtureEnvelope({
    eventId: randomUUID(),
    type: "identity.user.activated",
  });
  await commitMutationWithOutbox(harness, ok);
  await assertOutboxContains(harness.store, ok.eventId);
  if (harness.testState.committedMutations < 1) {
    throw new Error("Expected mutation to commit with outbox");
  }

  const rolled = createFixtureEnvelope({
    eventId: randomUUID(),
    type: "identity.user.suspended",
  });
  const uow = harness.uowFactory.start();
  const before = harness.testState.committedMutations;
  uow.stageMutation(() => {
    harness.testState.committedMutations += 1;
  });
  harness.writer.append(uow, rolled);
  await uow.rollback();
  await assertOutboxMissing(harness.store, rolled.eventId);
  if (harness.testState.committedMutations !== before) {
    throw new Error("Rollback must not apply staged mutations");
  }
}
