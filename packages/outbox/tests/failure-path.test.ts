import { describe, expect, it } from "vitest";
import {
  createFixtureEnvelope,
  createOutboxTestHarness,
  commitMutationWithOutbox,
} from "../src/testing/harness.js";
import { OutboxRelay } from "../src/relay.js";
import type { EventDispatcher } from "../src/dispatcher.js";
import { InMemoryEventArchive } from "../src/archive.js";
import { InMemoryOutboxMetrics } from "../src/observability.js";
import type { DomainEventEnvelope } from "../src/envelope.js";

class FlakyDispatcher implements EventDispatcher {
  failuresLeft: number;
  deliveries = 0;

  constructor(failuresLeft: number) {
    this.failuresLeft = failuresLeft;
  }

  async dispatch(_envelope: DomainEventEnvelope): Promise<void> {
    if (this.failuresLeft > 0) {
      this.failuresLeft -= 1;
      throw new Error("transient dispatch failure");
    }
    this.deliveries += 1;
  }
}

describe("outbox failure paths", () => {
  it("keeps unpublished and increments attempts on transient failure", async () => {
    const harness = createOutboxTestHarness();
    const envelope = createFixtureEnvelope();
    await commitMutationWithOutbox(harness, envelope);

    const dispatcher = new FlakyDispatcher(2);
    const metrics = new InMemoryOutboxMetrics();
    const relay = new OutboxRelay({
      store: harness.store,
      dispatcher,
      archive: new InMemoryEventArchive(),
      maxAttempts: 5,
      metrics,
    });

    const first = await relay.processBatch(1);
    expect(first.failed).toBe(1);
    expect((await harness.store.getByEventId(envelope.eventId))?.status).toBe(
      "unpublished",
    );
    expect(
      (await harness.store.getByEventId(envelope.eventId))?.attemptCount,
    ).toBe(1);

    await relay.processBatch(1);
    expect(
      (await harness.store.getByEventId(envelope.eventId))?.attemptCount,
    ).toBe(2);

    const success = await relay.processBatch(1);
    expect(success.published).toBe(1);
    expect(dispatcher.deliveries).toBe(1);
    expect(metrics.counters.get("outbox.relay.failure")).toBeGreaterThan(0);
  });

  it("poisons after maxAttempts and retains the row", async () => {
    const harness = createOutboxTestHarness();
    const envelope = createFixtureEnvelope({
      type: "identity.user.password_changed",
    });
    await commitMutationWithOutbox(harness, envelope);

    const dispatcher = new FlakyDispatcher(100);
    const relay = new OutboxRelay({
      store: harness.store,
      dispatcher,
      archive: new InMemoryEventArchive(),
      maxAttempts: 3,
    });

    await relay.processBatch(1);
    await relay.processBatch(1);
    const last = await relay.processBatch(1);
    expect(last.poisoned).toBe(1);

    const row = await harness.store.getByEventId(envelope.eventId);
    expect(row?.status).toBe("poison");
    expect(row?.lastError).toContain("transient");
    // Never deleted
    expect(row).toBeTruthy();
  });

  it("does not mark published when dispatch throws", async () => {
    const harness = createOutboxTestHarness();
    const envelope = createFixtureEnvelope();
    await commitMutationWithOutbox(harness, envelope);

    const relay = new OutboxRelay({
      store: harness.store,
      dispatcher: {
        async dispatch() {
          throw new Error("boom");
        },
      },
      archive: new InMemoryEventArchive(),
      maxAttempts: 5,
    });

    await relay.processBatch(1);
    expect((await harness.store.getByEventId(envelope.eventId))?.status).toBe(
      "unpublished",
    );
    expect((await harness.store.getByEventId(envelope.eventId))?.publishedAt).toBeNull();
  });
});
