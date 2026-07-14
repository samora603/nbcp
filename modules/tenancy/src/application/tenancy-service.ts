import { randomUUID } from "node:crypto";
import type { UnitOfWork, DomainEventEnvelope } from "@nbcp/outbox";
import type { TenancyRuntime } from "./ports.js";
import {
  toOrganizationView,
  type Organization,
  type OrganizationView,
  type Location,
} from "../domain/organization.js";
import type { Membership } from "../domain/membership.js";
import {
  isActiveMembership,
  isTerminalMembership,
} from "../domain/membership.js";
import {
  isInvitationAcceptable,
  normalizeInviteEmail,
  type Invitation,
} from "../domain/invitation.js";
import { TenancyEventTypes } from "../domain/events.js";
import {
  ConflictError,
  InvitationEmailMismatchError,
  NotFoundError,
  ValidationError,
} from "../domain/errors.js";

export interface TenantContext {
  organizationId: string;
  locationId: string | null;
  principalId: string;
}

/**
 * Tenancy application facade (WP-03).
 * Depends on Identity only via {@link TenancyRuntime.identity} port.
 */
export class TenancyService {
  constructor(private readonly runtime: TenancyRuntime) {}

  private publish(
    uow: UnitOfWork,
    type: string,
    organizationId: string,
    payload: Record<string, unknown>,
  ): DomainEventEnvelope {
    const envelope: DomainEventEnvelope = {
      eventId: randomUUID(),
      type,
      version: 1,
      occurredAt: this.runtime.clock.now(),
      producer: "tenancy",
      organizationId,
      correlationId: null,
      payload,
    };
    this.runtime.outbox.append(uow, envelope);
    return envelope;
  }

  private async requireOrg(organizationId: string): Promise<Organization> {
    const org = await this.runtime.organizations.findById(organizationId);
    if (!org) {
      throw new NotFoundError(`Organization not found: ${organizationId}`);
    }
    return org;
  }

  private async requirePrincipal(principalId: string) {
    const user = await this.runtime.identity.getUserById(principalId);
    if (!user) {
      throw new NotFoundError(`Principal not found: ${principalId}`);
    }
    return user;
  }

  private addHours(iso: string, hours: number): string {
    const d = new Date(iso);
    d.setUTCHours(d.getUTCHours() + hours);
    return d.toISOString();
  }

