import { randomUUID } from "node:crypto";
import type { UnitOfWork } from "@nbcp/outbox";
import type { DomainEventEnvelope } from "@nbcp/outbox";
import type { IdentityRuntime } from "./ports.js";
import {
  canAuthenticate,
  normalizeEmail,
  toPublicView,
  type User,
  type UserPublicView,
} from "../domain/user.js";
import type { Session } from "../domain/session.js";
import { IdentityEventTypes } from "../domain/events.js";
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../domain/errors.js";

export interface RegisterLocalUserInput {
  email: string;
  password: string;
  displayName?: string;
}

export interface AuthenticateLocalInput {
  email: string;
  password: string;
}

export interface AuthenticateLocalResult {
  principalId: string;
  sessionId: string;
  rawSessionToken: string;
  user: UserPublicView;
}

/**
 * Identity application facade (WP-02).
 * All SECURITY mutations append outbox envelopes in the same unit of work.
 */
export class IdentityService {
  constructor(private readonly runtime: IdentityRuntime) {}

  private publish(
    uow: UnitOfWork,
    type: string,
    payload: Record<string, unknown>,
  ): DomainEventEnvelope {
    const envelope: DomainEventEnvelope = {
      eventId: randomUUID(),
      type,
      version: 1,
      occurredAt: this.runtime.clock.now(),
      producer: "identity",
      organizationId: null,
      correlationId: null,
      payload,
    };
    this.runtime.outbox.append(uow, envelope);
    return envelope;
  }

  private async requireUser(principalId: string): Promise<User> {
    const user = await this.runtime.users.findById(principalId);
    if (!user || user.status === "deleted") {
      throw new NotFoundError(`User not found: ${principalId}`);
    }
    return user;
  }

  private addHours(iso: string, hours: number): string {
    const d = new Date(iso);
    d.setUTCHours(d.getUTCHours() + hours);
    return d.toISOString();
  }

  private addMinutes(iso: string, minutes: number): string {
    const d = new Date(iso);
    d.setUTCMinutes(d.getUTCMinutes() + minutes);
    return d.toISOString();
  }

