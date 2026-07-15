export const LedgerEventTypes = {
  JournalPosted: "ledger.journal.posted",
  JournalReversed: "ledger.journal.reversed",
} as const;

export type LedgerEventType =
  (typeof LedgerEventTypes)[keyof typeof LedgerEventTypes];

export const LEDGER_EVENT_TYPE_SET: ReadonlySet<string> = new Set(
  Object.values(LedgerEventTypes),
);
