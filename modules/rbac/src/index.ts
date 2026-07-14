export { RbacService } from "./application/rbac-service.js";
export { createRbacKernel } from "./application/create-rbac-kernel.js";
export type {
  CreateRbacKernelOptions,
  RbacKernel,
} from "./application/create-rbac-kernel.js";
export { RbacPermissions } from "./application/permissions.js";
export type { RbacPermission } from "./application/permissions.js";
export {
  CORE_PERMISSION_SEEDS,
  ORGANIZATION_ADMINISTRATOR_PERMISSIONS,
} from "./application/catalog-seeds.js";
export { RbacEventTypes, RBAC_EVENT_TYPE_SET } from "./domain/events.js";
export type { RbacEventType } from "./domain/events.js";
export { ORGANIZATION_ADMINISTRATOR_ROLE_KEY } from "./domain/role.js";
export type { Role, RoleKind } from "./domain/role.js";
export type { RoleAssignment } from "./domain/assignment.js";
export type { PermissionRecord } from "./domain/permission.js";
export type { AuthzDecision, AuthzDenialReason } from "./domain/authz.js";
export {
  RbacError,
  ConflictError,
  NotFoundError,
  ValidationError,
  AuthorizationError,
} from "./domain/errors.js";
export type {
  IdentityPrincipalLookup,
  TenancyAuthzLookup,
  RbacRuntime,
} from "./application/ports.js";
