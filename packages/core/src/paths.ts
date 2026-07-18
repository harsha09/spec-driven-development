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
