import { describe, expect, it } from "vitest";
import {
  isValidPermissionKey,
  PERMISSION_KEY_PATTERN,
} from "../src/domain/permission.js";
import { ORGANIZATION_ADMINISTRATOR_ROLE_KEY } from "../src/domain/role.js";
import {
  CORE_PERMISSION_SEEDS,
  ORGANIZATION_ADMINISTRATOR_PERMISSIONS,
} from "../src/application/catalog-seeds.js";
import { RbacEventTypes, RBAC_EVENT_TYPE_SET } from "../src/domain/events.js";
import { allow, deny } from "../src/domain/authz.js";

describe("rbac domain unit", () => {
  it("validates permission key pattern", () => {
    expect(PERMISSION_KEY_PATTERN.test("tenancy.organization.read")).toBe(
      true,
    );
    expect(isValidPermissionKey("rbac.assignment.manage")).toBe(true);
    expect(isValidPermissionKey("Invalid")).toBe(false);
    expect(isValidPermissionKey("single")).toBe(false);
  });

  it("seeds ⊆ catalog-shaped keys and admin bindings", () => {
    for (const seed of CORE_PERMISSION_SEEDS) {
      expect(isValidPermissionKey(seed.key)).toBe(true);
    }
    for (const key of ORGANIZATION_ADMINISTRATOR_PERMISSIONS) {
      expect(CORE_PERMISSION_SEEDS.some((s) => s.key === key)).toBe(true);
    }
    expect(ORGANIZATION_ADMINISTRATOR_ROLE_KEY).toBe(
      "organization.administrator",
    );
  });

  it("event types are catalog rbac prefixes", () => {
    for (const t of RBAC_EVENT_TYPE_SET) {
      expect(t.startsWith("rbac.")).toBe(true);
    }
    expect(RbacEventTypes.RoleAssignmentGranted).toBe(
      "rbac.role_assignment.granted",
    );
  });

  it("authz helpers", () => {
    expect(allow()).toEqual({ allowed: true });
    expect(deny("permission_denied")).toEqual({
      allowed: false,
      reason: "permission_denied",
    });
  });
});
