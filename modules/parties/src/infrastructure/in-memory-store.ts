import type { UnitOfWork } from "@nbcp/outbox";
import type { Party, PartyRelationship } from "../domain/party.js";
import type {
  PartyRepository,
  RelationshipRepository,
} from "../application/ports.js";

export class InMemoryPartyRepository implements PartyRepository {
  private readonly byId = new Map<string, Party>();

  private key(organizationId: string, partyId: string): string {
    return `${organizationId}:${partyId}`;
  }

  async save(_uow: UnitOfWork, party: Party): Promise<void> {
    this.byId.set(
      this.key(party.organizationId, party.partyId),
      structuredClone(party),
    );
  }

  async findById(
    organizationId: string,
    partyId: string,
  ): Promise<Party | null> {
    const p = this.byId.get(this.key(organizationId, partyId));
    return p ? structuredClone(p) : null;
  }

  async findByPrincipal(
    organizationId: string,
    principalId: string,
  ): Promise<Party | null> {
    for (const p of this.byId.values()) {
      if (
        p.organizationId === organizationId &&
        p.principalId === principalId &&
        p.status !== "deleted" &&
        p.status !== "merged"
      ) {
        return structuredClone(p);
      }
    }
    return null;
  }

  async list(input: {
    organizationId: string;
    roleKey?: string;
    status?: string;
    kind?: string;
    text?: string;
  }): Promise<Party[]> {
    let rows = [...this.byId.values()].filter(
      (p) => p.organizationId === input.organizationId,
    );
    if (input.status) {
      rows = rows.filter((p) => p.status === input.status);
    } else {
      rows = rows.filter((p) => p.status !== "deleted");
    }
    if (input.kind) {
      rows = rows.filter((p) => p.kind === input.kind);
    }
    if (input.roleKey) {
      const role = input.roleKey;
      rows = rows.filter((p) =>
        p.classifications.some((c) => c.roleKey === role),
      );
    }
    if (input.text) {
      const q = input.text.toLowerCase();
      rows = rows.filter((p) => p.displayName.toLowerCase().includes(q));
    }
    return rows.map((p) => structuredClone(p));
  }
}

export class InMemoryRelationshipRepository implements RelationshipRepository {
  private readonly byId = new Map<string, PartyRelationship>();

  async save(_uow: UnitOfWork, relationship: PartyRelationship): Promise<void> {
    this.byId.set(relationship.relationshipId, structuredClone(relationship));
  }

  async findById(
    organizationId: string,
    relationshipId: string,
  ): Promise<PartyRelationship | null> {
    const r = this.byId.get(relationshipId);
    if (!r || r.organizationId !== organizationId) return null;
    return structuredClone(r);
  }

  async findActive(
    organizationId: string,
    fromPartyId: string,
    toPartyId: string,
    relationshipType: string,
  ): Promise<PartyRelationship | null> {
    for (const r of this.byId.values()) {
      if (
        r.organizationId === organizationId &&
        r.fromPartyId === fromPartyId &&
        r.toPartyId === toPartyId &&
        r.relationshipType === relationshipType &&
        r.removedAt === null
      ) {
        return structuredClone(r);
      }
    }
    return null;
  }

  async listForParty(
    organizationId: string,
    partyId: string,
  ): Promise<PartyRelationship[]> {
    return [...this.byId.values()]
      .filter(
        (r) =>
          r.organizationId === organizationId &&
          r.removedAt === null &&
          (r.fromPartyId === partyId || r.toPartyId === partyId),
      )
      .map((r) => structuredClone(r));
  }
}
