/** Catalog-aligned Identity event types (SECURITY). */
export const IdentityEventTypes = {
  UserRegistered: "identity.user.registered",
  UserEmailVerified: "identity.user.email_verified",
  UserActivated: "identity.user.activated",
  UserSuspended: "identity.user.suspended",
  UserDeactivated: "identity.user.deactivated",
  UserDeleted: "identity.user.deleted",
  UserPasswordChanged: "identity.user.password_changed",
  UserLockedOut: "identity.user.locked_out",
  UserUnlock: "identity.user.unlock",
  ExternalIdentityLinked: "identity.external_identity.linked",
  ExternalIdentityUnlinked: "identity.external_identity.unlinked",
  SessionIssued: "identity.session.issued",
  SessionRevoked: "identity.session.revoked",
  PasswordResetRequested: "identity.password_reset.requested",
  PasswordResetCompleted: "identity.password_reset.completed",
} as const;

export type IdentityEventType =
  (typeof IdentityEventTypes)[keyof typeof IdentityEventTypes];

export const IDENTITY_EVENT_TYPE_SET: ReadonlySet<string> = new Set(
  Object.values(IdentityEventTypes),
);
