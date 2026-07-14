export interface PasswordResetChallenge {
  challengeId: string;
  principalId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
}

export function isChallengeOpen(
  challenge: PasswordResetChallenge,
  nowIso: string,
): boolean {
  return challenge.consumedAt === null && challenge.expiresAt > nowIso;
}
