import { describe, expect, it } from "vitest";
import {
  canReceiveNewBusiness,
  isTerminalStatus,
  PLATFORM_ROLE_KEYS,
} from "../src/domain/party.js";
import { isAllowlistedRelationshipType } from "../src/domain/relationship.js";
import {
  PartiesEventTypes,
  PARTIES_EVENT_TYPE_SET,
} from "../src/domain/events.js";
import { PARTIES_PERMISSION_KEYS } from "../src/application/permissions.js";

describe("parties domain unit", () => {
  it("platform role keys include customer/supplier/employee", () => {
    expect(PLATFORM_ROLE_KEYS).toContain("customer");
    expect(PLATFORM_ROLE_KEYS).toContain("supplier");
    expect(PLATFORM_ROLE_KEYS).toContain("employee");
  });

  it("lifecycle helpers", () => {
    expect(isTerminalStatus("deleted")).toBe(true);
    expect(isTerminalStatus("merged")).toBe(true);
    expect(isTerminalStatus("active")).toBe(false);
    expect(canReceiveNewBusiness("active")).toBe(true);
    expect(canReceiveNewBusiness("inactive")).toBe(false);
  });

  it("relationship allowlist", () => {
    expect(isAllowlistedRelationshipType("contact_of")).toBe(true);
    expect(isAllowlistedRelationshipType("unknown_edge")).toBe(false);
  });

  it("event types are catalog parties prefixes", () => {
    for (const t of PARTIES_EVENT_TYPE_SET) {
      expect(t.startsWith("parties.")).toBe(true);
    }
    expect(PartiesEventTypes.PrincipalLinked).toBe("parties.principal.linked");
  });

  it("permission keys match catalog Parties set", () => {
    expect(PARTIES_PERMISSION_KEYS).toContain("parties.party.manage");
    expect(PARTIES_PERMISSION_KEYS).toContain("parties.party.merge");
  });
});
