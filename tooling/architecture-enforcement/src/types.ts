export type Severity = "error" | "warning";

export interface Violation {
  rule: string;
  severity: Severity;
  message: string;
  path?: string;
}

export interface CheckResult {
  name: string;
  violations: Violation[];
}

export function errorsOf(results: CheckResult[]): Violation[] {
  return results.flatMap((r) =>
    r.violations.filter((v) => v.severity === "error"),
  );
}

export function formatViolations(violations: Violation[]): string {
  return violations
    .map(
      (v) =>
        `[${v.severity.toUpperCase()}] ${v.rule}${v.path ? ` (${v.path})` : ""}: ${v.message}`,
    )
    .join("\n");
}
