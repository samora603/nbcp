export type JournalStatus = "draft" | "posted" | "reversed";

export type LineDirection = "debit" | "credit";

export interface JournalLine {
  journalLineId: string;
  journalId: string;
  accountCode: string;
  direction: LineDirection;
  amountMinor: number;
  currency: string;
  description: string;
}

export interface Journal {
  journalId: string;
  organizationId: string;
  sourceEventId: string;
  sourceEventType: string;
  externalRef: string;
  status: JournalStatus;
  lines: JournalLine[];
  reversesJournalId: string | null;
  reversedByJournalId: string | null;
  postedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type JournalView = Journal;

export function toJournalView(journal: Journal): JournalView {
  return structuredClone(journal);
}

export function sumDebits(lines: readonly JournalLine[]): number {
  return lines
    .filter((l) => l.direction === "debit")
    .reduce((sum, l) => sum + l.amountMinor, 0);
}

export function sumCredits(lines: readonly JournalLine[]): number {
  return lines
    .filter((l) => l.direction === "credit")
    .reduce((sum, l) => sum + l.amountMinor, 0);
}

export function isBalanced(lines: readonly JournalLine[]): boolean {
  if (lines.length < 2) {
    return false;
  }
  return sumDebits(lines) === sumCredits(lines);
}

export function assertBalanced(lines: readonly JournalLine[]): void {
  if (!isBalanced(lines)) {
    throw new Error(
      `journal unbalanced: debits=${sumDebits(lines)} credits=${sumCredits(lines)}`,
    );
  }
}

export function assertImmutable(journal: Journal): void {
  if (journal.status === "posted" || journal.status === "reversed") {
    throw new Error(`journal is immutable in status: ${journal.status}`);
  }
}

export function reverseLines(
  journal: Journal,
  newJournalId: string,
  lineIds: { id: () => string },
): JournalLine[] {
  return journal.lines.map((line) => ({
    journalLineId: lineIds.id(),
    journalId: newJournalId,
    accountCode: line.accountCode,
    direction: line.direction === "debit" ? "credit" : "debit",
    amountMinor: line.amountMinor,
    currency: line.currency,
    description: `Reversal: ${line.description}`,
  }));
}
