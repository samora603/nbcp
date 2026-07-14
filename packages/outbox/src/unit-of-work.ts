import type { DomainEventEnvelope } from "./envelope.js";
import type { OutboxRecord, OutboxStore } from "./outbox-store.js";
import { validateEnvelope } from "./validate-envelope.js";
import {
  DuplicateEventIdError,
  InactiveUnitOfWorkError,
  UnitOfWorkStateError,
} from "./errors.js";

export type MutationCallback = () => void | Promise<void>;

/**
 * Transactional boundary: aggregate mutations + outbox appends commit or roll back together.
 */
export interface UnitOfWork {
  readonly id: string;
  readonly isActive: boolean;

  /** Stage a mutation applied only on commit. */
  stageMutation(mutation: MutationCallback): void;

  /**
   * Validate and stage an outbox append within this UoW.
   * Durability occurs only on {@link commit}.
   */
  appendOutbox(envelope: DomainEventEnvelope): void;

  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface UnitOfWorkFactory {
  start(): UnitOfWork;
}

export interface InMemoryUnitOfWorkOptions {
  store: OutboxStore;
  /** Optional clock for createdAt; defaults to Date.now ISO. */
  now?: () => string;
}

/**
 * In-memory UoW that stages mutations and outbox rows until commit.
 * Production adapters wrap a real DB transaction with the same port.
 */
export class InMemoryUnitOfWork implements UnitOfWork {
  readonly id: string;
  private active = true;
  private settled = false;
  private readonly mutations: MutationCallback[] = [];
  private readonly pending: OutboxRecord[] = [];
  private readonly pendingIds = new Set<string>();

  constructor(
    id: string,
    private readonly store: OutboxStore,
    private readonly now: () => string,
  ) {
    this.id = id;
  }

  get isActive(): boolean {
    return this.active && !this.settled;
  }

  stageMutation(mutation: MutationCallback): void {
    this.assertActive();
    this.mutations.push(mutation);
  }

  appendOutbox(envelope: DomainEventEnvelope): void {
    this.assertActive();
    validateEnvelope(envelope);

    if (this.pendingIds.has(envelope.eventId)) {
      throw new DuplicateEventIdError(envelope.eventId);
    }

    this.pending.push({
      envelope: structuredClone(envelope),
      status: "unpublished",
      createdAt: this.now(),
      publishedAt: null,
      attemptCount: 0,
      lastError: null,
    });
    this.pendingIds.add(envelope.eventId);
  }

  async commit(): Promise<void> {
    this.assertActive();
    this.active = false;

    for (const id of this.pendingIds) {
      if (await this.store.hasEventId(id)) {
        this.settled = true;
        throw new DuplicateEventIdError(id);
      }
    }

    for (const mutation of this.mutations) {
      await mutation();
    }

    if (this.pending.length > 0) {
      await this.store.insertUnpublished(this.pending);
    }

    this.settled = true;
  }

  async rollback(): Promise<void> {
    if (this.settled) {
      throw new UnitOfWorkStateError("Unit of work already settled");
    }
    this.active = false;
    this.settled = true;
    this.mutations.length = 0;
    this.pending.length = 0;
    this.pendingIds.clear();
  }

  private assertActive(): void {
    if (!this.isActive) {
      throw new InactiveUnitOfWorkError();
    }
  }
}

export class InMemoryUnitOfWorkFactory implements UnitOfWorkFactory {
  private seq = 0;

  constructor(private readonly options: InMemoryUnitOfWorkOptions) {}

  start(): UnitOfWork {
    this.seq += 1;
    const now = this.options.now ?? (() => new Date().toISOString());
    return new InMemoryUnitOfWork(
      `uow-${this.seq}`,
      this.options.store,
      now,
    );
  }
}
