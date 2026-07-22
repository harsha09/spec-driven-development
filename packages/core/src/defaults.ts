import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "pathe";

/**
 * Packaged default assets shipped with @structured-vibe-coding/core.
 * Resolves correctly for:
 * - package layout: packages/core/dist/index.js → ../defaults
 * - source/tests: packages/core/src → ../defaults
 */
export function defaultsRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "..", "defaults"), // npm package: dist/../defaults
    join(here, "defaults"), // same-dir defaults if present
    join(here, "..", "..", "defaults"), // src/ during some test runners
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  // Fall back to package-relative path (init will fail clearly if missing)
  return candidates[0]!;
}

export function defaultWorkflowsDir(): string {
  return join(defaultsRoot(), "workflows");
}

export function defaultTemplatesDir(): string {
  return join(defaultsRoot(), "templates");
}

export function defaultMemoryDir(): string {
  return join(defaultsRoot(), "memory");
}
