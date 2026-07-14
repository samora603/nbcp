#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { runAllChecks } from "./run-all.js";

function findRepoRoot(start: string): string {
  if (process.env.NBCP_ROOT) {
    return resolve(process.env.NBCP_ROOT);
  }
  let dir = resolve(start);
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(start);
}

const repoRoot = findRepoRoot(process.cwd());

const report = runAllChecks({ repoRoot });

for (const result of report.results) {
  const err = result.violations.filter((v) => v.severity === "error").length;
  const warn = result.violations.filter((v) => v.severity === "warning").length;
  const status = err > 0 ? "FAIL" : warn > 0 ? "WARN" : "OK";
  console.log(`${status.padEnd(4)} ${result.name} (errors=${err}, warnings=${warn})`);
}

if (report.formatted) {
  console.log("\nViolations:\n" + report.formatted);
}

if (!report.ok) {
  console.error(
    `\nArchitecture enforcement failed: ${report.errorCount} error(s), ${report.warningCount} warning(s)`,
  );
  process.exit(1);
}

console.log(
  `\nArchitecture enforcement passed (${report.warningCount} warning(s)). Root: ${repoRoot}`,
);
