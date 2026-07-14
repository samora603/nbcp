export type MembershipState =
  | "invited"
  | "active"
  | "suspended"
  | "left"
  | "removed";

export interface Membership {
  membershipId: string;
  organizationId: string;
  principalId: string;
  locationId: string | null;
  state: MembershipState;
  createdAt: string;
  updatedAt: string;
}

export function isTerminalMembership(state: MembershipState): boolean {
  return state === "left" || state === "removed";
}

export function isActiveMembership(state: MembershipState): boolean {
  return state === "active";
}
