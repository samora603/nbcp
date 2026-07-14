import type { UnitOfWork } from "@nbcp/outbox";
import type { Organization } from "../domain/organization.js";
import type { Membership } from "../domain/membership.js";
import type { Invitation } from "../domain/invitation.js";
import type {
  InvitationRepository,
  MembershipRepository,
  OrganizationRepository,
} from "../application/ports.js";

export class InMemoryOrganizationRepository implements OrganizationRepository {
  private readonly committed = new Map<string, Organization>();

  async save(uow: UnitOfWork, org: Organization): Promise<void> {
    const copy = structuredClone(org);
    uow.stageMutation(() => {
      this.committed.set(copy.organizationId, structuredClone(copy));
    });
  }

  async findById(organizationId: string): Promise<Organization | null> {
    const o = this.committed.get(organizationId);
    return o && o.status !== "deleted" ? structuredClone(o) : null;
  }

  async findBySlug(slug: string): Promise<Organization | null> {
    for (const o of this.committed.values()) {
      if (o.slug === slug && o.status !== "deleted") {
        return structuredClone(o);
      }
    }
    return null;
  }

  snapshot(): Organization[] {
    return [...this.committed.values()].map((o) => structuredClone(o));
  }
}

export class InMemoryMembershipRepository implements MembershipRepository {
  private readonly committed = new Map<string, Membership>();

  private key(organizationId: string, principalId: string): string {
    return `${organizationId}::${principalId}`;
  }

  async save(uow: UnitOfWork, membership: Membership): Promise<void> {
    const copy = structuredClone(membership);
    uow.stageMutation(() => {
      this.committed.set(
        this.key(copy.organizationId, copy.principalId),
        structuredClone(copy),
      );
    });
  }

  async find(
    organizationId: string,
    principalId: string,
  ): Promise<Membership | null> {
    const m = this.committed.get(this.key(organizationId, principalId));
    return m ? structuredClone(m) : null;
  }

  async listForOrganization(organizationId: string): Promise<Membership[]> {
    return [...this.committed.values()]
      .filter((m) => m.organizationId === organizationId)
      .map((m) => structuredClone(m));
  }

  async listForPrincipal(principalId: string): Promise<Membership[]> {
    return [...this.committed.values()]
      .filter((m) => m.principalId === principalId)
      .map((m) => structuredClone(m));
  }
}

export class InMemoryInvitationRepository implements InvitationRepository {
  private readonly committed = new Map<string, Invitation>();

  async save(uow: UnitOfWork, invitation: Invitation): Promise<void> {
    const copy = structuredClone(invitation);
    uow.stageMutation(() => {
      this.committed.set(copy.invitationId, structuredClone(copy));
    });
  }

  async findById(invitationId: string): Promise<Invitation | null> {
    const i = this.committed.get(invitationId);
    return i ? structuredClone(i) : null;
  }

  async findByTokenHash(tokenHash: string): Promise<Invitation | null> {
    for (const i of this.committed.values()) {
      if (i.tokenHash === tokenHash) {
        return structuredClone(i);
      }
    }
    return null;
  }
}
