import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  loadEventCatalog,
  validateCatalogSchema,
  ownerMatchesType,
} from "./parse-event-catalog.js";
import { CORE_PACKAGE_POLICY, EVENT_TYPE_PATTERN } from "./policy.js";
import type { CheckResult, Violation } from "./types.js";

/** Extract values from `*EventTypes = { ... } as const` blocks only. */
export function extractEventTypesConstValues(source: string): string[] {
  const found = new Set<string>();
  const blockRe =
    /(?:export\s+)?const\s+\w*EventTypes\s*=\s*\{([\s\S]*?)\}\s*as\s*const/g;
  let block: RegExpExecArray | null;
  while ((block = blockRe.exec(source)) !== null) {
    const body = block[1]!;
    const lit = /:\s*["']([^"']+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = lit.exec(body)) !== null) {
      const t = m[1]!;
      if (EVENT_TYPE_PATTERN.test(t)) {
        found.add(t);
      }
    }
  }
  return [...found];
}

export function checkEventGovernance(repoRoot: string): CheckResult {
  const catalogPath = join(repoRoot, "docs/reference/event-catalog.md");
  const catalog = loadEventCatalog(catalogPath);
  const byType = new Map(catalog.map((e) => [e.type, e]));
  const violations: Violation[] = [...validateCatalogSchema(catalog)];

  for (const policy of CORE_PACKAGE_POLICY) {
    const eventsFile = join(repoRoot, policy.path, "src/domain/events.ts");
    try {
      const text = readFileSync(eventsFile, "utf8");
      const declared = extractEventTypesConstValues(text);
      const short = policy.name.replace("@nbcp/", "");
      for (const type of declared) {
        const row = byType.get(type);
        if (!row) {
          violations.push({
            rule: "E-02",
            severity: "error",
            path: relative(repoRoot, eventsFile),
            message: `declared event type not in catalog: ${type}`,
          });
          continue;
        }
        if (!type.startsWith(`${short}.`)) {
          violations.push({
            rule: "E-02",
            severity: "error",
            path: relative(repoRoot, eventsFile),
            message: `event ${type} declared in ${policy.name} but prefix ownership mismatch`,
          });
        }
        if (!ownerMatchesType(row.owner, type)) {
          violations.push({
            rule: "E-02",
            severity: "error",
            path: "docs/reference/event-catalog.md",
            message: `catalog ownership mismatch for ${type}: owner ${row.owner}`,
          });
        }
      }
    } catch {
      violations.push({
        rule: "E-02",
        severity: "error",
        path: relative(repoRoot, eventsFile),
        message: `missing domain events declaration for ${policy.name}`,
      });
    }
  }

  return { name: "events.catalog", violations };
}

/** Pure helper for unit/failure tests. */
export function findUnknownEventTypes(
  declared: string[],
  catalogTypes: Set<string>,
): Violation[] {
  const violations: Violation[] = [];
  for (const type of declared) {
    if (!catalogTypes.has(type)) {
      violations.push({
        rule: "E-02",
        severity: "error",
        message: `declared event type not in catalog: ${type}`,
      });
    }
  }
  return violations;
}
