import { ConfigSchema, type Config } from "./schemas.js";
import { pathExists, readYaml, writeYaml, ensureDir } from "./fs.js";
import { configPath, sddRoot } from "./paths.js";

export async function isInitialized(projectRoot: string): Promise<boolean> {
  return pathExists(configPath(projectRoot));
}

export async function loadConfig(projectRoot: string): Promise<Config> {
  const path = configPath(projectRoot);
  if (!(await pathExists(path))) {
    throw new Error(
      `SDD is not initialized in ${projectRoot}. Run \`sdd init\` first.`,
    );
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
