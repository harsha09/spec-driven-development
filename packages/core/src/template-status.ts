import { lstat } from "node:fs/promises";
import { join } from "pathe";
import { parse as parseYaml } from "yaml";
import { defaultTeamsDir, defaultTemplatesDir, defaultWorkflowsDir } from "./defaults.js";
import { listDirs, listFiles, pathExists, readText } from "./fs.js";
import { contentHash, loadGeneratedManifest } from "./generated.js";
import { sddRoot } from "./paths.js";
import { listTeamTemplates } from "./role/team.js";

export type GeneratedFileKind = "workflow" | "template" | "role";

/** Manifest-tracked workflow, template, or role file state. */
export type GeneratedFileState = "stock" | "customized" | "stock-but-outdated" | "unknown";

export interface GeneratedFileStatus {
  path: string;
  kind: GeneratedFileKind;
  state: GeneratedFileState;
}

export interface TemplateStatusSummary {
  stock: number;
  customized: number;
  "stock-but-outdated": number;
  unknown: number;
}

export interface TemplateStatusReport {
  version: 1;
  files: GeneratedFileStatus[];
  summary: TemplateStatusSummary;
}

export function classifyGeneratedFile(opts: {
  manifestHash?: string;
  currentHash: string;
  shippedHash?: string;
}): GeneratedFileState {
  const { manifestHash, currentHash, shippedHash } = opts;
  if (!manifestHash) return "unknown";
  if (currentHash !== manifestHash) return "customized";
  if (shippedHash !== undefined && manifestHash !== shippedHash) return "stock-but-outdated";
  return "stock";
}

function kindForPath(projectRelative: string): GeneratedFileKind | null {
  if (projectRelative.startsWith(".sdd/workflows/")) return "workflow";
  if (projectRelative.startsWith(".sdd/templates/")) return "template";
  if (projectRelative.startsWith(".sdd/roles/")) return "role";
  return null;
}

async function defaultFiles(sourceDir: string, relativeDir = ""): Promise<string[]> {
  if (!(await pathExists(sourceDir))) return [];
  const files = (await listFiles(join(sourceDir, relativeDir))).map((file) =>
    [relativeDir, file].filter(Boolean).join("/"),
  );
  const nested = await Promise.all(
    (await listDirs(join(sourceDir, relativeDir))).map((dir) =>
      defaultFiles(sourceDir, [relativeDir, dir].filter(Boolean).join("/")),
    ),
  );
  return [...files, ...nested.flat()].sort();
}

async function readTeamTemplateName(projectRoot: string): Promise<string | null> {
  const teamPath = join(sddRoot(projectRoot), "team.yaml");
  if (!(await pathExists(teamPath))) return null;
  try {
    const raw = parseYaml(await readText(teamPath)) as { template?: unknown };
    return typeof raw?.template === "string" && raw.template.trim() ? raw.template.trim() : null;
  } catch {
    return null;
  }
}

async function shippedWorkflowHashes(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const src = defaultWorkflowsDir();
  for (const relative of await defaultFiles(src)) {
    const content = await readText(join(src, relative));
    map.set(`.sdd/workflows/${relative}`, contentHash(content));
  }
  return map;
}

async function shippedTemplateHashes(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const src = defaultTemplatesDir();
  for (const relative of await defaultFiles(src)) {
    const content = await readText(join(src, relative));
    map.set(`.sdd/templates/${relative}`, contentHash(content));
  }
  return map;
}

async function shippedRoleHashes(projectRoot: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const preferred = await readTeamTemplateName(projectRoot);
  if (preferred) {
    const dir = join(defaultTeamsDir(), preferred, "roles");
    if (await pathExists(dir)) {
      for (const file of (await listFiles(dir)).filter((name) => name.endsWith(".md")).sort()) {
        const name = file.slice(0, -".md".length);
        const content = await readText(join(dir, file));
        map.set(`.sdd/roles/${name}.md`, contentHash(content));
      }
    }
  }
  for (const template of await listTeamTemplates()) {
    const dir = join(defaultTeamsDir(), template, "roles");
    if (!(await pathExists(dir))) continue;
    for (const file of (await listFiles(dir)).filter((name) => name.endsWith(".md"))) {
      const name = file.slice(0, -".md".length);
      const path = `.sdd/roles/${name}.md`;
      if (map.has(path)) continue;
      const content = await readText(join(dir, file));
      map.set(path, contentHash(content));
    }
  }
  return map;
}

async function listRelativeFiles(directory: string, prefix = ""): Promise<string[]> {
  if (!(await pathExists(directory))) return [];
  const files = (await listFiles(directory)).map((name) =>
    [prefix, name].filter(Boolean).join("/"),
  );
  const nested = await Promise.all(
    (await listDirs(directory)).map((name) =>
      listRelativeFiles(join(directory, name), [prefix, name].filter(Boolean).join("/")),
    ),
  );
  return [...files, ...nested.flat()];
}

function emptySummary(): TemplateStatusSummary {
  return { stock: 0, customized: 0, "stock-but-outdated": 0, unknown: 0 };
}

function bump(summary: TemplateStatusSummary, state: GeneratedFileState): void {
  summary[state] += 1;
}

export async function collectTemplateStatus(projectRoot: string): Promise<TemplateStatusReport> {
  const manifestPath = join(sddRoot(projectRoot), ".generated.json");
  const manifest = await loadGeneratedManifest(manifestPath);
  const shipped = new Map<string, string>([
    ...(await shippedWorkflowHashes()),
    ...(await shippedTemplateHashes()),
    ...(await shippedRoleHashes(projectRoot)),
  ]);

  const paths = new Set<string>();
  for (const key of Object.keys(manifest.files)) {
    if (kindForPath(key)) paths.add(key);
  }
  const root = sddRoot(projectRoot);
  for (const [dir, prefix] of [
    [join(root, "workflows"), ".sdd/workflows"] as const,
    [join(root, "templates"), ".sdd/templates"] as const,
    [join(root, "roles"), ".sdd/roles"] as const,
  ]) {
    for (const relative of await listRelativeFiles(dir)) {
      paths.add(`${prefix}/${relative}`);
    }
  }

  const files: GeneratedFileStatus[] = [];
  const summary = emptySummary();
  for (const path of [...paths].sort((a, b) => a.localeCompare(b))) {
    const kind = kindForPath(path);
    if (!kind) continue;
    const diskPath = join(projectRoot, path);
    if (!(await pathExists(diskPath))) continue;
    try {
      const st = await lstat(diskPath);
      if (!st.isFile()) continue;
    } catch {
      continue;
    }
    let currentHash: string;
    try {
      currentHash = contentHash(await readText(diskPath));
    } catch {
      continue;
    }
    const state = classifyGeneratedFile({
      manifestHash: manifest.files[path],
      currentHash,
      shippedHash: shipped.get(path),
    });
    files.push({ path, kind, state });
    bump(summary, state);
  }

  return { version: 1, files, summary };
}

export function countOutdated(summary: TemplateStatusSummary): number {
  return summary["stock-but-outdated"];
}
