import { join } from "pathe";
import type { Config } from "./schemas.js";

export const SDD_DIR = ".sdd";

export function sddRoot(projectRoot: string): string {
  return join(projectRoot, SDD_DIR);
}

export function configPath(projectRoot: string): string {
  return join(sddRoot(projectRoot), "config.yaml");
}

export function workflowsDir(projectRoot: string): string {
  return join(sddRoot(projectRoot), "workflows");
}

export function templatesDir(projectRoot: string): string {
  return join(sddRoot(projectRoot), "templates");
}

export function memoryDir(projectRoot: string, config: Config): string {
  return join(projectRoot, config.memory_path);
}

/** Project-relative memory folder, always with a trailing slash stripped. */
export function memoryPathRel(config: Pick<Config, "memory_path">): string {
  return config.memory_path.replace(/\/+$/, "") || "memory";
}

/** Project-relative changes folder, always with a trailing slash stripped. */
export function changesPathRel(config: Pick<Config, "changes_path">): string {
  return config.changes_path.replace(/\/+$/, "") || "changes";
}

/** Repo-relative change directory shown to humans. Never an absolute machine path. */
export function displayChangePath(config: Pick<Config, "changes_path">, changeId: string): string {
  return `${changesPathRel(config)}/${changeId}`;
}

/** Paths agents should be told to read, taken from config rather than defaults. */
export function guidancePaths(config: Pick<Config, "memory_path" | "changes_path">): {
  memory: string;
  changes: string;
  constitution: string;
  memoryIndex: string;
} {
  const memory = memoryPathRel(config);
  const changes = changesPathRel(config);
  return {
    memory,
    changes,
    constitution: `${memory}/constitution.md`,
    memoryIndex: `${memory}/index.md`,
  };
}

export function changesDir(projectRoot: string, config: Config): string {
  return join(projectRoot, config.changes_path);
}

export function archiveDir(projectRoot: string, config: Config): string {
  return join(projectRoot, config.archive_path);
}

export function domainsDir(projectRoot: string, config: Config): string {
  return join(projectRoot, config.domains_path);
}

export function changePath(projectRoot: string, config: Config, changeId: string): string {
  return join(changesDir(projectRoot, config), changeId);
}

export function changeMetaPath(projectRoot: string, config: Config, changeId: string): string {
  return join(changePath(projectRoot, config, changeId), "meta.yaml");
}

export function activePointerPath(projectRoot: string, config: Config): string {
  return join(changesDir(projectRoot, config), ".active");
}
