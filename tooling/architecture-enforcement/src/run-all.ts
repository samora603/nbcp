import { checkBoundaries } from "./check-boundaries.js";
import { checkEventGovernance } from "./check-events.js";
import { checkPermissionGovernance } from "./check-permissions.js";
import {
  checkOutboxEnforcement,
  checkRepositoryGovernance,
} from "./check-docs.js";
import type { CheckResult } from "./types.js";
import { errorsOf, formatViolations } from "./types.js";

export interface EnforceOptions {
  repoRoot: string;
  /** When true, permission violations are errors (E5 blocking). Default true for M6. */
  failOnPermission?: boolean;
}

export interface EnforceReport {
  results: CheckResult[];
  errorCount: number;
  warningCount: number;
  ok: boolean;
  formatted: string;
}

export function runAllChecks(options: EnforceOptions): EnforceReport {
  const results: CheckResult[] = [
    ...checkBoundaries(options.repoRoot),
    checkEventGovernance(options.repoRoot),
    checkPermissionGovernance(options.repoRoot),
    checkOutboxEnforcement(options.repoRoot),
    ...checkRepositoryGovernance(options.repoRoot),
  ];

  if (options.failOnPermission === false) {
    for (const r of results) {
      if (r.name === "permissions.catalog") {
        for (const v of r.violations) {
          if (v.severity === "error" && (v.rule === "P-02" || v.rule === "P-01")) {
            v.severity = "warning";
          }
        }
      }
    }
  }

  const allViolations = results.flatMap((r) => r.violations);
  const errs = allViolations.filter((v) => v.severity === "error");
  const warns = allViolations.filter((v) => v.severity === "warning");

  return {
    results,
    errorCount: errs.length,
    warningCount: warns.length,
    ok: errs.length === 0,
    formatted: formatViolations(allViolations),
  };
}

export { errorsOf, formatViolations };
