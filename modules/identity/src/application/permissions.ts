/**
 * Identity permission keys from the platform permission catalog.
 * Enforcement is host/RBAC later; Identity exports constants only.
 */
export const IdentityPermissions = {
  UserRead: "identity.user.read",
  UserManage: "identity.user.manage",
  SessionRevoke: "identity.session.revoke",
  ExternalIdentityManage: "identity.external_identity.manage",
} as const;

export type IdentityPermission =
  (typeof IdentityPermissions)[keyof typeof IdentityPermissions];
