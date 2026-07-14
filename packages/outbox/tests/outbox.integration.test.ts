import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  createFixtureEnvelope,
  createOutboxTestHarness,
  commitMutationWithOutbox,
  assertOutboxContains,
  assertOutboxMissing,
} from "../src/testing/harness.js";
import { OutboxRelay } from "../src/relay.js";
import { InProcessEventDispatcher } from "../src/dispatcher.js";
import { InMemoryEventArchive } from "../src/archive.js";
import { DuplicateEventIdError } from "../src/errors.js";

describe("outbox unit-of-work integration", () => {
  it("commits mutation and outbox together", async () => {
    const harness = createOutboxTestHarness();
    const envelope = createFixtureEnvelope({
      type: "identity.user.registered",
    });
    await commitMutationWithOutbox(harness, envelope);

    expect(harness.testState.committedMutations).toBe(1);
    await assertOutboxContains(harness.store, envelope.eventId);
    const row = await harness.store.getByEventId(envelope.eventId);
    expect(row?.status).toBe("unpublished");
  });

  it("rollback removes both mutation and outbox", async () => {
    const harness = createOutboxTestHarness();
    const envelope = createFixtureEnvelope({
      type: "identity.user.suspended",
    });
    const uow = harness.uowFactory.start();
    uow.stageMutation(() => {
      harness.testState.committedMutations += 1;
    });
    harness.writer.append(uow, envelope);
    await uow.rollback();

    expect(harness.testState.committedMutations).toBe(0);
    await assertOutboxMissing(harness.store, envelope.eventId);
  });

  it("supports multiple envelopes in one UoW", async () => {
    const harness = createOutboxTestHarness();
    const a = createFixtureEnvelope({ type: "identity.session.issued" });
    const b = createFixtureEnvelope({ type: "identity.session.revoked" });
    const uow = harness.uowFactory.start();
    uow.stageMutation(() => {
      harness.testState.committedMutations += 1;
    });
    harness.writer.append(uow, a);
    harness.writer.append(uow, b);
    await uow.commit();

    await assertOutboxContains(harness.store, a.eventId);
    await assertOutboxContains(harness.store, b.eventId);
  });

  it("rejects duplicate eventId within pending UoW", async () => {
    const harness = createOutboxTestHarness();
    const id = randomUUID();
    const uow = harness.uowFactory.start();
    harness.writer.append(uow, createFixtureEnvelope({ eventId: id }));
    expect(() =>
      harness.writer.append(uow, createFixtureEnvelope({ eventId: id })),
    ).toThrow(DuplicateEventIdError);
  });

  it("relays unpublished rows to dispatcher and archives", async () => {
    const harness = createOutboxTestHarness();
    const envelope = createFixtureEnvelope({
      type: "tenancy.organization.created",
      producer: "tenancy",
      organizationId: "org-1",
    });
    await commitMutationWithOutbox(harness, envelope);

    const dispatcher = new InProcessEventDispatcher();
    const archive = new InMemoryEventArchive();
    const relay = new OutboxRelay({
      store: harness.store,
      dispatcher,
      archive,
      maxAttempts: 3,
    });

    const result = await relay.processBatch(10);
    expect(result.published).toBe(1);
    expect(dispatcher.delivered).toHaveLength(1);
    expect(dispatcher.delivered[0]?.eventId).toBe(envelope.eventId);
    expect(archive.entries).toHaveLength(1);

    const row = await harness.store.getByEventId(envelope.eventId);
    expect(row?.status).toBe("published");
    expect(row?.publishedAt).toBeTruthy();
  });

  it("processBatch after restart still publishes unpublished", async () => {
    const harness = createOutboxTestHarness();
    const envelope = createFixtureEnvelope();
    await commitMutationWithOutbox(harness, envelope);

    const dispatcher = new InProcessEventDispatcher();
    const relay = new OutboxRelay({
      store: harness.store,
      dispatcher,
      archive: new InMemoryEventArchive(),
    });
    await relay.processBatch(10);
    expect(dispatcher.delivered).toHaveLength(1);

    // Second relay finds nothing unpublished
    const again = await relay.processBatch(10);
    expect(again.attempted).toBe(0);
  });
});
