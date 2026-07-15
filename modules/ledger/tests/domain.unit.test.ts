import { describe, expect, it } from "vitest";
import {
  assertBalanced,
  isBalanced,
  reverseLines,
  sumDebits,
  sumCredits,
  type Journal,
  type JournalLine,
} from "../src/domain/journal.js";
import {
  CONSUMED_PAYMENT_EVENT_TYPES,
  DEFAULT_POSTING_RULE_CONFIG,
  buildCaptureJournalLines,
  buildRefundJournalLines,
} from "../src/domain/posting-rules.js";
import {
  LedgerEventTypes,
  LEDGER_EVENT_TYPE_SET,
} from "../src/domain/events.js";
import { LEDGER_PERMISSION_KEYS } from "../src/application/permissions.js";

describe("ledger domain unit", () => {
  const lineIds = { id: () => `line-${Math.random().toString(16).slice(2)}` };

  it("validates balanced journals", () => {
    const lines: JournalLine[] = [
      {
        journalLineId: "l1",
        journalId: "j1",
        accountCode: "CASH_CLEARING",
        direction: "debit",
        amountMinor: 1000,
        currency: "USD",
        description: "dr",
      },
      {
        journalLineId: "l2",
        journalId: "j1",
        accountCode: "REVENUE",
        direction: "credit",
        amountMinor: 1000,
        currency: "USD",
        description: "cr",
      },
    ];
    expect(isBalanced(lines)).toBe(true);
    expect(sumDebits(lines)).toBe(1000);
    expect(sumCredits(lines)).toBe(1000);
    expect(() => assertBalanced(lines)).not.toThrow();
  });

  it("rejects unbalanced journals", () => {
    const lines: JournalLine[] = [
      {
        journalLineId: "l1",
        journalId: "j1",
        accountCode: "A",
        direction: "debit",
        amountMinor: 1000,
        currency: "USD",
        description: "dr",
      },
      {
        journalLineId: "l2",
        journalId: "j1",
        accountCode: "B",
        direction: "credit",
        amountMinor: 500,
        currency: "USD",
        description: "cr",
      },
    ];
    expect(isBalanced(lines)).toBe(false);
    expect(() => assertBalanced(lines)).toThrow(/unbalanced/);
  });

  it("builds capture posting lines from configurable rules", () => {
    const lines = buildCaptureJournalLines(DEFAULT_POSTING_RULE_CONFIG, {
      journalId: "j1",
      currency: "USD",
      amountMinor: 2500,
      lineIds,
    });
    expect(lines).toHaveLength(2);
    expect(lines[0]?.accountCode).toBe("CASH_CLEARING");
    expect(lines[0]?.direction).toBe("debit");
    expect(lines[1]?.accountCode).toBe("REVENUE");
    expect(lines[1]?.direction).toBe("credit");
    expect(isBalanced(lines)).toBe(true);
  });

  it("builds refund posting lines from configurable rules", () => {
    const lines = buildRefundJournalLines(DEFAULT_POSTING_RULE_CONFIG, {
      journalId: "j1",
      currency: "USD",
      amountMinor: 800,
      lineIds,
    });
    expect(lines[0]?.accountCode).toBe("REFUNDS");
    expect(lines[0]?.direction).toBe("debit");
    expect(lines[1]?.accountCode).toBe("CASH_CLEARING");
    expect(lines[1]?.direction).toBe("credit");
    expect(isBalanced(lines)).toBe(true);
  });

  it("reversal swaps debit and credit", () => {
    const journal: Journal = {
      journalId: "j1",
      organizationId: "org",
      sourceEventId: "evt",
      sourceEventType: CONSUMED_PAYMENT_EVENT_TYPES.PaymentCaptured,
      externalRef: "evt",
      status: "posted",
      lines: buildCaptureJournalLines(DEFAULT_POSTING_RULE_CONFIG, {
        journalId: "j1",
        currency: "USD",
        amountMinor: 100,
        lineIds,
      }),
      reversesJournalId: null,
      reversedByJournalId: null,
      postedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const reversed = reverseLines(journal, "j2", lineIds);
    expect(reversed[0]?.direction).toBe("credit");
    expect(reversed[1]?.direction).toBe("debit");
    expect(isBalanced(reversed)).toBe(true);
  });

  it("event and permission keys match catalog prefixes", () => {
    for (const t of LEDGER_EVENT_TYPE_SET) {
      expect(t.startsWith("ledger.")).toBe(true);
    }
    expect(LedgerEventTypes.JournalPosted).toBe("ledger.journal.posted");
    for (const k of LEDGER_PERMISSION_KEYS) {
      expect(k.startsWith("ledger.")).toBe(true);
    }
  });
});
