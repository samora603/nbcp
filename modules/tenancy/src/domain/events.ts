export const TenancyEventTypes = {
  OrganizationCreated: "tenancy.organization.created",
  OrganizationActivated: "tenancy.organization.activated",
  OrganizationSuspended: "tenancy.organization.suspended",
  OrganizationArchived: "tenancy.organization.archived",
  OrganizationDeleted: "tenancy.organization.deleted",
  OrganizationOwnerTransferred: "tenancy.organization.owner_transferred",
  LocationCreated: "tenancy.location.created",
  LocationUpdated: "tenancy.location.updated",
  LocationDeactivated: "tenancy.location.deactivated",
  MembershipCreated: "tenancy.membership.created",
  MembershipActivated: "tenancy.membership.activated",
  MembershipSuspended: "tenancy.membership.suspended",
  MembershipRemoved: "tenancy.membership.removed",
  MembershipLeft: "tenancy.membership.left",
  InvitationCreated: "tenancy.invitation.created",
  InvitationAccepted: "tenancy.invitation.accepted",
  InvitationDeclined: "tenancy.invitation.declined",
  InvitationRevoked: "tenancy.invitation.revoked",
  InvitationExpired: "tenancy.invitation.expired",
} as const;

export type TenancyEventType =
  (typeof TenancyEventTypes)[keyof typeof TenancyEventTypes];

export const TENANCY_EVENT_TYPE_SET: ReadonlySet<string> = new Set(
  Object.values(TenancyEventTypes),
);
