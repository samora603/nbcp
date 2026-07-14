import type { User } from "../domain/user.js";
import type { Session } from "../domain/session.js";
import type { PasswordResetChallenge } from "../domain/password-reset.js";
import type {
  UnitOfWork,
  UnitOfWorkFactory,
  OutboxWriter,
  DomainEventEnvelope,
} from "@nbcp/outbox";

export interface Clock {
  now(): string;
}

export interface IdGenerator {
  id(): string;
}

export interface TokenGenerator {
  token(): string;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
}

/** Mail / notification port — Identity never imports Notifications module. */
export interface MailPort {
  enqueuePasswordReset?(input: {
    email: string;
    principalId: string;
    rawToken: string;
  }): Promise<void>;
  enqueueEmailVerification?(input: {
    email: string;
    principalId: string;
    rawToken: string;
  }): Promise<void>;
}

export interface UserRepository {
  save(uow: UnitOfWork, user: User): Promise<void>;
  findById(principalId: string): Promise<User | null>;
  findByEmailNormalized(emailNormalized: string): Promise<User | null>;
  findByExternalIdentity(
    issuer: string,
    subject: string,
  ): Promise<User | null>;
}

export interface SessionRepository {
  save(uow: UnitOfWork, session: Session): Promise<void>;
  findById(sessionId: string): Promise<Session | null>;
  findByTokenHash(tokenHash: string): Promise<Session | null>;
  listActiveByPrincipal(
    principalId: string,
    nowIso: string,
  ): Promise<Session[]>;
}

export interface PasswordResetRepository {
  save(uow: UnitOfWork, challenge: PasswordResetChallenge): Promise<void>;
  findOpenByTokenHash(
    tokenHash: string,
    nowIso: string,
  ): Promise<PasswordResetChallenge | null>;
}

export interface IdentityRuntime {
  uowFactory: UnitOfWorkFactory;
  outbox: OutboxWriter;
  users: UserRepository;
  sessions: SessionRepository;
  resets: PasswordResetRepository;
  hasher: PasswordHasher;
  ids: IdGenerator;
  tokens: TokenGenerator;
  clock: Clock;
  hashToken(raw: string): string;
  mail?: MailPort;
  /** Lockout after N failures. */
  maxFailedLogins?: number;
  lockoutMinutes?: number;
  sessionTtlHours?: number;
  resetTtlMinutes?: number;
}

export type PublishEvent = (
  uow: UnitOfWork,
  type: string,
  payload: Record<string, unknown>,
  organizationId?: null,
) => DomainEventEnvelope;
