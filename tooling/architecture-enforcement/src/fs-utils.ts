import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface PackageManifest {
  path: string;
  name: string;
  dependencies: Record<string, string>;
  nbcp?: {
    layer?: string;
    moduleDependencies?: string[];
  };
}

export function listTsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...listTsFiles(full));
    } else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

export function readPackageJson(packageDir: string): PackageManifest | null {
  const pkgPath = join(packageDir, "package.json");
  if (!existsSync(pkgPath)) return null;
  const raw = JSON.parse(readFileSync(pkgPath, "utf8")) as {
    name?: string;
    dependencies?: Record<string, string>;
    nbcp?: PackageManifest["nbcp"];
  };
  return {
    path: packageDir,
    name: raw.name ?? packageDir,
    dependencies: raw.dependencies ?? {},
    ...(raw.nbcp ? { nbcp: raw.nbcp } : {}),
  };
}

export function listWorkspaceModuleDirs(repoRoot: string): string[] {
  const modulesRoot = join(repoRoot, "modules");
  if (!existsSync(modulesRoot)) return [];
  return readdirSync(modulesRoot)
    .filter((n) => !n.startsWith("_") && !n.startsWith("."))
    .map((n) => join(modulesRoot, n))
    .filter((p) => statSync(p).isDirectory() && existsSync(join(p, "package.json")));
}

export function extractImportSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const re =
    /(?:import|export)\s+(?:type\s+)?(?:[^"']*\s+from\s+)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    specs.push(m[1] ?? m[2] ?? "");
  }
  return specs.filter(Boolean);
}

/** Event type string literals that look like catalog types. */
export function extractEventTypeLiterals(source: string): string[] {
  const found = new Set<string>();
  const re = /["']([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){1,})["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const t = m[1]!;
    // Heuristic: multi-segment domain events (module.resource.verb)
    if (t.split(".").length >= 3) {
      found.add(t);
    }
  }
  return [...found];
}

export function extractPermissionLiterals(source: string): string[] {
  const found = new Set<string>();
  const re = /["']([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const t = m[1]!;
    // permission keys are usually 2-3 segments; overlap with events filtered by caller
    if (t.split(".").length >= 2 && t.split(".").length <= 4) {
      found.add(t);
    }
  }
  return [...found];
}
