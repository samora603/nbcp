export type AuthzDenialReason =
  | "permission_unknown"
  | "permission_deprecated"
  | "not_a_member"
  | "membership_inactive"
  | "location_invalid"
  | "permission_denied"
  | "location_out_of_scope";

export interface AuthzDecision {
  allowed: boolean;
  reason?: AuthzDenialReason;
}

export function deny(reason: AuthzDenialReason): AuthzDecision {
  return { allowed: false, reason };
}

export function allow(): AuthzDecision {
  return { allowed: true };
}
