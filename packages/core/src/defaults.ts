import { fileURLToPath } from "node:url";
import { dirname, join } from "pathe";

/** Packaged default assets shipped with @structured-vibe/core */
export function defaultsRoot(): string {
  // defaults/ lives next to package root (copied/kept outside dist)
  const here = dirname(fileURLToPath(import.meta.url));
  // dist/ -> package root
  return join(here, "..", "defaults");
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
