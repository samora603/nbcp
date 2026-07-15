import type { JournalLine } from "./journal.js";

/** Consumed payment event types (Ledger does not import @nbcp/payments). */
export const CONSUMED_PAYMENT_EVENT_TYPES = {
  PaymentCaptured: "payments.payment.captured",
  PaymentRefunded: "payments.payment.refunded",
} as const;

export type ConsumedPaymentEventType =
  (typeof CONSUMED_PAYMENT_EVENT_TYPES)[keyof typeof CONSUMED_PAYMENT_EVENT_TYPES];

export interface AccountPostingSpec {
  accountCode: string;
  description: string;
}

export interface TwoLinePostingRule {
  debit: AccountPostingSpec;
  credit: AccountPostingSpec;
}

export interface PostingRuleConfig {
  paymentCaptured: TwoLinePostingRule;
  paymentRefunded: TwoLinePostingRule;
}

export const DEFAULT_POSTING_RULE_CONFIG: PostingRuleConfig = {
  paymentCaptured: {
    debit: {
      accountCode: "CASH_CLEARING",
      description: "Cash clearing — payment captured",
    },
    credit: {
      accountCode: "REVENUE",
      description: "Revenue — payment captured",
    },
  },
  paymentRefunded: {
    debit: {
      accountCode: "REFUNDS",
      description: "Refunds — payment refunded",
    },
    credit: {
      accountCode: "CASH_CLEARING",
      description: "Cash clearing — payment refunded",
    },
  },
};

export interface BuildJournalLinesInput {
  journalId: string;
  currency: string;
  amountMinor: number;
  lineIds: { id: () => string };
}

export function buildCaptureJournalLines(
  config: PostingRuleConfig,
  input: BuildJournalLinesInput,
): JournalLine[] {
  const rule = config.paymentCaptured;
  return [
    {
      journalLineId: input.lineIds.id(),
      journalId: input.journalId,
      accountCode: rule.debit.accountCode,
      direction: "debit",
      amountMinor: input.amountMinor,
      currency: input.currency,
      description: rule.debit.description,
    },
    {
      journalLineId: input.lineIds.id(),
      journalId: input.journalId,
      accountCode: rule.credit.accountCode,
      direction: "credit",
      amountMinor: input.amountMinor,
      currency: input.currency,
      description: rule.credit.description,
    },
  ];
}

export function buildRefundJournalLines(
  config: PostingRuleConfig,
  input: BuildJournalLinesInput,
): JournalLine[] {
  const rule = config.paymentRefunded;
  return [
    {
      journalLineId: input.lineIds.id(),
      journalId: input.journalId,
      accountCode: rule.debit.accountCode,
      direction: "debit",
      amountMinor: input.amountMinor,
      currency: input.currency,
      description: rule.debit.description,
    },
    {
      journalLineId: input.lineIds.id(),
      journalId: input.journalId,
      accountCode: rule.credit.accountCode,
      direction: "credit",
      amountMinor: input.amountMinor,
      currency: input.currency,
      description: rule.credit.description,
    },
  ];
}
