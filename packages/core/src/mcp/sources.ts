import { join } from "pathe";
import {
  McpConfigSchema,
  McpSourceSchema,
  type McpConfig,
  type McpSource,
} from "./types.js";
import { ensureDir, pathExists, readYaml, writeYaml } from "../fs.js";
import { sddRoot } from "../paths.js";

export function mcpConfigPath(projectRoot: string): string {
  return join(sddRoot(projectRoot), "mcp.yaml");
}

export function defaultMcpConfig(): McpConfig {
  return McpConfigSchema.parse({
    version: 1,
    auto_fetch_on_handoff: true,
    max_chars_per_source: 6000,
    sources: [],
  });
}

/**
 * Example sources (commented in written file via description only —
 * we write a real empty config + README-style top comment is hard in YAML;
 * document examples in docs).
 */
export async function loadMcpConfig(projectRoot: string): Promise<McpConfig> {
  const path = mcpConfigPath(projectRoot);
  if (!(await pathExists(path))) {
    return defaultMcpConfig();
  }
  const raw = await readYaml(path);
  return McpConfigSchema.parse(raw ?? {});
}

export async function saveMcpConfig(
  projectRoot: string,
  config: McpConfig,
): Promise<string> {
  await ensureDir(sddRoot(projectRoot));
  const path = mcpConfigPath(projectRoot);
  await writeYaml(path, McpConfigSchema.parse(config));
  return path;
}

export async function ensureMcpConfig(projectRoot: string): Promise<McpConfig> {
  const path = mcpConfigPath(projectRoot);
  if (!(await pathExists(path))) {
    const cfg = defaultMcpConfig();
    await saveMcpConfig(projectRoot, cfg);
    return cfg;
  }
  return loadMcpConfig(projectRoot);
}

export async function addMcpSource(
  projectRoot: string,
  source: McpSource,
): Promise<McpConfig> {
  const cfg = await ensureMcpConfig(projectRoot);
  const parsed = McpSourceSchema.parse(source);
  const rest = cfg.sources.filter((s) => s.id !== parsed.id);
  cfg.sources = [...rest, parsed].sort((a, b) => b.priority - a.priority);
  await saveMcpConfig(projectRoot, cfg);
  return cfg;
}

export async function removeMcpSource(
  projectRoot: string,
  id: string,
): Promise<McpConfig> {
  const cfg = await ensureMcpConfig(projectRoot);
  cfg.sources = cfg.sources.filter((s) => s.id !== id);
  await saveMcpConfig(projectRoot, cfg);
  return cfg;
}

export function interpolate(
  value: string,
  vars: Record<string, string>,
): string {
  return value.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

export function interpolateArgs(
  args: Record<string, unknown>,
  vars: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === "string") out[k] = interpolate(v, vars);
    else out[k] = v;
  }
  return out;
}
