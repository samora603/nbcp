export const RbacEventTypes = {
  PermissionRegistered: "rbac.permission.registered",
  PermissionDeprecated: "rbac.permission.deprecated",
  RoleCreated: "rbac.role.created",
  RoleUpdated: "rbac.role.updated",
  RoleDeleted: "rbac.role.deleted",
  RoleAssignmentGranted: "rbac.role_assignment.granted",
  RoleAssignmentRevoked: "rbac.role_assignment.revoked",
  RoleAssignmentScopeChanged: "rbac.role_assignment.scope_changed",
} as const;

export type RbacEventType =
  (typeof RbacEventTypes)[keyof typeof RbacEventTypes];

export const RBAC_EVENT_TYPE_SET: ReadonlySet<string> = new Set(
  Object.values(RbacEventTypes),
);
