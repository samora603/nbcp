/** Permission catalog keys owned by Reporting (S7). */
export const ReportingPermissions = {
  Read: "reporting.read",
  Export: "reporting.export",
  KpiRead: "reporting.kpi.read",
} as const;

export type ReportingPermission =
  (typeof ReportingPermissions)[keyof typeof ReportingPermissions];

export const REPORTING_PERMISSION_KEYS: readonly string[] = Object.values(
  ReportingPermissions,
);
