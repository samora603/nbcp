import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkPackageBoundaries } from "../src/check-boundaries.js";
import { findUnknownEventTypes } from "../src/check-events.js";
import { findUnknownPermissions } from "../src/check-permissions.js";
import {
  parseEventCatalog,
  validateCatalogSchema,
} from "../src/parse-event-catalog.js";
import { parsePermissionCatalog } from "../src/parse-permission-catalog.js";
import { checkExceptionsRegister } from "../src/check-docs.js";
import { FORBIDDEN_EDGES } from "../src/policy.js";

describe("architecture enforcement — failure cases", () => {
  it("fails unknown event types (E-02)", () => {
    const catalog = new Set(["identity.user.registered"]);
    const violations = findUnknownEventTypes(
      ["identity.user.registered", "identity.user.haxxed"],
      catalog,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain("identity.user.haxxed");
  });

  it("fails unknown permission keys (P-02)", () => {
    const catalog = new Set(["audit.read"]);
    const violations = findUnknownPermissions(
      ["audit.read", "orders.superpower"],
      catalog,
    );
    expect(
      violations.some((v) => v.message.includes("orders.superpower")),
    ).toBe(true);
  });

  it("fails catalog schema without classification (E-05)", () => {
    const md = `
| Event | Owner Module | Classification | Consumers | Replayable | Version | Status |
| --- | --- | --- | --- | --- | --- | --- |
| \`identity.user.registered\` | Identity | NOT_A_CLASS | Audit | Yes | 1 | Published |
`;
    const events = parseEventCatalog(md);
    const violations = validateCatalogSchema(events);
    expect(violations.some((v) => v.rule === "E-05")).toBe(true);
  });

  it("parses permission catalog keys", () => {
    const md = `
| Permission key | Module owner | Description | Intended roles |
| --- | --- | --- | --- |
| \`tenancy.organization.read\` | Tenancy | View | admin |
| \`bad\` | X | skip | |
`;
    expect(parsePermissionCatalog(md)).toEqual(["tenancy.organization.read"]);
  });

  it("fails Identity → Tenancy package edge (B-03/D-01)", () => {
    const root = mkdtempSync(join(tmpdir(), "nbcp-enf-"));
    mkdirSync(join(root, "modules/identity"), { recursive: true });
    mkdirSync(join(root, "modules/tenancy"), { recursive: true });
    mkdirSync(join(root, "modules/rbac"), { recursive: true });
    mkdirSync(join(root, "modules/audit"), { recursive: true });
    mkdirSync(join(root, "packages/outbox"), { recursive: true });

    writeFileSync(
      join(root, "modules/identity/package.json"),
      JSON.stringify({
        name: "@nbcp/identity",
        dependencies: {
          "@nbcp/outbox": "workspace:*",
          "@nbcp/tenancy": "workspace:*",
        },
      }),
    );
    for (const [path, name, deps] of [
      ["modules/tenancy", "@nbcp/tenancy", { "@nbcp/identity": "workspace:*" }],
      [
        "modules/rbac",
        "@nbcp/rbac",
        {
          "@nbcp/identity": "workspace:*",
          "@nbcp/tenancy": "workspace:*",
        },
      ],
      [
        "modules/audit",
        "@nbcp/audit",
        {
          "@nbcp/identity": "workspace:*",
          "@nbcp/tenancy": "workspace:*",
          "@nbcp/rbac": "workspace:*",
        },
      ],
      ["packages/outbox", "@nbcp/outbox", {}],
    ] as const) {
      writeFileSync(
        join(root, path, "package.json"),
        JSON.stringify({ name, dependencies: deps }),
      );
    }

    const result = checkPackageBoundaries(root);
    expect(result.violations.some((v) => v.severity === "error")).toBe(true);
    expect(
      result.violations.some(
        (v) =>
          v.message.includes("@nbcp/tenancy") || v.message.includes("Identity"),
      ),
    ).toBe(true);
  });

  it("fails expired Active exception (C-06)", () => {
    const root = mkdtempSync(join(tmpdir(), "nbcp-exc-"));
    mkdirSync(join(root, "docs/adr/exceptions"), { recursive: true });
    writeFileSync(
      join(root, "docs/adr/exceptions/README.md"),
      `| ID | Rule | Scope | Reason | Status | Expires |
| --- | --- | --- | --- | --- | --- |
| EX-1 | B-03 | modules/identity | temp | Active | 2020-01-01 |
`,
    );
    const result = checkExceptionsRegister(root);
    expect(result.violations.some((v) => v.rule === "C-06")).toBe(true);
  });

  it("policy forbids Payments → Ledger (D-02)", () => {
    expect(
      FORBIDDEN_EDGES.some(
        ([a, b]) => a === "@nbcp/payments" && b === "@nbcp/ledger",
      ),
    ).toBe(true);

    const root = mkdtempSync(join(tmpdir(), "nbcp-pay-"));
    for (const path of [
      "modules/identity",
      "modules/tenancy",
      "modules/rbac",
      "modules/audit",
      "modules/payments",
      "packages/outbox",
    ]) {
      mkdirSync(join(root, path), { recursive: true });
    }
    writeFileSync(
      join(root, "modules/identity/package.json"),
      JSON.stringify({
        name: "@nbcp/identity",
        dependencies: { "@nbcp/outbox": "workspace:*" },
      }),
    );
    writeFileSync(
      join(root, "modules/tenancy/package.json"),
      JSON.stringify({
        name: "@nbcp/tenancy",
        dependencies: {
          "@nbcp/outbox": "workspace:*",
          "@nbcp/identity": "workspace:*",
        },
      }),
    );
    writeFileSync(
      join(root, "modules/rbac/package.json"),
      JSON.stringify({
        name: "@nbcp/rbac",
        dependencies: {
          "@nbcp/identity": "workspace:*",
          "@nbcp/tenancy": "workspace:*",
        },
      }),
    );
    writeFileSync(
      join(root, "modules/audit/package.json"),
      JSON.stringify({
        name: "@nbcp/audit",
        dependencies: {
          "@nbcp/identity": "workspace:*",
          "@nbcp/tenancy": "workspace:*",
          "@nbcp/rbac": "workspace:*",
        },
      }),
    );
    writeFileSync(
      join(root, "packages/outbox/package.json"),
      JSON.stringify({ name: "@nbcp/outbox", dependencies: {} }),
    );
    writeFileSync(
      join(root, "modules/payments/package.json"),
      JSON.stringify({
        name: "@nbcp/payments",
        dependencies: { "@nbcp/ledger": "workspace:*" },
      }),
    );

    const result = checkPackageBoundaries(root);
    expect(
      result.violations.some(
        (v) =>
          v.rule === "D-02" &&
          v.message.includes("@nbcp/payments") &&
          v.message.includes("@nbcp/ledger"),
      ),
    ).toBe(true);
  });
});
