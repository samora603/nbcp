/**
 * Core permission keys seeded from docs/reference/permission-catalog.md.
 * Product/shared pack keys are registered later — not inventable at runtime without catalog.
 */
export const CORE_PERMISSION_SEEDS: ReadonlyArray<{
  key: string;
  description: string;
}> = [
  { key: "identity.user.read", description: "View user profile / status (support)" },
  { key: "identity.user.manage", description: "Activate / suspend / deactivate / unlock users" },
  { key: "identity.session.revoke", description: "Force-revoke sessions" },
  {
    key: "identity.external_identity.manage",
    description: "Link/unlink external identities",
  },
  { key: "tenancy.organization.read", description: "View organization profile" },
  { key: "tenancy.organization.manage", description: "Update org settings" },
  { key: "tenancy.location.read", description: "View locations" },
  { key: "tenancy.location.manage", description: "Create/update/deactivate locations" },
  { key: "tenancy.membership.read", description: "List/view memberships" },
  { key: "tenancy.membership.manage", description: "Add/remove/suspend members" },
  { key: "tenancy.invitation.manage", description: "Create/revoke invitations" },
  {
    key: "tenancy.organization.transfer_owner",
    description: "Transfer organization owner",
  },
  { key: "rbac.permission.read", description: "View permission catalog" },
  { key: "rbac.role.read", description: "View roles" },
  { key: "rbac.role.manage", description: "Create/update/delete org roles" },
  { key: "rbac.assignment.manage", description: "Grant/revoke role assignments" },
  { key: "rbac.assignment.read", description: "View assignments" },
  { key: "audit.read", description: "Query audit records" },
  { key: "audit.retention.manage", description: "Trigger archive/purge workflows" },
];

/** Permissions bound to organization.administrator system role. */
export const ORGANIZATION_ADMINISTRATOR_PERMISSIONS: readonly string[] = [
  "tenancy.organization.read",
  "tenancy.organization.manage",
  "tenancy.location.read",
  "tenancy.location.manage",
  "tenancy.membership.read",
  "tenancy.membership.manage",
  "tenancy.invitation.manage",
  "tenancy.organization.transfer_owner",
  "rbac.permission.read",
  "rbac.role.read",
  "rbac.role.manage",
  "rbac.assignment.manage",
  "rbac.assignment.read",
  "audit.read",
];
