export interface Session {
  sessionId: string;
  principalId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export function isSessionActive(session: Session, nowIso: string): boolean {
  return session.revokedAt === null && session.expiresAt > nowIso;
}