  async createOrganization(input: {
    name: string;
    slug?: string;
    ownerPrincipalId: string;
  }): Promise<OrganizationView> {
    if (!input.name?.trim()) {
      throw new ValidationError("name required");
    }
    await this.requirePrincipal(input.ownerPrincipalId);
    const allowed = await this.runtime.identity.isAuthenticationAllowed(
      input.ownerPrincipalId,
    );
    if (!allowed) {
      throw new ValidationError("owner principal cannot authenticate");
    }

    const slug = input.slug?.trim()
      ? input.slug.trim().toLowerCase()
      : null;
    if (slug) {
      const taken = await this.runtime.organizations.findBySlug(slug);
      if (taken) {
        throw new ConflictError("slug already in use");
      }
    }

    const now = this.runtime.clock.now();
    const organizationId = this.runtime.ids.id();
    const org: Organization = {
      organizationId,
      name: input.name.trim(),
      slug,
      status: "active",
      ownerPrincipalId: input.ownerPrincipalId,
      locations: [],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    const membership: Membership = {
      membershipId: this.runtime.ids.id(),
      organizationId,
      principalId: input.ownerPrincipalId,
      locationId: null,
      state: "active",
      createdAt: now,
      updatedAt: now,
    };

    const uow = this.runtime.uowFactory.start();
    await this.runtime.organizations.save(uow, org);
    await this.runtime.memberships.save(uow, membership);
    this.publish(uow, TenancyEventTypes.OrganizationCreated, organizationId, {
      organizationId,
      ownerPrincipalId: input.ownerPrincipalId,
      name: org.name,
    });
    this.publish(uow, TenancyEventTypes.MembershipCreated, organizationId, {
      organizationId,
      principalId: input.ownerPrincipalId,
      membershipId: membership.membershipId,
    });
    this.publish(uow, TenancyEventTypes.MembershipActivated, organizationId, {
      organizationId,
      principalId: input.ownerPrincipalId,
      membershipId: membership.membershipId,
    });
    await uow.commit();
    return toOrganizationView(org);
  }

  async activateOrganization(organizationId: string): Promise<OrganizationView> {
    const org = await this.requireOrg(organizationId);
    org.status = "active";
    org.updatedAt = this.runtime.clock.now();
    const uow = this.runtime.uowFactory.start();
    await this.runtime.organizations.save(uow, org);
    this.publish(uow, TenancyEventTypes.OrganizationActivated, organizationId, {
      organizationId,
    });
    await uow.commit();
    return toOrganizationView(org);
  }

  async suspendOrganization(organizationId: string): Promise<OrganizationView> {
    const org = await this.requireOrg(organizationId);
    org.status = "suspended";
    org.updatedAt = this.runtime.clock.now();
    const uow = this.runtime.uowFactory.start();
    await this.runtime.organizations.save(uow, org);
    this.publish(uow, TenancyEventTypes.OrganizationSuspended, organizationId, {
      organizationId,
    });
    await uow.commit();
    return toOrganizationView(org);
  }

  async archiveOrganization(organizationId: string): Promise<OrganizationView> {
    const org = await this.requireOrg(organizationId);
    org.status = "archived";
    org.updatedAt = this.runtime.clock.now();
    const uow = this.runtime.uowFactory.start();
    await this.runtime.organizations.save(uow, org);
    this.publish(uow, TenancyEventTypes.OrganizationArchived, organizationId, {
      organizationId,
    });
    await uow.commit();
    return toOrganizationView(org);
  }

  async deleteOrganization(organizationId: string): Promise<OrganizationView> {
    const org = await this.requireOrg(organizationId);
    const now = this.runtime.clock.now();
    org.status = "deleted";
    org.deletedAt = now;
    org.updatedAt = now;
    const uow = this.runtime.uowFactory.start();
    await this.runtime.organizations.save(uow, org);
    this.publish(uow, TenancyEventTypes.OrganizationDeleted, organizationId, {
      organizationId,
    });
    await uow.commit();
    return toOrganizationView(org);
  }

  async renameOrganization(input: {
    organizationId: string;
    name: string;
    slug?: string;
  }): Promise<OrganizationView> {
    const org = await this.requireOrg(input.organizationId);
    if (!input.name.trim()) {
      throw new ValidationError("name required");
    }
    org.name = input.name.trim();
    if (input.slug !== undefined) {
      const slug = input.slug.trim().toLowerCase() || null;
      if (slug) {
        const taken = await this.runtime.organizations.findBySlug(slug);
        if (taken && taken.organizationId !== org.organizationId) {
          throw new ConflictError("slug already in use");
        }
      }
      org.slug = slug;
    }
    org.updatedAt = this.runtime.clock.now();
    const uow = this.runtime.uowFactory.start();
    await this.runtime.organizations.save(uow, org);
    await uow.commit();
    return toOrganizationView(org);
  }

  async transferOwnership(input: {
    organizationId: string;
    fromPrincipalId: string;
    toPrincipalId: string;
  }): Promise<OrganizationView> {
    const org = await this.requireOrg(input.organizationId);
    if (org.ownerPrincipalId !== input.fromPrincipalId) {
      throw new ValidationError("fromPrincipalId is not current owner");
    }
    await this.requirePrincipal(input.toPrincipalId);
    const membership = await this.runtime.memberships.find(
      input.organizationId,
      input.toPrincipalId,
    );
    if (!membership || !isActiveMembership(membership.state)) {
      throw new ValidationError("new owner must be an active member");
    }

    org.ownerPrincipalId = input.toPrincipalId;
    org.updatedAt = this.runtime.clock.now();
    const uow = this.runtime.uowFactory.start();
    await this.runtime.organizations.save(uow, org);
    this.publish(
      uow,
      TenancyEventTypes.OrganizationOwnerTransferred,
      input.organizationId,
      {
        organizationId: input.organizationId,
        fromPrincipalId: input.fromPrincipalId,
        toPrincipalId: input.toPrincipalId,
      },
    );
    await uow.commit();
    return toOrganizationView(org);
  }

  async addLocation(input: {
    organizationId: string;
    name: string;
    code: string;
  }): Promise<Location> {
    const org = await this.requireOrg(input.organizationId);
    const code = input.code.trim().toLowerCase();
    if (!input.name.trim() || !code) {
      throw new ValidationError("name and code required");
    }
    if (org.locations.some((l) => l.code === code)) {
      throw new ConflictError("location code already exists");
    }
    const now = this.runtime.clock.now();
    const location: Location = {
      locationId: this.runtime.ids.id(),
      name: input.name.trim(),
      code,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    org.locations.push(location);
    org.updatedAt = now;
    const uow = this.runtime.uowFactory.start();
    await this.runtime.organizations.save(uow, org);
    this.publish(uow, TenancyEventTypes.LocationCreated, org.organizationId, {
      organizationId: org.organizationId,
      locationId: location.locationId,
      code: location.code,
    });
    await uow.commit();
    return structuredClone(location);
  }

  async updateLocation(input: {
    organizationId: string;
    locationId: string;
    name?: string;
  }): Promise<Location> {
    const org = await this.requireOrg(input.organizationId);
    const location = org.locations.find((l) => l.locationId === input.locationId);
    if (!location) {
      throw new NotFoundError("location not found");
    }
    if (input.name !== undefined) {
      location.name = input.name.trim();
    }
    location.updatedAt = this.runtime.clock.now();
    org.updatedAt = location.updatedAt;
    const uow = this.runtime.uowFactory.start();
    await this.runtime.organizations.save(uow, org);
    this.publish(uow, TenancyEventTypes.LocationUpdated, org.organizationId, {
      organizationId: org.organizationId,
      locationId: location.locationId,
    });
    await uow.commit();
    return structuredClone(location);
  }

  async deactivateLocation(input: {
    organizationId: string;
    locationId: string;
  }): Promise<Location> {
    const org = await this.requireOrg(input.organizationId);
    const location = org.locations.find((l) => l.locationId === input.locationId);
    if (!location) {
      throw new NotFoundError("location not found");
    }
    location.status = "inactive";
    location.updatedAt = this.runtime.clock.now();
    org.updatedAt = location.updatedAt;
    const uow = this.runtime.uowFactory.start();
    await this.runtime.organizations.save(uow, org);
    this.publish(
      uow,
      TenancyEventTypes.LocationDeactivated,
      org.organizationId,
      {
        organizationId: org.organizationId,
        locationId: location.locationId,
      },
    );
    await uow.commit();
    return structuredClone(location);
  }

  async addMembership(input: {
    organizationId: string;
    principalId: string;
    locationId?: string | null;
  }): Promise<Membership> {
    await this.requireOrg(input.organizationId);
    await this.requirePrincipal(input.principalId);
    const existing = await this.runtime.memberships.find(
      input.organizationId,
      input.principalId,
    );
    if (existing && !isTerminalMembership(existing.state)) {
      throw new ConflictError("membership already exists");
    }

    const now = this.runtime.clock.now();
    const membership: Membership = {
      membershipId: existing?.membershipId ?? this.runtime.ids.id(),
      organizationId: input.organizationId,
      principalId: input.principalId,
      locationId: input.locationId ?? null,
      state: "active",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const uow = this.runtime.uowFactory.start();
    await this.runtime.memberships.save(uow, membership);
    this.publish(uow, TenancyEventTypes.MembershipCreated, input.organizationId, {
      organizationId: input.organizationId,
      principalId: input.principalId,
      membershipId: membership.membershipId,
    });
    this.publish(
      uow,
      TenancyEventTypes.MembershipActivated,
      input.organizationId,
      {
        organizationId: input.organizationId,
        principalId: input.principalId,
        membershipId: membership.membershipId,
      },
    );
    await uow.commit();
    return structuredClone(membership);
  }

  async suspendMembership(input: {
    organizationId: string;
    principalId: string;
  }): Promise<Membership> {
    return this.setMembershipState(
      input.organizationId,
      input.principalId,
      "suspended",
      TenancyEventTypes.MembershipSuspended,
    );
  }

  async activateMembership(input: {
    organizationId: string;
    principalId: string;
  }): Promise<Membership> {
    return this.setMembershipState(
      input.organizationId,
      input.principalId,
      "active",
      TenancyEventTypes.MembershipActivated,
    );
  }

  async removeMembership(input: {
    organizationId: string;
    principalId: string;
  }): Promise<Membership> {
    const org = await this.requireOrg(input.organizationId);
    if (org.ownerPrincipalId === input.principalId) {
      throw new ValidationError("cannot remove sole owner membership");
    }
    return this.setMembershipState(
      input.organizationId,
      input.principalId,
      "removed",
      TenancyEventTypes.MembershipRemoved,
    );
  }

  async leaveOrganization(input: {
    organizationId: string;
    principalId: string;
  }): Promise<Membership> {
    const org = await this.requireOrg(input.organizationId);
    if (org.ownerPrincipalId === input.principalId) {
      throw new ValidationError("owner cannot leave; transfer ownership first");
    }
    return this.setMembershipState(
      input.organizationId,
      input.principalId,
      "left",
      TenancyEventTypes.MembershipLeft,
    );
  }

  private async setMembershipState(
    organizationId: string,
    principalId: string,
    state: Membership["state"],
    eventType: string,
  ): Promise<Membership> {
    const membership = await this.runtime.memberships.find(
      organizationId,
      principalId,
    );
    if (!membership) {
      throw new NotFoundError("membership not found");
    }
    membership.state = state;
    membership.updatedAt = this.runtime.clock.now();
    const uow = this.runtime.uowFactory.start();
    await this.runtime.memberships.save(uow, membership);
    this.publish(uow, eventType, organizationId, {
      organizationId,
      principalId,
      membershipId: membership.membershipId,
    });
    await uow.commit();
    return structuredClone(membership);
  }

  async createInvitation(input: {
    organizationId: string;
    email: string;
    invitedByPrincipalId: string;
    locationId?: string | null;
    suggestedRoleKey?: string | null;
  }): Promise<{ invitationId: string; rawToken: string }> {
    const org = await this.requireOrg(input.organizationId);
    if (org.status !== "active") {
      throw new ValidationError("organization must be active to invite");
    }
    await this.requirePrincipal(input.invitedByPrincipalId);
    const emailNormalized = normalizeInviteEmail(input.email);
    if (!emailNormalized.includes("@")) {
      throw new ValidationError("valid email required");
    }

    const now = this.runtime.clock.now();
    const rawToken = this.runtime.tokens.token();
    const ttl = this.runtime.invitationTtlHours ?? 72;
    const invitation: Invitation = {
      invitationId: this.runtime.ids.id(),
      organizationId: input.organizationId,
      email: input.email.trim(),
      emailNormalized,
      invitedByPrincipalId: input.invitedByPrincipalId,
      locationId: input.locationId ?? null,
      suggestedRoleKey: input.suggestedRoleKey ?? null,
      tokenHash: this.runtime.hashToken(rawToken),
      state: "pending",
      createdAt: now,
      expiresAt: this.addHours(now, ttl),
      acceptedByPrincipalId: null,
      updatedAt: now,
    };

    const uow = this.runtime.uowFactory.start();
    await this.runtime.invitations.save(uow, invitation);
    this.publish(uow, TenancyEventTypes.InvitationCreated, input.organizationId, {
      organizationId: input.organizationId,
      invitationId: invitation.invitationId,
      emailNormalized,
    });
    await uow.commit();
    return { invitationId: invitation.invitationId, rawToken };
  }

  async revokeInvitation(input: {
    invitationId: string;
    revokedByPrincipalId: string;
  }): Promise<void> {
    const invitation = await this.runtime.invitations.findById(
      input.invitationId,
    );
    if (!invitation || invitation.state !== "pending") {
      throw new NotFoundError("pending invitation not found");
    }
    invitation.state = "revoked";
    invitation.updatedAt = this.runtime.clock.now();
    const uow = this.runtime.uowFactory.start();
    await this.runtime.invitations.save(uow, invitation);
    this.publish(
      uow,
      TenancyEventTypes.InvitationRevoked,
      invitation.organizationId,
      {
        organizationId: invitation.organizationId,
        invitationId: invitation.invitationId,
        revokedByPrincipalId: input.revokedByPrincipalId,
      },
    );
    await uow.commit();
  }

  /**
   * Accept invitation — email bind required (invitation-acceptance-policy).
   */
  async acceptInvitation(input: {
    token: string;
    principalId: string;
  }): Promise<Membership> {
    const now = this.runtime.clock.now();
    const invitation = await this.runtime.invitations.findByTokenHash(
      this.runtime.hashToken(input.token),
    );
    if (!invitation || !isInvitationAcceptable(invitation, now)) {
      throw new ValidationError("invalid or expired invitation");
    }

    const user = await this.requirePrincipal(input.principalId);
    const allowed = await this.runtime.identity.isAuthenticationAllowed(
      input.principalId,
    );
    if (!allowed) {
      throw new ValidationError("principal cannot authenticate");
    }

    if (normalizeInviteEmail(user.email) !== invitation.emailNormalized) {
      throw new InvitationEmailMismatchError();
    }

    const org = await this.requireOrg(invitation.organizationId);
    if (org.status !== "active") {
      throw new ValidationError("organization must be active");
    }

    const existing = await this.runtime.memberships.find(
      invitation.organizationId,
      input.principalId,
    );
    if (existing && !isTerminalMembership(existing.state) && existing.state !== "invited") {
      if (isActiveMembership(existing.state)) {
        throw new ConflictError("already a member");
      }
      if (existing.state === "suspended") {
        throw new ConflictError("membership suspended");
      }
    }

    const membership: Membership = {
      membershipId: existing?.membershipId ?? this.runtime.ids.id(),
      organizationId: invitation.organizationId,
      principalId: input.principalId,
      locationId: invitation.locationId,
      state: "active",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    invitation.state = "accepted";
    invitation.acceptedByPrincipalId = input.principalId;
    invitation.updatedAt = now;

    const uow = this.runtime.uowFactory.start();
    await this.runtime.memberships.save(uow, membership);
    await this.runtime.invitations.save(uow, invitation);
    this.publish(
      uow,
      TenancyEventTypes.InvitationAccepted,
      invitation.organizationId,
      {
        organizationId: invitation.organizationId,
        invitationId: invitation.invitationId,
        principalId: input.principalId,
      },
    );
    this.publish(
      uow,
      TenancyEventTypes.MembershipCreated,
      invitation.organizationId,
      {
        organizationId: invitation.organizationId,
        principalId: input.principalId,
        membershipId: membership.membershipId,
      },
    );
    this.publish(
      uow,
      TenancyEventTypes.MembershipActivated,
      invitation.organizationId,
      {
        organizationId: invitation.organizationId,
        principalId: input.principalId,
        membershipId: membership.membershipId,
      },
    );
    await uow.commit();
    return structuredClone(membership);
  }

  async declineInvitation(input: {
    token: string;
    principalId?: string;
  }): Promise<void> {
    const invitation = await this.runtime.invitations.findByTokenHash(
      this.runtime.hashToken(input.token),
    );
    if (!invitation || invitation.state !== "pending") {
      throw new NotFoundError("pending invitation not found");
    }
    invitation.state = "declined";
    invitation.updatedAt = this.runtime.clock.now();
    const uow = this.runtime.uowFactory.start();
    await this.runtime.invitations.save(uow, invitation);
    this.publish(
      uow,
      TenancyEventTypes.InvitationDeclined,
      invitation.organizationId,
      {
        organizationId: invitation.organizationId,
        invitationId: invitation.invitationId,
        principalId: input.principalId ?? null,
      },
    );
    await uow.commit();
  }

  async getOrganization(
    organizationId: string,
  ): Promise<OrganizationView | null> {
    const org = await this.runtime.organizations.findById(organizationId);
    return org ? toOrganizationView(org) : null;
  }

  async listLocations(organizationId: string): Promise<Location[]> {
    const org = await this.requireOrg(organizationId);
    return structuredClone(org.locations);
  }

  async getMembership(
    organizationId: string,
    principalId: string,
  ): Promise<Membership | null> {
    return this.runtime.memberships.find(organizationId, principalId);
  }

  async listMembershipsForOrganization(
    organizationId: string,
  ): Promise<Membership[]> {
    return this.runtime.memberships.listForOrganization(organizationId);
  }

  async listOrganizationsForPrincipal(
    principalId: string,
  ): Promise<OrganizationView[]> {
    const memberships = await this.runtime.memberships.listForPrincipal(
      principalId,
    );
    const views: OrganizationView[] = [];
    for (const m of memberships) {
      if (!isActiveMembership(m.state)) {
        continue;
      }
      const org = await this.runtime.organizations.findById(m.organizationId);
      if (org) {
        views.push(toOrganizationView(org));
      }
    }
    return views;
  }

  async resolveTenantContext(input: {
    principalId: string;
    organizationId: string;
    locationId?: string | null;
  }): Promise<TenantContext> {
    const membership = await this.runtime.memberships.find(
      input.organizationId,
      input.principalId,
    );
    if (!membership || !isActiveMembership(membership.state)) {
      throw new ValidationError("active membership required");
    }
    const org = await this.requireOrg(input.organizationId);
    if (org.status !== "active") {
      throw new ValidationError("organization not active");
    }
    const locationId = input.locationId ?? null;
    if (locationId) {
      const loc = org.locations.find((l) => l.locationId === locationId);
      if (!loc || loc.status !== "active") {
        throw new ValidationError("location not active");
      }
    }
    return {
      organizationId: input.organizationId,
      locationId,
      principalId: input.principalId,
    };
  }
}
