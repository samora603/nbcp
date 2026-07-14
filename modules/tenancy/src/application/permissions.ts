/** Permission catalog keys owned by Tenancy. */
export const TenancyPermissions = {
  OrganizationRead: "tenancy.organization.read",
  OrganizationManage: "tenancy.organization.manage",
  LocationRead: "tenancy.location.read",
  LocationManage: "tenancy.location.manage",
  MembershipRead: "tenancy.membership.read",
  MembershipManage: "tenancy.membership.manage",
  InvitationManage: "tenancy.invitation.manage",
  OrganizationTransferOwner: "tenancy.organization.transfer_owner",
} as const;

export type TenancyPermission =
  (typeof TenancyPermissions)[keyof typeof TenancyPermissions];
