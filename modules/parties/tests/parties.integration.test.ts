import { describe, expect, it } from "vitest";
import { createIdentityKernel } from "@nbcp/identity";
import { createTenancyKernel } from "@nbcp/tenancy";
import { createRbacKernel } from "@nbcp/rbac";
import { createAuditKernel } from "@nbcp/audit";
import { createPartiesKernel } from "../src/application/create-parties-kernel.js";
import { PartiesEventTypes } from "../src/domain/events.js";
import { PartiesPermissions } from "../src/application/permissions.js";
import { AuthorizationError } from "../src/domain/errors.js";

async function registerVerified(
  identity: ReturnType<typeof createIdentityKernel>["service"],
  email: string,
) {
  const { user, verificationToken } = await identity.registerLocalUser({
    email,
    password: "password1",
  });
  await identity.verifyEmail({
    principalId: user.principalId,
    token: verificationToken,
  });
  return user;
}

async function bootParties(email: string) {
  const identity = createIdentityKernel();
  const owner = await registerVerified(identity.service, email);
  const outboxStore = identity.outboxStore;
  const tenancy = createTenancyKernel({
    identity: identity.service,
    outboxStore,
  });
  const org = await tenancy.service.createOrganization({
    name: "PartiesCo",
    ownerPrincipalId: owner.principalId,
  });
  const rbac = createRbacKernel({
    identity: identity.service,
    tenancy: tenancy.service,
    outboxStore,
  });
  await rbac.ready;
  await rbac.service.bootstrapOrganizationAdministrator({
    organizationId: org.organizationId,
    ownerPrincipalId: owner.principalId,
  });
  const audit = createAuditKernel({ outboxStore });
  const parties = createPartiesKernel({
    identity: identity.service,
    tenancy: tenancy.service,
    rbac: rbac.service,
    audit: audit.service,
    outboxStore,
  });
  const actor = {
    principalId: owner.principalId,
    organizationId: org.organizationId,
  };
  return {
    identity,
    tenancy,
    rbac,
    audit,
    parties,
    owner,
    org,
    actor,
    outboxStore,
  };
}

describe("parties integration", () => {
  it("creates customers and suppliers via classifications", async () => {
    const { parties, actor } = await bootParties("cust@example.com");
    const customer = await parties.service.createIndividual(actor, {
      givenName: "Pat",
      familyName: "Customer",
      roleKeys: ["customer"],
      channels: [
        { channelType: "email", value: "pat@example.com", isPrimary: true },
      ],
    });
    expect(customer.roleKeys).toContain("customer");
    expect(customer.kind).toBe("individual");

    const supplier = await parties.service.createOrganizationParty(actor, {
      legalName: "Acme Supplies Ltd",
      roleKeys: ["supplier"],
    });
    expect(supplier.roleKeys).toContain("supplier");
    expect(supplier.kind).toBe("organization");

    const listed = await parties.service.findParties(actor, {
      roleKey: "customer",
    });
    expect(listed.map((p) => p.partyId)).toContain(customer.partyId);
  });

  it("manages employee classification, principal link, and audit", async () => {
    const { identity, tenancy, parties, actor, org, audit, outboxStore } =
      await bootParties("emp@example.com");
    const worker = await registerVerified(
      identity.service,
      "worker@example.com",
    );
    await tenancy.service.addMembership({
      organizationId: org.organizationId,
      principalId: worker.principalId,
    });

    const employee = await parties.service.createIndividual(actor, {
      givenName: "Sam",
      familyName: "Staff",
      roleKeys: ["employee"],
    });
    const linked = await parties.service.linkPrincipal(actor, {
      partyId: employee.partyId,
      principalId: worker.principalId,
    });
    expect(linked.principalId).toBe(worker.principalId);

    const linkedEvents = await outboxStore.query({
      type: PartiesEventTypes.PrincipalLinked,
    });
    expect(linkedEvents.length).toBeGreaterThanOrEqual(1);

    await audit.relay.processBatch(200);
    const auditPage = await audit.service.query({
      organizationId: org.organizationId,
      action: PartiesEventTypes.PrincipalLinked,
      requireOrganizationScope: true,
    });
    expect(auditPage.views.length).toBeGreaterThanOrEqual(1);
  });

  it("manages contact channels, addresses, lifecycle", async () => {
    const { parties, actor, outboxStore } = await bootParties("life@example.com");
    const party = await parties.service.createIndividual(actor, {
      displayName: "Lifecycle Person",
      status: "draft",
    });
    await parties.service.addContactChannel(actor, {
      partyId: party.partyId,
      channelType: "phone",
      value: "+15551212",
      isPrimary: true,
    });
    await parties.service.addPostalAddress(actor, {
      partyId: party.partyId,
      lines: ["1 Main St"],
      locality: "Town",
      usage: "billing",
      isDefault: true,
    });
    const active = await parties.service.activateParty(actor, party.partyId);
    expect(active.status).toBe("active");
    await parties.service.inactivateParty(actor, party.partyId);

    const types = new Set(
      (await outboxStore.query({})).map((r) => r.envelope.type),
    );
    expect(types.has(PartiesEventTypes.PartyActivated)).toBe(true);
    expect(types.has(PartiesEventTypes.ChannelAdded)).toBe(true);
  });

  it("creates relationships and merges parties", async () => {
    const { parties, actor } = await bootParties("rel@example.com");
    const orgParty = await parties.service.createOrganizationParty(actor, {
      legalName: "Parent Co",
      roleKeys: ["customer"],
    });
    const contact = await parties.service.createIndividual(actor, {
      displayName: "Contact Person",
      roleKeys: ["customer"],
    });
    const rel = await parties.service.createRelationship(actor, {
      fromPartyId: contact.partyId,
      toPartyId: orgParty.partyId,
      relationshipType: "contact_of",
    });
    expect(rel.relationshipType).toBe("contact_of");

    const other = await parties.service.createIndividual(actor, {
      displayName: "Duplicate",
      roleKeys: ["supplier"],
    });
    const merged = await parties.service.mergeParties(actor, {
      survivingPartyId: orgParty.partyId,
      absorbedPartyId: other.partyId,
    });
    expect(merged.roleKeys).toEqual(
      expect.arrayContaining(["customer", "supplier"]),
    );
    const absorbed = await parties.service.getParty(
      actor.organizationId,
      other.partyId,
    );
    expect(absorbed?.status).toBe("merged");
  });

  it("denies manage without permission", async () => {
    const { identity, tenancy, rbac, parties, org } =
      await bootParties("deny@example.com");
    const other = await registerVerified(identity.service, "other@example.com");
    await tenancy.service.addMembership({
      organizationId: org.organizationId,
      principalId: other.principalId,
    });
    await expect(
      parties.service.createIndividual(
        {
          principalId: other.principalId,
          organizationId: org.organizationId,
        },
        { displayName: "Nope" },
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);

    const allowed = await rbac.service.authorize({
      principalId: other.principalId,
      permissionKey: PartiesPermissions.PartyManage,
      organizationId: org.organizationId,
    });
    expect(allowed.allowed).toBe(false);
  });
});
