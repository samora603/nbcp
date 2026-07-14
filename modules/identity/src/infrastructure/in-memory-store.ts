import type { UnitOfWork } from "@nbcp/outbox";
import type { User } from "../domain/user.js";
import type { Session } from "../domain/session.js";
import type { PasswordResetChallenge } from "../domain/password-reset.js";
import type {
  PasswordResetRepository,
  SessionRepository,
  UserRepository,
} from "../application/ports.js";
import { isChallengeOpen } from "../domain/password-reset.js";
import { isSessionActive } from "../domain/session.js";

/**
 * In-memory persistence for WP-02 tests and early scaffolding.
 * Mutations are staged on the UoW so rollback discards them.
 */
export class InMemoryUserRepository implements UserRepository {
  private readonly committed = new Map<string, User>();

  async save(uow: UnitOfWork, user: User): Promise<void> {
    const copy = structuredClone(user);
    uow.stageMutation(() => {
      this.committed.set(copy.principalId, structuredClone(copy));
    });
  }

  async findById(principalId: string): Promise<User | null> {
    const u = this.committed.get(principalId);
    return u ? structuredClone(u) : null;
  }

  async findByEmailNormalized(emailNormalized: string): Promise<User | null> {
    for (const u of this.committed.values()) {
      if (u.emailNormalized === emailNormalized && u.status !== "deleted") {
        return structuredClone(u);
      }
    }
    return null;
  }

  async findByExternalIdentity(
    issuer: string,
    subject: string,
  ): Promise<User | null> {
    for (const u of this.committed.values()) {
      if (
        u.externalIdentities.some(
          (l) => l.issuer === issuer && l.subject === subject,
        )
      ) {
        return structuredClone(u);
      }
    }
    return null;
  }

  /** Test helper */
  snapshot(): User[] {
    return [...this.committed.values()].map((u) => structuredClone(u));
  }
}

export class InMemorySessionRepository implements SessionRepository {
  private readonly committed = new Map<string, Session>();

  async save(uow: UnitOfWork, session: Session): Promise<void> {
    const copy = structuredClone(session);
    uow.stageMutation(() => {
      this.committed.set(copy.sessionId, structuredClone(copy));
    });
  }

  async findById(sessionId: string): Promise<Session | null> {
    const s = this.committed.get(sessionId);
    return s ? structuredClone(s) : null;
  }

  async findByTokenHash(tokenHash: string): Promise<Session | null> {
    for (const s of this.committed.values()) {
      if (s.tokenHash === tokenHash) {
        return structuredClone(s);
      }
    }
    return null;
  }

  async listActiveByPrincipal(
    principalId: string,
    nowIso: string,
  ): Promise<Session[]> {
    return [...this.committed.values()]
      .filter(
        (s) => s.principalId === principalId && isSessionActive(s, nowIso),
      )
      .map((s) => structuredClone(s));
  }
}

export class InMemoryPasswordResetRepository
  implements PasswordResetRepository
{
  private readonly committed = new Map<string, PasswordResetChallenge>();

  async save(uow: UnitOfWork, challenge: PasswordResetChallenge): Promise<void> {
    const copy = structuredClone(challenge);
    uow.stageMutation(() => {
      this.committed.set(copy.challengeId, structuredClone(copy));
    });
  }

  async findOpenByTokenHash(
    tokenHash: string,
    nowIso: string,
  ): Promise<PasswordResetChallenge | null> {
    for (const c of this.committed.values()) {
      if (c.tokenHash === tokenHash && isChallengeOpen(c, nowIso)) {
        return structuredClone(c);
      }
    }
    return null;
  }
}