  async registerLocalUser(
    input: RegisterLocalUserInput,
  ): Promise<{ user: UserPublicView; verificationToken: string }> {
    if (!input.email?.trim() || !input.password || input.password.length < 8) {
      throw new ValidationError("email and password (min 8) required");
    }
    const emailNormalized = normalizeEmail(input.email);
    const existing =
      await this.runtime.users.findByEmailNormalized(emailNormalized);
    if (existing) {
      throw new ConflictError("email already registered");
    }

    const now = this.runtime.clock.now();
    const principalId = this.runtime.ids.id();
    const passwordHash = await this.runtime.hasher.hash(input.password);
    const verificationToken = this.runtime.tokens.token();

    const user: User = {
      principalId,
      email: input.email.trim(),
      emailNormalized,
      displayName: input.displayName ?? null,
      status: "pending_verification",
      passwordHash,
      emailVerifiedAt: null,
      failedLoginCount: 0,
      lockedUntil: null,
      externalIdentities: [],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    const uow = this.runtime.uowFactory.start();
    await this.runtime.users.save(uow, user);
    this.publish(uow, IdentityEventTypes.UserRegistered, {
      principalId,
    });
    await uow.commit();

    await this.runtime.mail?.enqueueEmailVerification?.({
      email: user.email,
      principalId,
      rawToken: verificationToken,
    });

    // Store verification token hash on a lightweight side channel: encode in
    // memory map via password-reset-like pattern — use reset repo with type flag
    // For WP-02: return raw token to caller (tests); production uses mail port.
    await this.storeVerificationToken(principalId, verificationToken);

    return { user: toPublicView(user), verificationToken };
  }

  /** In-memory verification tokens for WP-02 (separate from password reset). */
  private readonly emailVerifyTokens = new Map<string, string>();

  private async storeVerificationToken(
    principalId: string,
    raw: string,
  ): Promise<void> {
    this.emailVerifyTokens.set(this.runtime.hashToken(raw), principalId);
  }

  async verifyEmail(input: {
    principalId: string;
    token: string;
  }): Promise<UserPublicView> {
    const expected = this.emailVerifyTokens.get(
      this.runtime.hashToken(input.token),
    );
    if (expected !== input.principalId) {
      throw new ValidationError("invalid verification token");
    }

    const user = await this.requireUser(input.principalId);
    if (user.emailVerifiedAt) {
      return toPublicView(user);
    }

    const now = this.runtime.clock.now();
    user.emailVerifiedAt = now;
    user.status = "active";
    user.updatedAt = now;

    const uow = this.runtime.uowFactory.start();
    await this.runtime.users.save(uow, user);
    this.publish(uow, IdentityEventTypes.UserEmailVerified, {
      principalId: user.principalId,
    });
    this.publish(uow, IdentityEventTypes.UserActivated, {
      principalId: user.principalId,
    });
    await uow.commit();

    this.emailVerifyTokens.delete(this.runtime.hashToken(input.token));
    return toPublicView(user);
  }

  async authenticateLocal(
    input: AuthenticateLocalInput,
  ): Promise<AuthenticateLocalResult> {
    const emailNormalized = normalizeEmail(input.email);
    const user =
      await this.runtime.users.findByEmailNormalized(emailNormalized);
    if (!user || !user.passwordHash) {
      throw new AuthenticationError("invalid_credentials");
    }

    const now = this.runtime.clock.now();
    const allowed = canAuthenticate(user, now);
    if (!allowed.ok) {
      throw new AuthenticationError(allowed.reason);
    }

    const ok = await this.runtime.hasher.verify(
      input.password,
      user.passwordHash,
    );
    if (!ok) {
      return this.recordFailedLogin(user);
    }

    user.failedLoginCount = 0;
    user.lockedUntil = null;
    user.updatedAt = now;

    const rawSessionToken = this.runtime.tokens.token();
    const session = this.buildSession(user.principalId, rawSessionToken, now);

    const uow = this.runtime.uowFactory.start();
    await this.runtime.users.save(uow, user);
    await this.runtime.sessions.save(uow, session);
    this.publish(uow, IdentityEventTypes.SessionIssued, {
      principalId: user.principalId,
      sessionId: session.sessionId,
    });
    await uow.commit();

    return {
      principalId: user.principalId,
      sessionId: session.sessionId,
      rawSessionToken,
      user: toPublicView(user),
    };
  }

  private async recordFailedLogin(user: User): Promise<never> {
    const now = this.runtime.clock.now();
    const max = this.runtime.maxFailedLogins ?? 5;
    const lockMinutes = this.runtime.lockoutMinutes ?? 15;
    user.failedLoginCount += 1;
    user.updatedAt = now;

    let lockedOut = false;
    if (user.failedLoginCount >= max) {
      user.lockedUntil = this.addMinutes(now, lockMinutes);
      lockedOut = true;
    }

    const uow = this.runtime.uowFactory.start();
    await this.runtime.users.save(uow, user);
    if (lockedOut) {
      this.publish(uow, IdentityEventTypes.UserLockedOut, {
        principalId: user.principalId,
        lockedUntil: user.lockedUntil,
      });
    }
    await uow.commit();
    throw new AuthenticationError(lockedOut ? "locked" : "invalid_credentials");
  }

  private buildSession(
    principalId: string,
    rawToken: string,
    now: string,
  ): Session {
    const ttl = this.runtime.sessionTtlHours ?? 24;
    return {
      sessionId: this.runtime.ids.id(),
      principalId,
      tokenHash: this.runtime.hashToken(rawToken),
      createdAt: now,
      expiresAt: this.addHours(now, ttl),
      revokedAt: null,
    };
  }

  async requestPasswordReset(input: {
    email: string;
  }): Promise<{ accepted: true }> {
    const emailNormalized = normalizeEmail(input.email);
    const user =
      await this.runtime.users.findByEmailNormalized(emailNormalized);
    // Anti-enumeration: always accept
    if (!user) {
      return { accepted: true };
    }

    const now = this.runtime.clock.now();
    const rawToken = this.runtime.tokens.token();
    const ttl = this.runtime.resetTtlMinutes ?? 30;
    const challenge = {
      challengeId: this.runtime.ids.id(),
      principalId: user.principalId,
      tokenHash: this.runtime.hashToken(rawToken),
      createdAt: now,
      expiresAt: this.addMinutes(now, ttl),
      consumedAt: null,
    };

    const uow = this.runtime.uowFactory.start();
    await this.runtime.resets.save(uow, challenge);
    this.publish(uow, IdentityEventTypes.PasswordResetRequested, {
      principalId: user.principalId,
    });
    await uow.commit();

    await this.runtime.mail?.enqueuePasswordReset?.({
      email: user.email,
      principalId: user.principalId,
      rawToken,
    });

    // Expose for tests when no mail port captures token
    (
      this as unknown as { lastResetToken?: string }
    ).lastResetToken = rawToken;

    return { accepted: true };
  }

  /** Test/support accessor for last reset token when mail port absent. */
  getLastResetTokenForTests(): string | undefined {
    return (this as unknown as { lastResetToken?: string }).lastResetToken;
  }

  async resetPassword(input: {
    token: string;
    newPassword: string;
  }): Promise<UserPublicView> {
    if (!input.newPassword || input.newPassword.length < 8) {
      throw new ValidationError("password min 8");
    }
    const now = this.runtime.clock.now();
    const challenge = await this.runtime.resets.findOpenByTokenHash(
      this.runtime.hashToken(input.token),
      now,
    );
    if (!challenge) {
      throw new ValidationError("invalid or expired reset token");
    }

    const user = await this.requireUser(challenge.principalId);
    user.passwordHash = await this.runtime.hasher.hash(input.newPassword);
    user.failedLoginCount = 0;
    user.lockedUntil = null;
    user.updatedAt = now;
    challenge.consumedAt = now;

    const uow = this.runtime.uowFactory.start();
    await this.runtime.users.save(uow, user);
    await this.runtime.resets.save(uow, challenge);
    await this.revokeAllSessionsInUow(uow, user.principalId, now);
    this.publish(uow, IdentityEventTypes.UserPasswordChanged, {
      principalId: user.principalId,
    });
    this.publish(uow, IdentityEventTypes.PasswordResetCompleted, {
      principalId: user.principalId,
    });
    await uow.commit();
    return toPublicView(user);
  }

  async changePassword(input: {
    principalId: string;
    currentPassword: string;
    newPassword: string;
  }): Promise<UserPublicView> {
    if (!input.newPassword || input.newPassword.length < 8) {
      throw new ValidationError("password min 8");
    }
    const user = await this.requireUser(input.principalId);
    if (!user.passwordHash) {
      throw new ValidationError("no local password");
    }
    const ok = await this.runtime.hasher.verify(
      input.currentPassword,
      user.passwordHash,
    );
    if (!ok) {
      throw new AuthenticationError("invalid_credentials");
    }

    const now = this.runtime.clock.now();
    user.passwordHash = await this.runtime.hasher.hash(input.newPassword);
    user.updatedAt = now;

    const uow = this.runtime.uowFactory.start();
    await this.runtime.users.save(uow, user);
    await this.revokeAllSessionsInUow(uow, user.principalId, now);
    this.publish(uow, IdentityEventTypes.UserPasswordChanged, {
      principalId: user.principalId,
    });
    await uow.commit();
    return toPublicView(user);
  }

  private async revokeAllSessionsInUow(
    uow: UnitOfWork,
    principalId: string,
    now: string,
  ): Promise<void> {
    const sessions = await this.runtime.sessions.listActiveByPrincipal(
      principalId,
      now,
    );
    for (const session of sessions) {
      session.revokedAt = now;
      await this.runtime.sessions.save(uow, session);
      this.publish(uow, IdentityEventTypes.SessionRevoked, {
        principalId,
        sessionId: session.sessionId,
      });
    }
  }

  async suspendUser(principalId: string): Promise<UserPublicView> {
    return this.setStatus(principalId, "suspended", IdentityEventTypes.UserSuspended, true);
  }

  async activateUser(principalId: string): Promise<UserPublicView> {
    return this.setStatus(principalId, "active", IdentityEventTypes.UserActivated, false);
  }

  async deactivateUser(principalId: string): Promise<UserPublicView> {
    return this.setStatus(
      principalId,
      "deactivated",
      IdentityEventTypes.UserDeactivated,
      true,
    );
  }

  async deleteUser(principalId: string): Promise<UserPublicView> {
    const user = await this.requireUser(principalId);
    const now = this.runtime.clock.now();
    user.status = "deleted";
    user.deletedAt = now;
    user.updatedAt = now;

    const uow = this.runtime.uowFactory.start();
    await this.runtime.users.save(uow, user);
    await this.revokeAllSessionsInUow(uow, principalId, now);
    this.publish(uow, IdentityEventTypes.UserDeleted, { principalId });
    await uow.commit();
    return toPublicView(user);
  }

  private async setStatus(
    principalId: string,
    status: User["status"],
    eventType: string,
    revokeSessions: boolean,
  ): Promise<UserPublicView> {
    const user = await this.requireUser(principalId);
    const now = this.runtime.clock.now();
    user.status = status;
    user.updatedAt = now;

    const uow = this.runtime.uowFactory.start();
    await this.runtime.users.save(uow, user);
    if (revokeSessions) {
      await this.revokeAllSessionsInUow(uow, principalId, now);
    }
    this.publish(uow, eventType, { principalId });
    await uow.commit();
    return toPublicView(user);
  }

  async lockUser(input: {
    principalId: string;
    until?: string;
  }): Promise<UserPublicView> {
    const user = await this.requireUser(input.principalId);
    const now = this.runtime.clock.now();
    user.lockedUntil =
      input.until ?? this.addMinutes(now, this.runtime.lockoutMinutes ?? 15);
    user.updatedAt = now;

    const uow = this.runtime.uowFactory.start();
    await this.runtime.users.save(uow, user);
    this.publish(uow, IdentityEventTypes.UserLockedOut, {
      principalId: user.principalId,
      lockedUntil: user.lockedUntil,
    });
    await uow.commit();
    return toPublicView(user);
  }

  async unlockUser(principalId: string): Promise<UserPublicView> {
    const user = await this.requireUser(principalId);
    const now = this.runtime.clock.now();
    user.lockedUntil = null;
    user.failedLoginCount = 0;
    user.updatedAt = now;

    const uow = this.runtime.uowFactory.start();
    await this.runtime.users.save(uow, user);
    this.publish(uow, IdentityEventTypes.UserUnlock, { principalId });
    await uow.commit();
    return toPublicView(user);
  }

  async linkExternalIdentity(input: {
    principalId: string;
    issuer: string;
    subject: string;
  }): Promise<UserPublicView> {
    const taken = await this.runtime.users.findByExternalIdentity(
      input.issuer,
      input.subject,
    );
    if (taken && taken.principalId !== input.principalId) {
      throw new ConflictError("external identity already linked");
    }
    const user = await this.requireUser(input.principalId);
    if (
      user.externalIdentities.some(
        (l) => l.issuer === input.issuer && l.subject === input.subject,
      )
    ) {
      return toPublicView(user);
    }
    const now = this.runtime.clock.now();
    user.externalIdentities.push({
      issuer: input.issuer,
      subject: input.subject,
      linkedAt: now,
    });
    user.updatedAt = now;

    const uow = this.runtime.uowFactory.start();
    await this.runtime.users.save(uow, user);
    this.publish(uow, IdentityEventTypes.ExternalIdentityLinked, {
      principalId: user.principalId,
      issuer: input.issuer,
      subject: input.subject,
    });
    await uow.commit();
    return toPublicView(user);
  }

  async unlinkExternalIdentity(input: {
    principalId: string;
    issuer: string;
    subject: string;
  }): Promise<UserPublicView> {
    const user = await this.requireUser(input.principalId);
    user.externalIdentities = user.externalIdentities.filter(
      (l) => !(l.issuer === input.issuer && l.subject === input.subject),
    );
    user.updatedAt = this.runtime.clock.now();

    const uow = this.runtime.uowFactory.start();
    await this.runtime.users.save(uow, user);
    this.publish(uow, IdentityEventTypes.ExternalIdentityUnlinked, {
      principalId: user.principalId,
      issuer: input.issuer,
      subject: input.subject,
    });
    await uow.commit();
    return toPublicView(user);
  }

  async revokeSession(sessionId: string): Promise<void> {
    const session = await this.runtime.sessions.findById(sessionId);
    if (!session || session.revokedAt) {
      return;
    }
    const now = this.runtime.clock.now();
    session.revokedAt = now;
    const uow = this.runtime.uowFactory.start();
    await this.runtime.sessions.save(uow, session);
    this.publish(uow, IdentityEventTypes.SessionRevoked, {
      principalId: session.principalId,
      sessionId: session.sessionId,
    });
    await uow.commit();
  }

  async revokeAllSessions(principalId: string): Promise<void> {
    const now = this.runtime.clock.now();
    const uow = this.runtime.uowFactory.start();
    await this.revokeAllSessionsInUow(uow, principalId, now);
    await uow.commit();
  }

  async getUserById(principalId: string): Promise<UserPublicView | null> {
    const user = await this.runtime.users.findById(principalId);
    if (!user || user.status === "deleted") {
      return null;
    }
    return toPublicView(user);
  }

  async findUserByEmail(email: string): Promise<UserPublicView | null> {
    const user = await this.runtime.users.findByEmailNormalized(
      normalizeEmail(email),
    );
    return user ? toPublicView(user) : null;
  }

  async resolveSession(
    rawToken: string,
  ): Promise<{ principalId: string; sessionId: string } | null> {
    const session = await this.runtime.sessions.findByTokenHash(
      this.runtime.hashToken(rawToken),
    );
    const now = this.runtime.clock.now();
    if (!session || session.revokedAt || session.expiresAt <= now) {
      return null;
    }
    return {
      principalId: session.principalId,
      sessionId: session.sessionId,
    };
  }

  async isAuthenticationAllowed(principalId: string): Promise<boolean> {
    const user = await this.runtime.users.findById(principalId);
    if (!user) {
      return false;
    }
    return canAuthenticate(user, this.runtime.clock.now()).ok;
  }

  async listExternalIdentities(principalId: string) {
    const user = await this.requireUser(principalId);
    return user.externalIdentities.map((l) => ({
      issuer: l.issuer,
      subject: l.subject,
      linkedAt: l.linkedAt,
    }));
  }
}
