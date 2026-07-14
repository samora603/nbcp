import {
  InMemoryOutboxStore,
  InMemoryUnitOfWorkFactory,
  OutboxWriter,
} from "@nbcp/outbox";
import { IdentityService } from "../application/identity-service.js";
import type { IdentityRuntime, MailPort } from "../application/ports.js";
import {
  ScryptPasswordHasher,
  SecureTokenGenerator,
  SystemClock,
  UuidIdGenerator,
  sha256Token,
} from "../infrastructure/crypto.js";
import {
  InMemoryPasswordResetRepository,
  InMemorySessionRepository,
  InMemoryUserRepository,
} from "../infrastructure/in-memory-store.js";

export interface CreateIdentityServiceOptions {
  mail?: MailPort;
  maxFailedLogins?: number;
  /** Shared outbox store (tests asserting events). */
  outboxStore?: InMemoryOutboxStore;
}

export interface IdentityKernel {
  service: IdentityService;
  outboxStore: InMemoryOutboxStore;
  users: InMemoryUserRepository;
}

/**
 * Composition root for tests and early hosts (no Nest wiring yet).
 */
export function createIdentityKernel(
  options: CreateIdentityServiceOptions = {},
): IdentityKernel {
  const outboxStore = options.outboxStore ?? new InMemoryOutboxStore();
  const uowFactory = new InMemoryUnitOfWorkFactory({ store: outboxStore });
  const users = new InMemoryUserRepository();
  const sessions = new InMemorySessionRepository();
  const resets = new InMemoryPasswordResetRepository();

  const runtime: IdentityRuntime = {
    uowFactory,
    outbox: new OutboxWriter(),
    users,
    sessions,
    resets,
    hasher: new ScryptPasswordHasher(),
    ids: new UuidIdGenerator(),
    tokens: new SecureTokenGenerator(),
    clock: new SystemClock(),
    hashToken: sha256Token,
    maxFailedLogins: options.maxFailedLogins ?? 5,
    lockoutMinutes: 15,
    sessionTtlHours: 24,
    resetTtlMinutes: 30,
  };
  if (options.mail) {
    runtime.mail = options.mail;
  }

  return {
    service: new IdentityService(runtime),
    outboxStore,
    users,
  };
}
