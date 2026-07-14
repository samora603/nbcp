import { describe, expect, it } from "vitest";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runAllChecks } from "../src/run-all.js";
import { checkBoundaries } from "../src/check-boundaries.js";
import { checkEventGovernance } from "../src/check-events.js";
import { checkPermissionGovernance } from "../src/check-permissions.js";
import { checkOutboxEnforcement } from "../src/check-docs.js";
import { checkAdrCompliance } from "../src/check-docs.js";
import { errorsOf } from "../src/types.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("architecture enforcement — live repo", () => {
  it("passes all gates on current kernel (E2–E4+)", () => {
    const report = runAllChecks({ repoRoot });
    if (!report.ok) {
      console.error(report.formatted);
    }
    expect(report.ok).toBe(true);
    expect(report.errorCount).toBe(0);
  });

  it("boundary check returns structured results", () => {
    const results = checkBoundaries(repoRoot);
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(errorsOf(results)).toEqual([]);
  });

  it("event governance finds catalogued Core types", () => {
    const result = checkEventGovernance(repoRoot);
    expect(result.violations.filter((v) => v.severity === "error")).toEqual([]);
  });

  it("permission seeds ⊆ catalog", () => {
    const result = checkPermissionGovernance(repoRoot);
    expect(result.violations.filter((v) => v.severity === "error")).toEqual([]);
  });

  it("outbox enforcement for SECURITY modules", () => {
    const result = checkOutboxEnforcement(repoRoot);
    expect(result.violations.filter((v) => v.severity === "error")).toEqual([]);
  });

  it("ADRs 0001–0006 are Accepted", () => {
    const result = checkAdrCompliance(repoRoot);
    expect(result.violations).toEqual([]);
  });
});
