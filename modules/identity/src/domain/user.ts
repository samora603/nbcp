export type UserStatus =
  | "pending_verification"
  | "active"
  | "suspended"
  | "deactivated"
  | "deleted";

export interface ExternalIdentityLink {
  issuer: string;
  subject: string;
  linkedAt: string;
}

export interface User {
  principalId: string;
  email: string;
  emailNormalized: string;
  displayName: string | null;
  status: UserStatus;
  passwordHash: string | null;
  emailVerifiedAt: string | null;
  failedLoginCount: number;
  lockedUntil: string | null;
  externalIdentities: ExternalIdentityLink[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface UserPublicView {
  principalId: string;
  email: string;
  displayName: string | null;
  status: UserStatus;
  emailVerifiedAt: string | null;
  lockedUntil: string | null;
  createdAt: string;
}

export function toPublicView(user: User): UserPublicView {
  return {
    principalId: user.principalId,
    email: user.email,
    displayName: user.displayName,
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt,
    lockedUntil: user.lockedUntil,
    createdAt: user.createdAt,
  };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function canAuthenticate(
  user: User,
  nowIso: string,
): { ok: true } | { ok: false; reason: string } {
  if (user.status === "deleted") {
    return { ok: false, reason: "deleted" };
  }
  if (user.status === "suspended") {
    return { ok: false, reason: "suspended" };
  }
  if (user.status === "deactivated") {
    return { ok: false, reason: "deactivated" };
  }
  if (user.lockedUntil && user.lockedUntil > nowIso) {
    return { ok: false, reason: "locked" };
  }
  return { ok: true };
}
