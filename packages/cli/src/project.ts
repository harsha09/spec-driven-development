import { consola } from "consola";
import {
  isInitialized,
  loadConfig,
  type Config,
} from "@structured-vibe-coding/core";

export function projectRoot(): string {
  return process.cwd();
}

export type ProjectCtx = {
  root: string;
  config: Config;
};

/**
 * Load initialized project and run work. Standardizes requireInit + try/catch + exit.
 */
export async function withProject(
  work: (ctx: ProjectCtx) => Promise<void>,
): Promise<void> {
  const root = projectRoot();
  if (!(await isInitialized(root))) {
    consola.error("SDD is not initialized here. Run `sdd init` first.");
    process.exit(1);
  }
  try {
    const config = await loadConfig(root);
    await work({ root, config });
  } catch (err) {
    consola.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

/** Commands that do not need config (e.g. agents refresh after init check only). */
export async function withInitialized(
  work: (root: string) => Promise<void>,
): Promise<void> {
  const root = projectRoot();
  if (!(await isInitialized(root))) {
    consola.error("SDD is not initialized here. Run `sdd init` first.");
    process.exit(1);
  }
  try {
    await work(root);
  } catch (err) {
    consola.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
