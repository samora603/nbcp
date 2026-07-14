import { readFileSync } from "node:fs";
import { PERMISSION_KEY_PATTERN } from "./policy.js";

/**
 * Extract permission keys from permission-catalog.md table rows.
 */
export function parsePermissionCatalog(markdown: string): string[] {
  const keys = new Set<string>();
  const row = /^\|\s*`([^`]+)`\s*\|/;
  for (const line of markdown.split("\n")) {
    const m = line.match(row);
    if (!m) continue;
    const key = m[1]!.trim();
    if (PERMISSION_KEY_PATTERN.test(key)) {
      keys.add(key);
    }
  }
  return [...keys].sort();
}

export function loadPermissionCatalog(catalogPath: string): string[] {
  return parsePermissionCatalog(readFileSync(catalogPath, "utf8"));
}
