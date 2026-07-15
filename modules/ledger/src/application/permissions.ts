/** Permission catalog keys owned by Ledger. */
export const LedgerPermissions = {
  AccountRead: "ledger.account.read",
  AccountManage: "ledger.account.manage",
  JournalRead: "ledger.journal.read",
  JournalPost: "ledger.journal.post",
  JournalReverse: "ledger.journal.reverse",
} as const;

export type LedgerPermission =
  (typeof LedgerPermissions)[keyof typeof LedgerPermissions];

export const LEDGER_PERMISSION_KEYS: readonly string[] = Object.values(
  LedgerPermissions,
);
