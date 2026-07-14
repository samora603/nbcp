import { describe, expect, it } from "vitest";
import {
  createFixtureEnvelope,
  createOutboxTestHarness,
  commitMutationWithOutbox,
} from "../src/testing/harness.js";
import { OutboxRelay } from "../src/relay.js";
import { InProcessEventDispatcher } from "../src/dispatcher.js";
import { InMemoryEventArchive } from "../src/archive.js";
import { EventReplaySupport } from "../src/replay.js";
import {
  InMemoryProcessedEventsStore,
  deliverIdempotent,
} from "../src/idempotency.js";
import type { DomainEventEnvelope } from "../src/envelope.js";

describe("replay and idempotency", () => {
  it("skips duplicate delivery for idempotent consumer", async () => {
    const processed = new InMemoryProcessedEventsStore();
    const seen: string[] = [];
    const envelope = createFixtureEnvelope();

    const first = await deliverIdempotent(
      processed,
      "test-consumer",
      envelope,
      async (e) => {
        seen.push(e.eventId);
      },
    );
    const second = await deliverIdempotent(
      processed,
      "test-consumer",
      envelope,
      async (e) => {
        seen.push(e.eventId);
      },
    );

    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
    expect(seen).toEqual([envelope.eventId]);
  });

  it("dry-run lists envelopes without applying consumer side effects", async () => {
    const harness = createOutboxTestHarness();
    const envelope = createFixtureEnvelope({
      organizationId: "org-replay",
      type: "tenancy.membership.activated",
      producer: "tenancy",
    });
    await commitMutationWithOutbox(harness, envelope);

    const dispatcher = new InProcessEventDispatcher();
    const relay = new OutboxRelay({
      store: harness.store,
      dispatcher,
      archive: new InMemoryEventArchive(),
    });
    await relay.processBatch(10);

    const replay = new EventReplaySupport(harness.store);
    const dry = await replay.replayToDispatcher(
      { organizationId: "org-replay", dryRun: true },
      dispatcher,
    );
    expect(dry.dryRun).toBe(true);
    expect(dry.matched).toBe(1);
    expect(dry.delivered).toBe(0);
    // Original relay delivery only
    expect(dispatcher.delivered).toHaveLength(1);
  });

  it("replay re-delivers; idempotent handler applies once", async () => {
    const harness = createOutboxTestHarness();
    const envelope = createFixtureEnvelope({
      type: "rbac.role_assignment.granted",
      producer: "rbac",
      organizationId: "org-1",
    });
    await commitMutationWithOutbox(harness, envelope);

    await new OutboxRelay({
      store: harness.store,
      dispatcher: new InProcessEventDispatcher(),
      archive: new InMemoryEventArchive(),
    }).processBatch(10);

    const processed = new InMemoryProcessedEventsStore();
    const applied: DomainEventEnvelope[] = [];
    const replay = new EventReplaySupport(harness.store);

    const first = await replay.replayIdempotent(
      { type: "rbac.role_assignment.granted" },
      processed,
      "audit-projector",
      async (e) => {
        applied.push(e);
      },
    );
    const second = await replay.replayIdempotent(
      { type: "rbac.role_assignment.granted" },
      processed,
      "audit-projector",
      async (e) => {
        applied.push(e);
      },
    );

    expect(first.delivered).toBe(1);
    expect(second.delivered).toBe(0);
    expect(second.skippedIdempotent).toBe(1);
    expect(applied).toHaveLength(1);
  });

  it("does not mutate envelope payloads during relay or replay", async () => {
    const harness = createOutboxTestHarness();
    const envelope = createFixtureEnvelope({
      payload: { principalId: "p-1", flag: true },
    });
    const originalPayload = structuredClone(envelope.payload);
    await commitMutationWithOutbox(harness, envelope);

    await new OutboxRelay({
      store: harness.store,
      dispatcher: new InProcessEventDispatcher(),
      archive: new InMemoryEventArchive(),
    }).processBatch(10);

    const row = await harness.store.getByEventId(envelope.eventId);
    expect(row?.envelope.payload).toEqual(originalPayload);

    const replay = new EventReplaySupport(harness.store);
    const listed = await replay.list({});
    expect(listed[0]?.payload).toEqual(originalPayload);
  });
});
