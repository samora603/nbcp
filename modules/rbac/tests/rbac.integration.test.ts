import { describe, expect, it } from "vitest";
import { createIdentityKernel } from "@nbcp/identity";
import { createTenancyKernel } from "@nbcp/tenancy";
import { createRbacKernel } from "../src/application/create-rbac-kernel.js";
import { RbacEventTypes } from "../src/domain/events.js";
import { RbacPermissions } from "../src/application/permissions.js";
import { ORGANIZATION_ADMINISTRATOR_ROLE_KEY } from "../src/domain/role.js";
import { AuthorizationError } from "../src/domain/errors.js";
import { TenancyPermissions } from "@nbcp/tenancy";

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

async function bootOrg(email: string) {
  const identity = createIdentityKernel();
  const owner = await registerVerified(identity.service, email);
  const outboxStore = identity.outboxStore;
  const tenancy = createTenancyKernel({
    identity: identity.service,
    outboxStore,
  });
  const org = await tenancy.service.createOrganization({
    name: "Test Org",
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
  return { identity, tenancy, rbac, owner, org, outboxStore };
}

describe("rbac integration", () => {
  it("C7: boots org admin and evaluates catalog permissions", async () => {
    const { rbac, owner, org } = await bootOrg("admin@example.com");

    const allowed = await rbac.service.authorize({
      principalId: owner.principalId,
      permissionKey: TenancyPermissions.MembershipManage,
      organizationId: org.organizationId,
    });
    expect(allowed.allowed).toBe(true);

    const denied = await rbac.service.authorize({
      principalId: owner.principalId,
      permissionKey: "identity.user.manage",
      organizationId: org.organizationId,
    });
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe("permission_denied");

    const effective = await rbac.service.listEffectivePermissions({
      principalId: owner.principalId,
      organizationId: org.organizationId,
    });
    expect(effective).toContain(RbacPermissions.AssignmentManage);
    expect(effective).toContain(TenancyPermissions.OrganizationManage);
  });

  it("denies by default without role assignment", async () => {
    const identity = createIdentityKernel();
    const owner = await registerVerified(identity.service, "plain@example.com");
    const member = await registerVerified(identity.service, "mem@example.com");
    const outboxStore = identity.outboxStore;
    const tenancy = createTenancyKernel({
      identity: identity.service,
      outboxStore,
    });
    const org = await tenancy.service.createOrganization({
      name: "NoRoles",
      ownerPrincipalId: owner.principalId,
    });
    await tenancy.service.addMembership({
      organizationId: org.organizationId,
      principalId: member.principalId,
    });
    const rbac = createRbacKernel({
      identity: identity.service,
      tenancy: tenancy.service,
      outboxStore,
    });
    await rbac.ready;

    const decision = await rbac.service.authorize({
      principalId: member.principalId,
      permissionKey: TenancyPermissions.OrganizationRead,
      organizationId: org.organizationId,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("permission_denied");
  });

  it("membership location ≠ authorization location scope", async () => {
    const { identity, tenancy, rbac, owner, org } = await bootOrg(
      "scope@example.com",
    );
    const staff = await registerVerified(identity.service, "staff@example.com");
    const locA = await tenancy.service.addLocation({
      organizationId: org.organizationId,
      name: "A",
      code: "a",
    });
    const locB = await tenancy.service.addLocation({
      organizationId: org.organizationId,
      name: "B",
      code: "b",
    });
    // Membership home location is A — authorization uses assignment locationId.
    await tenancy.service.addMembership({
      organizationId: org.organizationId,
      principalId: staff.principalId,
      locationId: locA.locationId,
    });

    const staffRole = await rbac.service.createRole({
      organizationId: org.organizationId,
      name: "Loc Reader",
      permissionKeys: [TenancyPermissions.LocationRead],
    });
    await rbac.service.assignRole({
      principalId: staff.principalId,
      organizationId: org.organizationId,
      roleId: staffRole.roleId,
      locationId: locB.locationId,
      assignedByPrincipalId: owner.principalId,
    });

    const atB = await rbac.service.authorize({
      principalId: staff.principalId,
      permissionKey: TenancyPermissions.LocationRead,
      organizationId: org.organizationId,
      locationId: locB.locationId,
    });
    expect(atB.allowed).toBe(true);

    const atA = await rbac.service.authorize({
      principalId: staff.principalId,
      permissionKey: TenancyPermissions.LocationRead,
      organizationId: org.organizationId,
      locationId: locA.locationId,
    });
    expect(atA.allowed).toBe(false);
    expect(atA.reason).toBe("location_out_of_scope");

    const orgWide = await rbac.service.authorize({
      principalId: staff.principalId,
      permissionKey: TenancyPermissions.LocationRead,
      organizationId: org.organizationId,
    });
    expect(orgWide.allowed).toBe(false);
  });

  it("post-bootstrap assign requires rbac.assignment.manage", async () => {
    const { identity, tenancy, rbac, org } = await bootOrg("gate@example.com");
    const other = await registerVerified(identity.service, "other@example.com");
    await tenancy.service.addMembership({
      organizationId: org.organizationId,
      principalId: other.principalId,
    });
    const roles = await rbac.service.listRoles(org.organizationId);
    const admin = roles.find(
      (r) => r.key === ORGANIZATION_ADMINISTRATOR_ROLE_KEY,
    )!;

    await expect(
      rbac.service.assignRole({
        principalId: other.principalId,
        organizationId: org.organizationId,
        roleId: admin.roleId,
        assignedByPrincipalId: other.principalId,
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("publishes role and assignment events via outbox", async () => {
    const { rbac, owner, org, outboxStore } = await bootOrg("evt@example.com");
    const role = await rbac.service.createRole({
      organizationId: org.organizationId,
      name: "Custom",
      permissionKeys: [TenancyPermissions.OrganizationRead],
    });
    await rbac.service.updateRolePermissions({
      roleId: role.roleId,
      permissionKeys: [
        TenancyPermissions.OrganizationRead,
        TenancyPermissions.LocationRead,
      ],
    });

    const types = new Set(
      (await outboxStore.query({})).map((r) => r.envelope.type),
    );
    expect(types.has(RbacEventTypes.PermissionRegistered)).toBe(true);
    expect(types.has(RbacEventTypes.RoleCreated)).toBe(true);
    expect(types.has(RbacEventTypes.RoleUpdated)).toBe(true);
    expect(types.has(RbacEventTypes.RoleAssignmentGranted)).toBe(true);

    const granted = await outboxStore.query({
      type: RbacEventTypes.RoleAssignmentGranted,
    });
    expect(
      granted.some(
        (r) =>
          r.envelope.organizationId === org.organizationId &&
          r.envelope.payload.principalId === owner.principalId,
      ),
    ).toBe(true);
  });

  it("revokes and changes assignment scope", async () => {
    const { identity, tenancy, rbac, owner, org } = await bootOrg(
      "rev@example.com",
    );
    const member = await registerVerified(identity.service, "m@example.com");
    const loc = await tenancy.service.addLocation({
      organizationId: org.organizationId,
      name: "HQ",
      code: "hq",
    });
    await tenancy.service.addMembership({
      organizationId: org.organizationId,
      principalId: member.principalId,
    });
    const role = await rbac.service.createRole({
      organizationId: org.organizationId,
      name: "Scoped",
      permissionKeys: [TenancyPermissions.LocationRead],
    });
    const assignment = await rbac.service.assignRole({
      principalId: member.principalId,
      organizationId: org.organizationId,
      roleId: role.roleId,
      locationId: null,
      assignedByPrincipalId: owner.principalId,
    });
    const scoped = await rbac.service.changeAssignmentScope({
      assignmentId: assignment.assignmentId,
      locationId: loc.locationId,
      actorPrincipalId: owner.principalId,
    });
    expect(scoped.locationId).toBe(loc.locationId);

    await rbac.service.revokeRole({
      principalId: member.principalId,
      organizationId: org.organizationId,
      roleId: role.roleId,
      locationId: loc.locationId,
      actorPrincipalId: owner.principalId,
    });
    const after = await rbac.service.authorize({
      principalId: member.principalId,
      permissionKey: TenancyPermissions.LocationRead,
      organizationId: org.organizationId,
      locationId: loc.locationId,
    });
    expect(after.allowed).toBe(false);
  });

  it("owner without bootstrap cannot rely on membership alone", async () => {
    const identity = createIdentityKernel();
    const owner = await registerVerified(identity.service, "noboot@example.com");
    const tenancy = createTenancyKernel({ identity: identity.service });
    const org = await tenancy.service.createOrganization({
      name: "Naked",
      ownerPrincipalId: owner.principalId,
    });
    const rbac = createRbacKernel({
      identity: identity.service,
      tenancy: tenancy.service,
      outboxStore: identity.outboxStore,
    });
    await rbac.ready;
    const decision = await rbac.service.authorize({
      principalId: owner.principalId,
      permissionKey: TenancyPermissions.OrganizationManage,
      organizationId: org.organizationId,
    });
    expect(decision.allowed).toBe(false);
  });
});
