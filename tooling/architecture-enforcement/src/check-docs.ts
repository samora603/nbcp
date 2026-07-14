import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  REQUIRED_ADRS,
  REQUIRED_ARCHITECTURE_DOCS,
  SECURITY_OUTBOX_MODULES,
} from "./policy.js";
import { listWorkspaceModuleDirs, listTsFiles, readPackageJson } from "./fs-utils.js";
import type { CheckResult, Violation } from "./types.js";

export function checkAdrCompliance(repoRoot: string): CheckResult {
  const violations: Violation[] = [];

  for (const rel of REQUIRED_ADRS) {
    const file = join(repoRoot, rel);
    if (!existsSync(file)) {
      violations.push({
        rule: "A-01",
        severity: "error",
        path: rel,
        message: "required ADR missing",
      });
      continue;
    }
    const text = readFileSync(file, "utf8");
    if (!/^\s*-\s*\*\*Status:\*\*\s*Accepted/m.test(text)) {
      violations.push({
        rule: "A-02",
        severity: "error",
        path: rel,
        message: "ADR Status must be Accepted",
      });
    }
  }

  for (const rel of REQUIRED_ARCHITECTURE_DOCS) {
    if (!existsSync(join(repoRoot, rel))) {
      violations.push({
        rule: "A-01",
        severity: "error",
        path: rel,
        message: "required architecture documentation missing",
      });
    }
  }

  return { name: "docs.adr", violations };
}

export function checkModuleDocumentation(repoRoot: string): CheckResult {
  const violations: Violation[] = [];

  for (const modDir of listWorkspaceModuleDirs(repoRoot)) {
    const pkg = readPackageJson(modDir);
    const short = pkg?.name?.replace("@nbcp/", "") ?? relative(repoRoot, modDir);
    const relMod = relative(repoRoot, modDir);

    for (const req of ["README.md", "CHANGELOG.md"]) {
      if (!existsSync(join(modDir, req))) {
        violations.push({
          rule: "DOC-01",
          severity: "error",
          path: join(relMod, req),
          message: `module package missing ${req}`,
        });
      }
    }

    const design = join(repoRoot, "docs/modules", short, "design.md");
    if (!existsSync(design)) {
      violations.push({
        rule: "DOC-01",
        severity: "error",
        path: `docs/modules/${short}/design.md`,
        message: `module ${short} missing design.md`,
      });
    }
  }

  // packages/outbox
  const outbox = join(repoRoot, "packages/outbox");
  if (existsSync(join(outbox, "package.json"))) {
    for (const req of ["README.md", "CHANGELOG.md"]) {
      if (!existsSync(join(outbox, req))) {
        violations.push({
          rule: "DOC-01",
          severity: "error",
          path: `packages/outbox/${req}`,
          message: `package missing ${req}`,
        });
      }
    }
  }

  return { name: "docs.modules", violations };
}

export function checkExceptionsRegister(repoRoot: string): CheckResult {
  const violations: Violation[] = [];
  const register = join(repoRoot, "docs/adr/exceptions/README.md");
  if (!existsSync(register)) {
    violations.push({
      rule: "C-06",
      severity: "error",
      path: "docs/adr/exceptions/README.md",
      message: "exceptions register missing",
    });
    return { name: "docs.exceptions", violations };
  }

  const text = readFileSync(register, "utf8");
  // Expired rows: | ... | YYYY-MM-DD | where date < today and status Active
  const row =
    /^\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|\s*(Active|Expired)\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|/i;
  const today = new Date().toISOString().slice(0, 10);
  for (const line of text.split("\n")) {
    const m = line.match(row);
    if (!m) continue;
    const status = m[5]!.trim();
    const expires = m[6]!.trim();
    if (status.toLowerCase() === "active" && expires < today) {
      violations.push({
        rule: "C-06",
        severity: "error",
        path: "docs/adr/exceptions/README.md",
        message: `expired active exception (expires ${expires}): ${m[1]!.trim()}`,
      });
    }
  }

  return { name: "docs.exceptions", violations };
}

export function checkOutboxEnforcement(repoRoot: string): CheckResult {
  const violations: Violation[] = [];

  for (const mod of SECURITY_OUTBOX_MODULES) {
    const src = join(repoRoot, mod, "src");
    const files = listTsFiles(src);
    const all = files.map((f) => readFileSync(f, "utf8")).join("\n");
    if (!all.includes("@nbcp/outbox")) {
      violations.push({
        rule: "O-01",
        severity: "error",
        path: mod,
        message: "SECURITY module must depend on / import @nbcp/outbox",
      });
    }
    if (!/outbox\.append|OutboxWriter/.test(all)) {
      violations.push({
        rule: "O-01",
        severity: "error",
        path: mod,
        message: "SECURITY module must stage outbox appends (OutboxWriter / outbox.append)",
      });
    }

    const archTest = join(repoRoot, mod, "tests/architecture.test.ts");
    if (!existsSync(archTest)) {
      violations.push({
        rule: "O-01",
        severity: "error",
        path: `${mod}/tests/architecture.test.ts`,
        message: "missing architecture test suite for SECURITY outbox path",
      });
    } else {
      const arch = readFileSync(archTest, "utf8");
      if (!/outbox/i.test(arch)) {
        violations.push({
          rule: "O-01",
          severity: "error",
          path: `${mod}/tests/architecture.test.ts`,
          message: "architecture tests must assert outbox behavior",
        });
      }
    }
  }

  // Envelope validation lives in outbox package
  const validate = join(
    repoRoot,
    "packages/outbox/src/validate-envelope.ts",
  );
  if (!existsSync(validate)) {
    violations.push({
      rule: "O-04",
      severity: "error",
      message: "missing envelope validation module",
    });
  }

  // Audit idempotency consumer present
  const auditIngest = join(
    repoRoot,
    "modules/audit/src/application/audit-event-ingestor.ts",
  );
  if (!existsSync(auditIngest)) {
    violations.push({
      rule: "O-05",
      severity: "error",
      message: "missing audit event ingestor (idempotent consumer)",
    });
  } else {
    const text = readFileSync(auditIngest, "utf8");
    if (!/deliverIdempotent/.test(text)) {
      violations.push({
        rule: "O-05",
        severity: "error",
        path: "modules/audit/src/application/audit-event-ingestor.ts",
        message: "audit consumer must use deliverIdempotent",
      });
    }
  }

  return { name: "outbox.enforcement", violations };
}

export function checkRepositoryGovernance(repoRoot: string): CheckResult[] {
  return [
    checkAdrCompliance(repoRoot),
    checkModuleDocumentation(repoRoot),
    checkExceptionsRegister(repoRoot),
  ];
}
