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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeDefaults(defaults: unknown, overrides: unknown): unknown {
  if (!isRecord(defaults) || !isRecord(overrides)) return overrides ?? defaults;

  const merged = Object.create(null) as Record<string, unknown>;
  for (const [key, value] of Object.entries(defaults)) {
    merged[key] = Object.hasOwn(overrides, key) ? mergeDefaults(value, overrides[key]) : value;
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (!Object.hasOwn(defaults, key)) merged[key] = value;
  }
  return merged;
}

/** Merge a user's config over current defaults, then validate and strip unsupported keys. */
export function mergeConfigDefaults(existing: unknown): Config {
  return ConfigSchema.parse(mergeDefaults(defaultConfig(), existing));
}
