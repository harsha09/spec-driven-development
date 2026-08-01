import {
  type Config,
  errorMessage,
  isInitialized,
  isSddError,
  loadConfig,
} from "@structured-vibe-coding/core";
import { consola } from "consola";

/**
 * Project root for CLI.
 * Prefer SDD_PROJECT_ROOT when set (e.g. scripts).
 */
export function projectRoot(): string {
  const fromEnv = process.env.SDD_PROJECT_ROOT?.trim();
  if (fromEnv) return fromEnv;
  return process.cwd();
}

export type ProjectCtx = {
  root: string;
  config: Config;
};

function fail(err: unknown): never {
  if (isSddError(err)) {
    consola.error(err.message);
    if (err.hint) consola.info(err.hint);
    process.exit(err.exitCode);
  }
  consola.error(errorMessage(err));
  process.exit(1);
}

/**
 * Load initialized project and run work. Standardizes requireInit + try/catch + exit.
 */
export async function withProject(work: (ctx: ProjectCtx) => Promise<void>): Promise<void> {
  const root = projectRoot();
  if (!(await isInitialized(root))) {
    consola.error("SDD is not initialized here. Run `sdd init` first.");
    consola.info("Example: sdd init --here --ai copilot");
    process.exit(1);
  }
  try {
    const config = await loadConfig(root);
    await work({ root, config });
  } catch (err) {
    fail(err);
  }
}

/** Commands that do not need config (e.g. agents refresh after init check only). */
export async function withInitialized(work: (root: string) => Promise<void>): Promise<void> {
  const root = projectRoot();
  if (!(await isInitialized(root))) {
    consola.error("SDD is not initialized here. Run `sdd init` first.");
    consola.info("Example: sdd init --here --ai copilot");
    process.exit(1);
  }
  try {
    await work(root);
  } catch (err) {
    fail(err);
  }
}
