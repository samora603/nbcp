import type { UnitOfWork } from "@nbcp/outbox";
import type { Journal } from "../domain/journal.js";
import type { JournalRepository } from "../application/ports.js";
import { ImmutableJournalError } from "../domain/errors.js";

function linesEqual(
  a: Journal["lines"],
  b: Journal["lines"],
): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (line, i) =>
      line.accountCode === b[i]!.accountCode &&
      line.direction === b[i]!.direction &&
      line.amountMinor === b[i]!.amountMinor &&
      line.currency === b[i]!.currency,
  );
}

export class InMemoryJournalRepository implements JournalRepository {
  private readonly byId = new Map<string, Journal>();
  private readonly bySourceEvent = new Map<string, Journal>();

  private idKey(organizationId: string, journalId: string): string {
    return `${organizationId}:${journalId}`;
  }

  private sourceKey(organizationId: string, sourceEventId: string): string {
    return `${organizationId}:${sourceEventId}`;
  }

  async save(uow: UnitOfWork, journal: Journal): Promise<void> {
    const existing = this.byId.get(
      this.idKey(journal.organizationId, journal.journalId),
    );
    if (existing) {
      if (existing.status === "reversed") {
        throw new ImmutableJournalError(
          `journal ${journal.journalId} is reversed and immutable`,
        );
      }
      if (existing.status === "posted") {
        const reversalMetadataOnly =
          journal.status === "reversed" && linesEqual(existing.lines, journal.lines);
        if (!reversalMetadataOnly) {
          throw new ImmutableJournalError(
            `cannot mutate posted journal ${journal.journalId}`,
          );
        }
      }
    }

    const snapshot = structuredClone(journal);
    const idK = this.idKey(journal.organizationId, journal.journalId);
    const srcK = this.sourceKey(journal.organizationId, journal.sourceEventId);
    uow.stageMutation(() => {
      this.byId.set(idK, snapshot);
      this.bySourceEvent.set(srcK, snapshot);
    });
  }

  async findById(
    organizationId: string,
    journalId: string,
  ): Promise<Journal | null> {
    const journal = this.byId.get(this.idKey(organizationId, journalId));
    return journal ? structuredClone(journal) : null;
  }

  async findBySourceEventId(
    organizationId: string,
    sourceEventId: string,
  ): Promise<Journal | null> {
    const journal = this.bySourceEvent.get(
      this.sourceKey(organizationId, sourceEventId),
    );
    return journal ? structuredClone(journal) : null;
  }

  async list(input: {
    organizationId: string;
    status?: string;
    sourceEventType?: string;
  }): Promise<Journal[]> {
    let rows = [...this.byId.values()].filter(
      (j) => j.organizationId === input.organizationId,
    );
    if (input.status) {
      rows = rows.filter((j) => j.status === input.status);
    }
    if (input.sourceEventType) {
      rows = rows.filter((j) => j.sourceEventType === input.sourceEventType);
    }
    return rows.map((j) => structuredClone(j));
  }
}
