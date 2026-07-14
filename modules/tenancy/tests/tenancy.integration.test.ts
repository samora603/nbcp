import { describe, expect, it } from "vitest";
import { createIdentityKernel } from "@nbcp/identity";
import { createTenancyKernel } from "../src/application/create-tenancy-kernel.js";
import { TenancyEventTypes } from "../src/domain/events.js";
import {
  InvitationEmailMismatchError,
  ValidationError,
} from "../src/domain/errors.js";

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

describe("tenancy integration", () => {
  it("creates organization with owner membership and outbox events", async () => {
    const identity = createIdentityKernel();
    const owner = await registerVerified(identity.service, "owner@example.com");
    const tenancy = createTenancyKernel({ identity: identity.service });
    const org = await tenancy.service.createOrganization({
      name: "Acme",
      slug: "acme",
      ownerPrincipalId: owner.principalId,
    });
    expect(org.ownerPrincipalId).toBe(owner.principalId);
    const membership = await tenancy.service.getMembership(
      org.organizationId,
      owner.principalId,
    );
    expect(membership?.state).toBe("active");

    const types = new Set(
      (await tenancy.outboxStore.query({})).map((r) => r.envelope.type),
    );
    expect(types.has(TenancyEventTypes.OrganizationCreated)).toBe(true);
    expect(types.has(TenancyEventTypes.MembershipActivated)).toBe(true);
    const created = (
      await tenancy.outboxStore.query({
        type: TenancyEventTypes.OrganizationCreated,
      })
    )[0];
    expect(created?.envelope.organizationId).toBe(org.organizationId);
    expect(created?.envelope.producer).toBe("tenancy");
  });

  it("manages locations and memberships", async () => {
    const identity = createIdentityKernel();
    const owner = await registerVerified(identity.service, "loc@example.com");
    const member = await registerVerified(identity.service, "staff@example.com");
    const tenancy = createTenancyKernel({ identity: identity.service });
    const org = await tenancy.service.createOrganization({
      name: "LocCo",
      ownerPrincipalId: owner.principalId,
    });
    const location = await tenancy.service.addLocation({
      organizationId: org.organizationId,
      name: "HQ",
      code: "hq",
    });
    await tenancy.service.addMembership({
      organizationId: org.organizationId,
      principalId: member.principalId,
      locationId: location.locationId,
    });
    const members = await tenancy.service.listMembershipsForOrganization(
      org.organizationId,
    );
    expect(members.length).toBe(2);
    const orgs = await tenancy.service.listOrganizationsForPrincipal(
      member.principalId,
    );
    expect(orgs.map((o) => o.organizationId)).toContain(org.organizationId);
  });

  it("accepts invitation when emails match", async () => {
    const identity = createIdentityKernel();
    const owner = await registerVerified(identity.service, "boss@example.com");
    const invitee = await registerVerified(identity.service, "hire@example.com");
    const tenancy = createTenancyKernel({ identity: identity.service });
    const org = await tenancy.service.createOrganization({
      name: "HireCo",
      ownerPrincipalId: owner.principalId,
    });
    const { rawToken } = await tenancy.service.createInvitation({
      organizationId: org.organizationId,
      email: "hire@example.com",
      invitedByPrincipalId: owner.principalId,
    });
    const membership = await tenancy.service.acceptInvitation({
      token: rawToken,
      principalId: invitee.principalId,
    });
    expect(membership.state).toBe("active");
    const types = new Set(
      (await tenancy.outboxStore.query({})).map((r) => r.envelope.type),
    );
    expect(types.has(TenancyEventTypes.InvitationAccepted)).toBe(true);
    expect(types.has(TenancyEventTypes.MembershipActivated)).toBe(true);
  });

  it("denies invitation accept on email mismatch", async () => {
    const identity = createIdentityKernel();
    const owner = await registerVerified(identity.service, "o@example.com");
    const other = await registerVerified(identity.service, "other@example.com");
    const tenancy = createTenancyKernel({ identity: identity.service });
    const org = await tenancy.service.createOrganization({
      name: "Safe",
      ownerPrincipalId: owner.principalId,
    });
    const { rawToken } = await tenancy.service.createInvitation({
      organizationId: org.organizationId,
      email: "intended@example.com",
      invitedByPrincipalId: owner.principalId,
    });
    await expect(
      tenancy.service.acceptInvitation({
        token: rawToken,
        principalId: other.principalId,
      }),
    ).rejects.toBeInstanceOf(InvitationEmailMismatchError);
  });

  it("transfers ownership between active members", async () => {
    const identity = createIdentityKernel();
    const owner = await registerVerified(identity.service, "a@example.com");
    const next = await registerVerified(identity.service, "b@example.com");
    const tenancy = createTenancyKernel({ identity: identity.service });
    const org = await tenancy.service.createOrganization({
      name: "Xfer",
      ownerPrincipalId: owner.principalId,
    });
    await tenancy.service.addMembership({
      organizationId: org.organizationId,
      principalId: next.principalId,
    });
    const updated = await tenancy.service.transferOwnership({
      organizationId: org.organizationId,
      fromPrincipalId: owner.principalId,
      toPrincipalId: next.principalId,
    });
    expect(updated.ownerPrincipalId).toBe(next.principalId);
    const events = await tenancy.outboxStore.query({
      type: TenancyEventTypes.OrganizationOwnerTransferred,
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it("resolves tenant context for active membership", async () => {
    const identity = createIdentityKernel();
    const owner = await registerVerified(identity.service, "ctx@example.com");
    const tenancy = createTenancyKernel({ identity: identity.service });
    const org = await tenancy.service.createOrganization({
      name: "Ctx",
      ownerPrincipalId: owner.principalId,
    });
    const ctx = await tenancy.service.resolveTenantContext({
      principalId: owner.principalId,
      organizationId: org.organizationId,
    });
    expect(ctx.organizationId).toBe(org.organizationId);
  });

  it("blocks owner leave without transfer", async () => {
    const identity = createIdentityKernel();
    const owner = await registerVerified(identity.service, "solo@example.com");
    const tenancy = createTenancyKernel({ identity: identity.service });
    const org = await tenancy.service.createOrganization({
      name: "Solo",
      ownerPrincipalId: owner.principalId,
    });
    await expect(
      tenancy.service.leaveOrganization({
        organizationId: org.organizationId,
        principalId: owner.principalId,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
