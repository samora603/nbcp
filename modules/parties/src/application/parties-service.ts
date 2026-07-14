import { randomUUID } from "node:crypto";
import type { DomainEventEnvelope, UnitOfWork } from "@nbcp/outbox";
import type { PartiesRuntime } from "./ports.js";
import {
  toPartyView,
  isTerminalStatus,
  canReceiveNewBusiness,
  type ChannelType,
  type AddressUsage,
  type Party,
  type PartyView,
  type PartyStatus,
  type PartyKind,
  type ContactChannel,
  type PostalAddress,
  type ContactPerson,
  type PartyRelationship,
} from "../domain/party.js";
import { isAllowlistedRelationshipType } from "../domain/relationship.js";
import { PartiesEventTypes } from "../domain/events.js";
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../domain/errors.js";
import { PartiesPermissions } from "./permissions.js";

export interface ActorContext {
  principalId: string;
  organizationId: string;
  locationId?: string | null;
}

/**
 * Parties application facade (S1).
 * Owns party master data; depends on Core facades + Audit (optional record).
 */
export class PartiesService {
  constructor(private readonly runtime: PartiesRuntime) {}

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
      producer: "parties",
      organizationId,
      correlationId: null,
      payload,
    };
    this.runtime.outbox.append(uow, envelope);
    return envelope;
  }

  private async requireOrg(organizationId: string): Promise<void> {
    const org = await this.runtime.tenancy.getOrganization(organizationId);
    if (!org || org.status !== "active") {
      throw new ValidationError("organization not active");
    }
  }

  private async requireAuthorized(
    actor: ActorContext,
    permissionKey: string,
  ): Promise<void> {
    const membership = await this.runtime.tenancy.getMembership(
      actor.organizationId,
      actor.principalId,
    );
    if (!membership || membership.state !== "active") {
      throw new AuthorizationError("active membership required");
    }
    const decision = await this.runtime.rbac.authorize({
      principalId: actor.principalId,
      permissionKey,
      organizationId: actor.organizationId,
      locationId: actor.locationId ?? null,
    });
    if (!decision.allowed) {
      throw new AuthorizationError(
        `denied: ${decision.reason ?? permissionKey}`,
      );
    }
  }

  private async requireParty(
    organizationId: string,
    partyId: string,
  ): Promise<Party> {
    const party = await this.runtime.parties.findById(organizationId, partyId);
    if (!party) {
      throw new NotFoundError(`party not found: ${partyId}`);
    }
    return party;
  }

  private async auditSecurity(
    envelope: DomainEventEnvelope,
    actorPrincipalId: string | null,
  ): Promise<void> {
    if (!this.runtime.audit) return;
    await this.runtime.audit.record({
      actor: {
        kind: actorPrincipalId ? "principal" : "system",
        principalId: actorPrincipalId,
      },
      action: envelope.type,
      organizationId: envelope.organizationId ?? "",
      target: {
        type: "parties.party",
        id: String(envelope.payload.partyId ?? ""),
      },
      metadata: { ...envelope.payload },
      sourceModule: "parties",
      sourceEventId: envelope.eventId,
      outcome: "success",
    });
  }

  private normalizeEmail(value: string): string {
    return value.trim().toLowerCase();
  }

  private channelValue(type: ChannelType, value: string): string {
    return type === "email" ? this.normalizeEmail(value) : value.trim();
  }

  async createIndividual(
    actor: ActorContext,
    input: {
      displayName?: string;
      givenName?: string;
      familyName?: string;
      roleKeys?: string[];
      status?: "draft" | "active";
      principalId?: string | null;
      defaultLocationId?: string | null;
      channels?: Array<{
        channelType: ChannelType;
        value: string;
        isPrimary?: boolean;
      }>;
    },
  ): Promise<PartyView> {
    await this.requireOrg(actor.organizationId);
    await this.requireAuthorized(actor, PartiesPermissions.PartyManage);

    const given = input.givenName?.trim() || null;
    const family = input.familyName?.trim() || null;
    const display =
      input.displayName?.trim() ||
      [given, family].filter(Boolean).join(" ").trim();
    if (!display) {
      throw new ValidationError("displayName or given/family name required");
    }

    const now = this.runtime.clock.now();
    const status: PartyStatus = input.status ?? "active";
    const party = await this.buildNewParty({
      organizationId: actor.organizationId,
      kind: "individual",
      status,
      displayName: display,
      givenName: given,
      familyName: family,
      legalName: null,
      tradeName: null,
      roleKeys: input.roleKeys ?? [],
      principalId: input.principalId ?? null,
      defaultLocationId: input.defaultLocationId ?? null,
      channels: input.channels ?? [],
      now,
    });

    const uow = this.runtime.uowFactory.start();
    await this.runtime.parties.save(uow, party);
    this.publish(uow, PartiesEventTypes.PartyCreated, actor.organizationId, {
      partyId: party.partyId,
      kind: party.kind,
      status: party.status,
      roleKeys: party.classifications.map((c) => c.roleKey),
      displayName: party.displayName,
    });
    for (const c of party.classifications) {
      this.publish(
        uow,
        PartiesEventTypes.ClassificationGranted,
        actor.organizationId,
        {
          partyId: party.partyId,
          roleKey: c.roleKey,
        },
      );
    }
    for (const ch of party.channels) {
      this.publish(uow, PartiesEventTypes.ChannelAdded, actor.organizationId, {
        partyId: party.partyId,
        channelId: ch.channelId,
        channelType: ch.channelType,
      });
    }
    await uow.commit();
    return toPartyView(party);
  }

  async createOrganizationParty(
    actor: ActorContext,
    input: {
      legalName: string;
      tradeName?: string | null;
      displayName?: string;
      roleKeys?: string[];
      status?: "draft" | "active";
      channels?: Array<{
        channelType: ChannelType;
        value: string;
        isPrimary?: boolean;
      }>;
    },
  ): Promise<PartyView> {
    await this.requireOrg(actor.organizationId);
    await this.requireAuthorized(actor, PartiesPermissions.PartyManage);

    const legal = input.legalName?.trim();
    if (!legal) {
      throw new ValidationError("legalName required");
    }
    const trade = input.tradeName?.trim() || null;
    const display = input.displayName?.trim() || trade || legal;
    const now = this.runtime.clock.now();
    const party = await this.buildNewParty({
      organizationId: actor.organizationId,
      kind: "organization",
      status: input.status ?? "active",
      displayName: display,
      givenName: null,
      familyName: null,
      legalName: legal,
      tradeName: trade,
      roleKeys: input.roleKeys ?? [],
      principalId: null,
      defaultLocationId: null,
      channels: input.channels ?? [],
      now,
    });

    const uow = this.runtime.uowFactory.start();
    await this.runtime.parties.save(uow, party);
    this.publish(uow, PartiesEventTypes.PartyCreated, actor.organizationId, {
      partyId: party.partyId,
      kind: party.kind,
      status: party.status,
      roleKeys: party.classifications.map((c) => c.roleKey),
      displayName: party.displayName,
    });
    for (const c of party.classifications) {
      this.publish(
        uow,
        PartiesEventTypes.ClassificationGranted,
        actor.organizationId,
        {
          partyId: party.partyId,
          roleKey: c.roleKey,
        },
      );
    }
    for (const ch of party.channels) {
      this.publish(uow, PartiesEventTypes.ChannelAdded, actor.organizationId, {
        partyId: party.partyId,
        channelId: ch.channelId,
        channelType: ch.channelType,
      });
    }
    await uow.commit();
    return toPartyView(party);
  }

  private async buildNewParty(input: {
    organizationId: string;
    kind: PartyKind;
    status: PartyStatus;
    displayName: string;
    givenName: string | null;
    familyName: string | null;
    legalName: string | null;
    tradeName: string | null;
    roleKeys: string[];
    principalId: string | null;
    defaultLocationId: string | null;
    channels: Array<{
      channelType: ChannelType;
      value: string;
      isPrimary?: boolean;
    }>;
    now: string;
  }): Promise<Party> {
    if (input.principalId) {
      await this.assertPrincipalLinkable(
        input.organizationId,
        input.principalId,
        null,
      );
    }

    const classifications = [...new Set(input.roleKeys)].map((roleKey) => ({
      roleKey,
      grantedAt: input.now,
    }));

    const channels: ContactChannel[] = input.channels.map((ch, idx) => ({
      channelId: this.runtime.ids.id(),
      channelType: ch.channelType,
      value: this.channelValue(ch.channelType, ch.value),
      isPrimary: ch.isPrimary === true || (idx === 0 && ch.isPrimary !== false),
      isVerified: false,
    }));

    return {
      partyId: this.runtime.ids.id(),
      organizationId: input.organizationId,
      kind: input.kind,
      status: input.status,
      displayName: input.displayName,
      givenName: input.givenName,
      familyName: input.familyName,
      legalName: input.legalName,
      tradeName: input.tradeName,
      classifications,
      channels,
      addresses: [],
      contactPersons: [],
      principalId: input.principalId,
      defaultLocationId: input.defaultLocationId,
      mergedIntoPartyId: null,
      createdAt: input.now,
      updatedAt: input.now,
      deletedAt: null,
    };
  }

  private async assertPrincipalLinkable(
    organizationId: string,
    principalId: string,
    exceptPartyId: string | null,
  ): Promise<void> {
    const user = await this.runtime.identity.getUserById(principalId);
    if (!user) {
      throw new NotFoundError(`principal not found: ${principalId}`);
    }
    const existing = await this.runtime.parties.findByPrincipal(
      organizationId,
      principalId,
    );
    if (existing && existing.partyId !== exceptPartyId) {
      throw new ConflictError(
        "principal already linked to a party in this organization",
      );
    }
  }

  async updatePartyProfile(
    actor: ActorContext,
    input: {
      partyId: string;
      displayName?: string;
      givenName?: string | null;
      familyName?: string | null;
      legalName?: string | null;
      tradeName?: string | null;
    },
  ): Promise<PartyView> {
    await this.requireAuthorized(actor, PartiesPermissions.PartyManage);
    const party = await this.requireParty(actor.organizationId, input.partyId);
    if (isTerminalStatus(party.status)) {
      throw new ValidationError("cannot update terminal party");
    }
    const changed: string[] = [];
    const next = { ...party };
    if (input.displayName !== undefined) {
      next.displayName = input.displayName.trim();
      changed.push("displayName");
    }
    if (input.givenName !== undefined) {
      next.givenName = input.givenName;
      changed.push("givenName");
    }
    if (input.familyName !== undefined) {
      next.familyName = input.familyName;
      changed.push("familyName");
    }
    if (input.legalName !== undefined) {
      next.legalName = input.legalName;
      changed.push("legalName");
    }
    if (input.tradeName !== undefined) {
      next.tradeName = input.tradeName;
      changed.push("tradeName");
    }
    if (!next.displayName.trim()) {
      throw new ValidationError("displayName required");
    }
    next.updatedAt = this.runtime.clock.now();

    const uow = this.runtime.uowFactory.start();
    await this.runtime.parties.save(uow, next);
    this.publish(uow, PartiesEventTypes.PartyUpdated, actor.organizationId, {
      partyId: next.partyId,
      changedFields: changed,
    });
    await uow.commit();
    return toPartyView(next);
  }

  async activateParty(
    actor: ActorContext,
    partyId: string,
  ): Promise<PartyView> {
    return this.transitionStatus(actor, partyId, "active", [
      "draft",
      "inactive",
    ]);
  }

  async inactivateParty(
    actor: ActorContext,
    partyId: string,
  ): Promise<PartyView> {
    return this.transitionStatus(actor, partyId, "inactive", ["active", "draft"]);
  }

  async deleteParty(actor: ActorContext, partyId: string): Promise<PartyView> {
    await this.requireAuthorized(actor, PartiesPermissions.PartyManage);
    const party = await this.requireParty(actor.organizationId, partyId);
    if (party.status === "deleted") {
      return toPartyView(party);
    }
    if (party.status === "merged") {
      throw new ValidationError("merged party cannot be deleted");
    }
    const now = this.runtime.clock.now();
    const next: Party = {
      ...party,
      status: "deleted",
      deletedAt: now,
      updatedAt: now,
    };
    const uow = this.runtime.uowFactory.start();
    await this.runtime.parties.save(uow, next);
    this.publish(uow, PartiesEventTypes.PartyDeleted, actor.organizationId, {
      partyId: next.partyId,
    });
    await uow.commit();
    return toPartyView(next);
  }

  private async transitionStatus(
    actor: ActorContext,
    partyId: string,
    to: "active" | "inactive",
    fromAllowed: PartyStatus[],
  ): Promise<PartyView> {
    await this.requireAuthorized(actor, PartiesPermissions.PartyManage);
    const party = await this.requireParty(actor.organizationId, partyId);
    if (!fromAllowed.includes(party.status)) {
      throw new ValidationError(
        `cannot transition from ${party.status} to ${to}`,
      );
    }
    const next: Party = {
      ...party,
      status: to,
      updatedAt: this.runtime.clock.now(),
    };
    const uow = this.runtime.uowFactory.start();
    await this.runtime.parties.save(uow, next);
    this.publish(
      uow,
      to === "active"
        ? PartiesEventTypes.PartyActivated
        : PartiesEventTypes.PartyInactivated,
      actor.organizationId,
      { partyId: next.partyId },
    );
    await uow.commit();
    return toPartyView(next);
  }

  async grantClassification(
    actor: ActorContext,
    input: { partyId: string; roleKey: string },
  ): Promise<PartyView> {
    await this.requireAuthorized(
      actor,
      PartiesPermissions.ClassificationManage,
    );
    const party = await this.requireParty(actor.organizationId, input.partyId);
    if (!canReceiveNewBusiness(party.status) && party.status !== "inactive") {
      throw new ValidationError("party cannot receive classification");
    }
    if (party.classifications.some((c) => c.roleKey === input.roleKey)) {
      return toPartyView(party);
    }
    const next: Party = {
      ...party,
      classifications: [
        ...party.classifications,
        { roleKey: input.roleKey, grantedAt: this.runtime.clock.now() },
      ],
      updatedAt: this.runtime.clock.now(),
    };
    const uow = this.runtime.uowFactory.start();
    await this.runtime.parties.save(uow, next);
    this.publish(
      uow,
      PartiesEventTypes.ClassificationGranted,
      actor.organizationId,
      { partyId: next.partyId, roleKey: input.roleKey },
    );
    await uow.commit();
    return toPartyView(next);
  }

  async revokeClassification(
    actor: ActorContext,
    input: { partyId: string; roleKey: string },
  ): Promise<PartyView> {
    await this.requireAuthorized(
      actor,
      PartiesPermissions.ClassificationManage,
    );
    const party = await this.requireParty(actor.organizationId, input.partyId);
    if (!party.classifications.some((c) => c.roleKey === input.roleKey)) {
      return toPartyView(party);
    }
    const next: Party = {
      ...party,
      classifications: party.classifications.filter(
        (c) => c.roleKey !== input.roleKey,
      ),
      updatedAt: this.runtime.clock.now(),
    };
    const uow = this.runtime.uowFactory.start();
    await this.runtime.parties.save(uow, next);
    this.publish(
      uow,
      PartiesEventTypes.ClassificationRevoked,
      actor.organizationId,
      { partyId: next.partyId, roleKey: input.roleKey },
    );
    await uow.commit();
    return toPartyView(next);
  }

  async addContactChannel(
    actor: ActorContext,
    input: {
      partyId: string;
      channelType: ChannelType;
      value: string;
      isPrimary?: boolean;
    },
  ): Promise<PartyView> {
    await this.requireAuthorized(actor, PartiesPermissions.PartyManage);
    const party = await this.requireParty(actor.organizationId, input.partyId);
    if (isTerminalStatus(party.status)) {
      throw new ValidationError("cannot modify terminal party");
    }
    const channel: ContactChannel = {
      channelId: this.runtime.ids.id(),
      channelType: input.channelType,
      value: this.channelValue(input.channelType, input.value),
      isPrimary: input.isPrimary === true,
      isVerified: false,
    };
    let channels = [...party.channels];
    if (channel.isPrimary) {
      channels = channels.map((c) => ({ ...c, isPrimary: false }));
    }
    channels.push(channel);
    const next: Party = {
      ...party,
      channels,
      updatedAt: this.runtime.clock.now(),
    };
    const uow = this.runtime.uowFactory.start();
    await this.runtime.parties.save(uow, next);
    this.publish(uow, PartiesEventTypes.ChannelAdded, actor.organizationId, {
      partyId: next.partyId,
      channelId: channel.channelId,
      channelType: channel.channelType,
    });
    await uow.commit();
    return toPartyView(next);
  }

  async removeContactChannel(
    actor: ActorContext,
    input: { partyId: string; channelId: string },
  ): Promise<PartyView> {
    await this.requireAuthorized(actor, PartiesPermissions.PartyManage);
    const party = await this.requireParty(actor.organizationId, input.partyId);
    const exists = party.channels.some((c) => c.channelId === input.channelId);
    if (!exists) {
      throw new NotFoundError(`channel not found: ${input.channelId}`);
    }
    const next: Party = {
      ...party,
      channels: party.channels.filter((c) => c.channelId !== input.channelId),
      updatedAt: this.runtime.clock.now(),
    };
    const uow = this.runtime.uowFactory.start();
    await this.runtime.parties.save(uow, next);
    this.publish(uow, PartiesEventTypes.ChannelRemoved, actor.organizationId, {
      partyId: next.partyId,
      channelId: input.channelId,
    });
    await uow.commit();
    return toPartyView(next);
  }

  async addPostalAddress(
    actor: ActorContext,
    input: {
      partyId: string;
      lines: string[];
      locality?: string | null;
      region?: string | null;
      postalCode?: string | null;
      countryCode?: string | null;
      usage?: AddressUsage;
      isDefault?: boolean;
    },
  ): Promise<PartyView> {
    await this.requireAuthorized(actor, PartiesPermissions.PartyManage);
    const party = await this.requireParty(actor.organizationId, input.partyId);
    if (isTerminalStatus(party.status)) {
      throw new ValidationError("cannot modify terminal party");
    }
    if (!input.lines?.length) {
      throw new ValidationError("address lines required");
    }
    const address: PostalAddress = {
      addressId: this.runtime.ids.id(),
      lines: input.lines.map((l) => l.trim()).filter(Boolean),
      locality: input.locality ?? null,
      region: input.region ?? null,
      postalCode: input.postalCode ?? null,
      countryCode: input.countryCode ?? null,
      usage: input.usage ?? "other",
      isDefault: input.isDefault === true,
    };
    let addresses = [...party.addresses];
    if (address.isDefault) {
      addresses = addresses.map((a) => ({ ...a, isDefault: false }));
    }
    addresses.push(address);
    const next: Party = {
      ...party,
      addresses,
      updatedAt: this.runtime.clock.now(),
    };
    const uow = this.runtime.uowFactory.start();
    await this.runtime.parties.save(uow, next);
    this.publish(uow, PartiesEventTypes.PartyUpdated, actor.organizationId, {
      partyId: next.partyId,
      changedFields: ["addresses"],
    });
    await uow.commit();
    return toPartyView(next);
  }

  async addContactPerson(
    actor: ActorContext,
    input: { partyId: string; name: string },
  ): Promise<PartyView> {
    await this.requireAuthorized(actor, PartiesPermissions.PartyManage);
    const party = await this.requireParty(actor.organizationId, input.partyId);
    if (!input.name?.trim()) {
      throw new ValidationError("contact person name required");
    }
    const person: ContactPerson = {
      contactPersonId: this.runtime.ids.id(),
      name: input.name.trim(),
      channels: [],
    };
    const next: Party = {
      ...party,
      contactPersons: [...party.contactPersons, person],
      updatedAt: this.runtime.clock.now(),
    };
    const uow = this.runtime.uowFactory.start();
    await this.runtime.parties.save(uow, next);
    this.publish(uow, PartiesEventTypes.PartyUpdated, actor.organizationId, {
      partyId: next.partyId,
      changedFields: ["contactPersons"],
    });
    await uow.commit();
    return toPartyView(next);
  }

  async linkPrincipal(
    actor: ActorContext,
    input: { partyId: string; principalId: string },
  ): Promise<PartyView> {
    await this.requireAuthorized(actor, PartiesPermissions.PrincipalLink);
    const party = await this.requireParty(actor.organizationId, input.partyId);
    if (isTerminalStatus(party.status)) {
      throw new ValidationError("cannot link principal on terminal party");
    }
    await this.assertPrincipalLinkable(
      actor.organizationId,
      input.principalId,
      party.partyId,
    );
    const next: Party = {
      ...party,
      principalId: input.principalId,
      updatedAt: this.runtime.clock.now(),
    };
    const uow = this.runtime.uowFactory.start();
    await this.runtime.parties.save(uow, next);
    const envelope = this.publish(
      uow,
      PartiesEventTypes.PrincipalLinked,
      actor.organizationId,
      {
        partyId: next.partyId,
        principalId: input.principalId,
      },
    );
    await uow.commit();
    await this.auditSecurity(envelope, actor.principalId);
    return toPartyView(next);
  }

  async unlinkPrincipal(
    actor: ActorContext,
    partyId: string,
  ): Promise<PartyView> {
    await this.requireAuthorized(actor, PartiesPermissions.PrincipalLink);
    const party = await this.requireParty(actor.organizationId, partyId);
    if (!party.principalId) {
      return toPartyView(party);
    }
    const previous = party.principalId;
    const next: Party = {
      ...party,
      principalId: null,
      updatedAt: this.runtime.clock.now(),
    };
    const uow = this.runtime.uowFactory.start();
    await this.runtime.parties.save(uow, next);
    const envelope = this.publish(
      uow,
      PartiesEventTypes.PrincipalUnlinked,
      actor.organizationId,
      {
        partyId: next.partyId,
        principalId: previous,
      },
    );
    await uow.commit();
    await this.auditSecurity(envelope, actor.principalId);
    return toPartyView(next);
  }

  async createRelationship(
    actor: ActorContext,
    input: {
      fromPartyId: string;
      toPartyId: string;
      relationshipType: string;
    },
  ): Promise<PartyRelationship> {
    await this.requireAuthorized(actor, PartiesPermissions.RelationshipManage);
    if (!isAllowlistedRelationshipType(input.relationshipType)) {
      throw new ValidationError(
        `relationship type not allowlisted: ${input.relationshipType}`,
      );
    }
    if (input.fromPartyId === input.toPartyId) {
      throw new ValidationError("relationship endpoints must differ");
    }
    const from = await this.requireParty(
      actor.organizationId,
      input.fromPartyId,
    );
    const to = await this.requireParty(actor.organizationId, input.toPartyId);
    if (!canReceiveNewBusiness(from.status) || !canReceiveNewBusiness(to.status)) {
      throw new ValidationError(
        "both parties must accept new business relationships",
      );
    }
    const existing = await this.runtime.relationships.findActive(
      actor.organizationId,
      input.fromPartyId,
      input.toPartyId,
      input.relationshipType,
    );
    if (existing) {
      throw new ConflictError("relationship already exists");
    }
    const relationship: PartyRelationship = {
      relationshipId: this.runtime.ids.id(),
      organizationId: actor.organizationId,
      fromPartyId: input.fromPartyId,
      toPartyId: input.toPartyId,
      relationshipType: input.relationshipType,
      createdAt: this.runtime.clock.now(),
      removedAt: null,
    };
    const uow = this.runtime.uowFactory.start();
    await this.runtime.relationships.save(uow, relationship);
    this.publish(
      uow,
      PartiesEventTypes.RelationshipCreated,
      actor.organizationId,
      {
        relationshipId: relationship.relationshipId,
        fromPartyId: relationship.fromPartyId,
        toPartyId: relationship.toPartyId,
        relationshipType: relationship.relationshipType,
      },
    );
    await uow.commit();
    return relationship;
  }

  async removeRelationship(
    actor: ActorContext,
    relationshipId: string,
  ): Promise<void> {
    await this.requireAuthorized(actor, PartiesPermissions.RelationshipManage);
    const relationship = await this.runtime.relationships.findById(
      actor.organizationId,
      relationshipId,
    );
    if (!relationship || relationship.removedAt) {
      throw new NotFoundError(`relationship not found: ${relationshipId}`);
    }
    const next: PartyRelationship = {
      ...relationship,
      removedAt: this.runtime.clock.now(),
    };
    const uow = this.runtime.uowFactory.start();
    await this.runtime.relationships.save(uow, next);
    this.publish(
      uow,
      PartiesEventTypes.RelationshipRemoved,
      actor.organizationId,
      {
        relationshipId: next.relationshipId,
        fromPartyId: next.fromPartyId,
        toPartyId: next.toPartyId,
        relationshipType: next.relationshipType,
      },
    );
    await uow.commit();
  }

  async mergeParties(
    actor: ActorContext,
    input: { survivingPartyId: string; absorbedPartyId: string },
  ): Promise<PartyView> {
    await this.requireAuthorized(actor, PartiesPermissions.PartyMerge);
    if (input.survivingPartyId === input.absorbedPartyId) {
      throw new ValidationError("merge endpoints must differ");
    }
    const surviving = await this.requireParty(
      actor.organizationId,
      input.survivingPartyId,
    );
    const absorbed = await this.requireParty(
      actor.organizationId,
      input.absorbedPartyId,
    );
    if (isTerminalStatus(surviving.status)) {
      throw new ValidationError("surviving party must not be terminal");
    }
    if (isTerminalStatus(absorbed.status)) {
      throw new ValidationError("absorbed party already terminal");
    }
    const now = this.runtime.clock.now();
    const roleKeys = new Set(surviving.classifications.map((c) => c.roleKey));
    const mergedClassifications = [...surviving.classifications];
    for (const c of absorbed.classifications) {
      if (!roleKeys.has(c.roleKey)) {
        mergedClassifications.push({ roleKey: c.roleKey, grantedAt: now });
      }
    }
    const nextSurviving: Party = {
      ...surviving,
      classifications: mergedClassifications,
      updatedAt: now,
    };
    const nextAbsorbed: Party = {
      ...absorbed,
      status: "merged",
      mergedIntoPartyId: surviving.partyId,
      updatedAt: now,
    };
    const uow = this.runtime.uowFactory.start();
    await this.runtime.parties.save(uow, nextSurviving);
    await this.runtime.parties.save(uow, nextAbsorbed);
    this.publish(uow, PartiesEventTypes.PartyMerged, actor.organizationId, {
      survivingPartyId: surviving.partyId,
      absorbedPartyId: absorbed.partyId,
    });
    await uow.commit();
    return toPartyView(nextSurviving);
  }

  async getParty(
    organizationId: string,
    partyId: string,
  ): Promise<PartyView | null> {
    const party = await this.runtime.parties.findById(organizationId, partyId);
    return party ? toPartyView(party) : null;
  }

  async findParties(
    actor: ActorContext,
    filter: {
      roleKey?: string;
      status?: string;
      kind?: string;
      text?: string;
    } = {},
  ): Promise<PartyView[]> {
    await this.requireAuthorized(actor, PartiesPermissions.PartyRead);
    const rows = await this.runtime.parties.list({
      organizationId: actor.organizationId,
      ...filter,
    });
    return rows.map(toPartyView);
  }
}
