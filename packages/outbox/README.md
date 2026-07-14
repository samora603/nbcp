# `@nbcp/outbox`

Transactional **outbox foundation** for NBCP (WP-01 / M1 Kernel Foundation).

This is a **technical** package under `packages/` — not a Core domain module. It must **never** import `modules/*`.

## Capabilities

* Domain event **envelope** validation (ADR-0003)
* **Unit of Work** staging: aggregate mutations + outbox append commit/rollback together
* **Outbox store** port + in-memory adapter (DB adapter later)
* **Relay** with retry / poison quarantine (no silent drop)
* **Archive** seam (`NoopEventArchive` stub or in-memory)
* Consumer **idempotency** helpers (`eventId`)
* **Replay** listing / re-dispatch hooks (ADR-0004 compatible)
* **Test harness** for WP-02+ architecture assertions

## Usage sketch

```ts
import {
  InMemoryOutboxStore,
  InMemoryUnitOfWorkFactory,
  OutboxWriter,
  OutboxRelay,
  InProcessEventDispatcher,
  NoopEventArchive,
} from "@nbcp/outbox";

const store = new InMemoryOutboxStore();
const uowFactory = new InMemoryUnitOfWorkFactory({ store });
const writer = new OutboxWriter();

const uow = uowFactory.start();
uow.stageMutation(() => {
  /* persist aggregate */
});
writer.append(uow, envelope);
await uow.commit();

const relay = new OutboxRelay({
  store,
  dispatcher: new InProcessEventDispatcher(),
  archive: new NoopEventArchive(),
});
await relay.processBatch(100);
```

## Testing

```bash
pnpm --filter @nbcp/outbox test
```

Harness: `@nbcp/outbox/testing`.

## Policy

* ADR-0003, ADR-0004, ADR-0006
* [WP-01 implementation package](../../docs/implementation/wp-01-outbox-implementation-package.md)
* Event `type` ownership remains with producer modules + [event catalog](../../docs/reference/event-catalog.md)
