import type { UnitOfWork, UnitOfWorkFactory, OutboxWriter } from "@nbcp/outbox";
import type { Organization } from "../domain/organization.js";
import type { Membership } from "../domain/membership.js";
import type { Invitation } from "../domain/invitation.js";

/**
 * Narrow Identity facade used by Tenancy — no Identity internals.
 */
export interface IdentityPrincipalLookup {
  getUserById(principalId: string): Promise<{
    principalId: string;
    email: string;
    status: string;
  } | null>;
  isAuthenticationAllowed(principalId: string): Promise<boolean>;
}

export interface Clock {
  now(): string;
}

export interface IdGenerator {
  id(): string;
}

export interface TokenGenerator {
  token(): string;
}

export interface OrganizationRepository {
  save(uow: UnitOfWork, org: Organization): Promise<void>;
  findById(organizationId: string): Promise<Organization | null>;
  findBySlug(slug: string): Promise<Organization | null>;
}

export interface MembershipRepository {
  save(uow: UnitOfWork, membership: Membership): Promise<void>;
  find(
    organizationId: string,
    principalId: string,
  ): Promise<Membership | null>;
  listForOrganization(organizationId: string): Promise<Membership[]>;
  listForPrincipal(principalId: string): Promise<Membership[]>;
}

export interface InvitationRepository {
  save(uow: UnitOfWork, invitation: Invitation): Promise<void>;
  findById(invitationId: string): Promise<Invitation | null>;
  findByTokenHash(tokenHash: string): Promise<Invitation | null>;
}

export interface TenancyRuntime {
  uowFactory: UnitOfWorkFactory;
  outbox: OutboxWriter;
  identity: IdentityPrincipalLookup;
  organizations: OrganizationRepository;
  memberships: MembershipRepository;
  invitations: InvitationRepository;
  ids: IdGenerator;
  tokens: TokenGenerator;
  clock: Clock;
  hashToken(raw: string): string;
  invitationTtlHours?: number;
}
