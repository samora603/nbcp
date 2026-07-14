import { describe, expect, it } from "vitest";
import { canAuthenticate, normalizeEmail } from "../src/domain/user.js";
import { IDENTITY_EVENT_TYPE_SET, IdentityEventTypes } from "../src/domain/events.js";
import { IdentityPermissions } from "../src/application/permissions.js";

describe("identity domain", () => {
  it("normalizes email", () => {
    expect(normalizeEmail("  Foo@Bar.COM ")).toBe("foo@bar.com");
  });

  it("blocks suspended and locked users", () => {
    const base = {
      principalId: "p1",
      email: "a@b.c",
      emailNormalized: "a@b.c",
      displayName: null,
      passwordHash: "x",
      emailVerifiedAt: null,
      failedLoginCount: 0,
      externalIdentities: [],
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
      deletedAt: null,
    };
    expect(
      canAuthenticate(
        { ...base, status: "active", lockedUntil: null },
        "2020-01-02T00:00:00.000Z",
      ).ok,
    ).toBe(true);
    expect(
      canAuthenticate(
        { ...base, status: "suspended", lockedUntil: null },
        "2020-01-02T00:00:00.000Z",
      ).ok,
    ).toBe(false);
    expect(
      canAuthenticate(
        {
          ...base,
          status: "active",
          lockedUntil: "2020-01-03T00:00:00.000Z",
        },
        "2020-01-02T00:00:00.000Z",
      ).ok,
    ).toBe(false);
  });

  it("event types are catalog-shaped", () => {
    for (const t of IDENTITY_EVENT_TYPE_SET) {
      expect(t.startsWith("identity.")).toBe(true);
    }
    expect(IdentityEventTypes.UserRegistered).toBe("identity.user.registered");
  });

  it("permission keys match catalog", () => {
    expect(IdentityPermissions.UserManage).toBe("identity.user.manage");
    expect(IdentityPermissions.SessionRevoke).toBe("identity.session.revoke");
  });
});
