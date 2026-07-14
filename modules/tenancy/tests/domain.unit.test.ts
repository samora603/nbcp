import { describe, expect, it } from "vitest";
import { normalizeInviteEmail, isInvitationAcceptable } from "../src/domain/invitation.js";
import { TENANCY_EVENT_TYPE_SET, TenancyEventTypes } from "../src/domain/events.js";
import { TenancyPermissions } from "../src/application/permissions.js";

describe("tenancy domain", () => {
  it("normalizes invite emails", () => {
    expect(normalizeInviteEmail("  A@B.Com ")).toBe("a@b.com");
  });

  it("acceptability requires pending and unexpired", () => {
    const base = {
      invitationId: "i1",
      organizationId: "o1",
      email: "a@b.c",
      emailNormalized: "a@b.c",
      invitedByPrincipalId: "p1",
      locationId: null,
      suggestedRoleKey: null,
      tokenHash: "h",
      acceptedByPrincipalId: null,
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
    };
    expect(
      isInvitationAcceptable(
        {
          ...base,
          state: "pending",
          expiresAt: "2020-02-01T00:00:00.000Z",
        },
        "2020-01-15T00:00:00.000Z",
      ),
    ).toBe(true);
    expect(
      isInvitationAcceptable(
        {
          ...base,
          state: "revoked",
          expiresAt: "2020-02-01T00:00:00.000Z",
        },
        "2020-01-15T00:00:00.000Z",
      ),
    ).toBe(false);
  });

  it("event types are catalog-shaped", () => {
    for (const t of TENANCY_EVENT_TYPE_SET) {
      expect(t.startsWith("tenancy.")).toBe(true);
    }
    expect(TenancyEventTypes.OrganizationCreated).toBe(
      "tenancy.organization.created",
    );
  });

  it("permissions match catalog", () => {
    expect(TenancyPermissions.InvitationManage).toBe(
      "tenancy.invitation.manage",
    );
    expect(TenancyPermissions.OrganizationTransferOwner).toBe(
      "tenancy.organization.transfer_owner",
    );
  });
});
