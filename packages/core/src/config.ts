import { SddError } from "./errors.js";
import { ensureDir, pathExists, readYaml, writeYaml } from "./fs.js";
import { configPath, sddRoot } from "./paths.js";
import { type Config, ConfigSchema } from "./schemas.js";

export async function isInitialized(projectRoot: string): Promise<boolean> {
  return pathExists(configPath(projectRoot));
}

export async function loadConfig(projectRoot: string): Promise<Config> {
  const path = configPath(projectRoot);
  if (!(await pathExists(path))) {
    throw new SddError(`SDD is not initialized in ${projectRoot}. Run \`sdd init\` first.`, {
      code: "NOT_INITIALIZED",
      hint: "cd into your app and run: sdd init --here --ai copilot",
    });
  }
  const raw = await readYaml(path);
  return ConfigSchema.parse(raw);
}

export async function saveConfig(projectRoot: string, config: Config): Promise<void> {
  await ensureDir(sddRoot(projectRoot));
  await writeYaml(configPath(projectRoot), ConfigSchema.parse(config));
}

export function defaultConfig(): Config {
  return ConfigSchema.parse({});
}
