export type InvitationState =
  | "pending"
  | "accepted"
  | "declined"
  | "revoked"
  | "expired";

export interface Invitation {
  invitationId: string;
  organizationId: string;
  email: string;
  emailNormalized: string;
  invitedByPrincipalId: string;
  locationId: string | null;
  suggestedRoleKey: string | null;
  tokenHash: string;
  state: InvitationState;
  createdAt: string;
  expiresAt: string;
  acceptedByPrincipalId: string | null;
  updatedAt: string;
}

export function isInvitationAcceptable(
  invitation: Invitation,
  nowIso: string,
): boolean {
  return invitation.state === "pending" && invitation.expiresAt > nowIso;
}

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}
