/** Permission catalog keys owned by RBAC. */
export const RbacPermissions = {
  PermissionRead: "rbac.permission.read",
  RoleRead: "rbac.role.read",
  RoleManage: "rbac.role.manage",
  AssignmentManage: "rbac.assignment.manage",
  AssignmentRead: "rbac.assignment.read",
} as const;

export type RbacPermission =
  (typeof RbacPermissions)[keyof typeof RbacPermissions];
