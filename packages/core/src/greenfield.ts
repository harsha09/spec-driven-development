/**
 * Greenfield product bootstrap: one-line idea → vision/requirements/features/architecture,
 * then implement each backlog item as a normal change pack.
 */

import { join } from "pathe";
import type { Config } from "./schemas.js";
import {
  ensureDir,
  listDirs,
  pathExists,
  readText,
  writeText,
} from "./fs.js";
import { changePath, changesDir, memoryDir } from "./paths.js";
import { createChange, type ChangeContext } from "./change.js";
import { isSubstantiveArtifactContent } from "./artifacts.js";

export interface GreenfieldFeature {
  id: string;
  name: string;
  status: string;
  priority: string;
  workflow: string;
  summary: string;
  requirements: string;
  notes: string;
  /** Source file the feature was parsed from */
  sourcePath: string;
}

export interface StartGreenfieldInput {
  projectRoot: string;
  config: Config;
  idea: string;
}

export interface StartGreenfieldResult {
  ctx: ChangeContext;
  idea: string;
  visionPath: string;
}

export interface StartFeatureInput {
  projectRoot: string;
  config: Config;
  featureId: string;
  /** Override workflow from backlog (default: feature field or "feature") */
  workflowName?: string;
}

const FEATURE_HEADER = /^##\s+(F-\d+)\s*:\s*(.+?)\s*$/i;

/**
 * Start a greenfield discovery change from a one-line product idea.
 * Seeds vision.md with the idea; agent fills the rest via stages.
 */
export async function startGreenfield(
  input: StartGreenfieldInput,
): Promise<StartGreenfieldResult> {
  const idea = input.idea.trim();
  if (!idea || idea.length < 3) {
    throw new Error('Provide a one-line product idea, e.g. sdd greenfield "Team expense tracker for remote startups"');
  }

  const title =
    idea.length > 80 ? `Greenfield: ${idea.slice(0, 77)}…` : `Greenfield: ${idea}`;

  const ctx = await createChange({
    projectRoot: input.projectRoot,
    config: input.config,
    title,
    workflowName: "greenfield",
    flags: { greenfield: true, idea },
  });

  const visionPath = join(ctx.path, "vision.md");
  if (await pathExists(visionPath)) {
    let body = await readText(visionPath);
    // createChange already interpolates {{idea}}; only fix leftover placeholders
    if (body.includes("{{idea}}")) {
      body = body.replaceAll("{{idea}}", idea);
      await writeText(visionPath, body);
    } else if (!body.includes(idea)) {
      body = body.replace(
        /## One-liner\n+(\s*[-–—]\s*\n)?/,
        `## One-liner\n\n${idea}\n\n`,
      );
      if (!body.includes(idea)) {
        body = `${body.trim()}\n\n## One-liner\n\n${idea}\n`;
      }
      await writeText(visionPath, body);
    }
  }

  return { ctx, idea, visionPath };
}

/**
 * Parse feature backlog markdown (F-001 blocks).
 */
export function parseFeaturesBacklog(
  markdown: string,
  sourcePath: string,
): GreenfieldFeature[] {
  const lines = markdown.split(/\r?\n/);
  const features: GreenfieldFeature[] = [];
  let current: GreenfieldFeature | null = null;

  const flush = () => {
    if (current) features.push(current);
    current = null;
  };

  for (const line of lines) {
    const h = line.match(FEATURE_HEADER);
    if (h) {
      flush();
      current = {
        id: h[1]!.toUpperCase(),
        name: h[2]!.trim(),
        status: "planned",
        priority: "should",
        workflow: "feature",
        summary: "",
        requirements: "",
        notes: "",
        sourcePath,
      };
      continue;
    }
    if (!current) continue;

    const field = line.match(
      /^\s*[-*]\s*\*\*(Status|Priority|Workflow|Summary|Requirements|Notes):\*\*\s*(.*)$/i,
    );
    if (field) {
      const key = field[1]!.toLowerCase();
      const val = field[2]!.trim();
      if (key === "status") current.status = val || current.status;
      else if (key === "priority") current.priority = val || current.priority;
      else if (key === "workflow") current.workflow = val || current.workflow;
      else if (key === "summary") current.summary = val;
      else if (key === "requirements") current.requirements = val;
      else if (key === "notes") current.notes = val;
    }
  }
  flush();
  return features;
}

/**
 * Locate features.md: memory/features.md, else active change, else latest greenfield pack.
 */
export async function findFeaturesBacklogPath(
  projectRoot: string,
  config: Config,
): Promise<string | null> {
  const mem = join(memoryDir(projectRoot, config), "features.md");
  if (await pathExists(mem)) return mem;

  const { getActiveChangeId } = await import("./change-context.js");
  const active = await getActiveChangeId(projectRoot, config);
  if (active) {
    const p = join(changePath(projectRoot, config, active), "features.md");
    if (await pathExists(p)) return p;
  }

  // Scan changes for any features.md with F-NNN blocks (newest first)
  const ids = (await listDirs(changesDir(projectRoot, config))).sort().reverse();
  for (const id of ids) {
    try {
      const p = join(changePath(projectRoot, config, id), "features.md");
      if (await pathExists(p)) {
        const body = await readText(p);
        if (parseFeaturesBacklog(body, p).length) return p;
      }
    } catch {
      // skip broken change dirs
    }
  }
  return null;
}

export async function listBacklogFeatures(
  projectRoot: string,
  config: Config,
): Promise<{ path: string; features: GreenfieldFeature[] }> {
  const path = await findFeaturesBacklogPath(projectRoot, config);
  if (!path) {
    throw new Error(
      "No feature backlog found. Run `sdd greenfield \"your idea\"` and complete the features stage (or add memory/features.md).",
    );
  }
  const features = parseFeaturesBacklog(await readText(path), path);
  if (!features.length) {
    throw new Error(
      `No F-NNN features parsed in ${path}. Use headings like: ## F-001: Short name`,
    );
  }
  return { path, features };
}

/**
 * Start a normal change pack from a backlog feature id (e.g. F-001).
 */
export async function startFeatureFromBacklog(
  input: StartFeatureInput,
): Promise<{ ctx: ChangeContext; feature: GreenfieldFeature }> {
  const id = input.featureId.trim().toUpperCase();
  if (!/^F-\d+$/i.test(id)) {
    throw new Error(`Feature id must look like F-001 (got "${input.featureId}")`);
  }

  const { path, features } = await listBacklogFeatures(
    input.projectRoot,
    input.config,
  );
  const feature = features.find((f) => f.id === id);
  if (!feature) {
    const known = features.map((f) => f.id).join(", ");
    throw new Error(`Feature ${id} not found in ${path}. Known: ${known}`);
  }

  const workflowName =
    input.workflowName?.trim() ||
    feature.workflow?.trim() ||
    "feature";

  const title = feature.name
    ? `${feature.id}: ${feature.name}`
    : feature.id;

  const ctx = await createChange({
    projectRoot: input.projectRoot,
    config: input.config,
    title,
    workflowName,
    flags: {
      from_backlog: feature.id,
      greenfield_feature: true,
    },
  });

  // Seed first required artifact with feature summary if still a stub
  const stage = ctx.workflow.stages.find((s) => s.id === ctx.meta.stage);
  const art = stage?.artifacts.find((a) => a.required) ?? stage?.artifacts[0];
  if (art) {
    const artPath = join(ctx.path, art.path);
    if (await pathExists(artPath)) {
      let body = await readText(artPath);
      if (!isSubstantiveArtifactContent(body)) {
        body = [
          `# ${feature.name || feature.id}`,
          ``,
          `> From backlog **${feature.id}** · priority: ${feature.priority}`,
          ``,
          `## Summary`,
          ``,
          feature.summary || feature.name || "(fill in)",
          ``,
          `## Requirements`,
          ``,
          feature.requirements || "-",
          ``,
          `## Notes`,
          ``,
          feature.notes || "-",
          ``,
          `## Success`,
          ``,
          `-`,
          ``,
        ].join("\n");
        await writeText(artPath, body);
      }
    }
  }

  // Mark backlog item in_progress in source file
  await updateFeatureStatus(path, feature.id, "in_progress");

  return { ctx, feature };
}

export async function updateFeatureStatus(
  backlogPath: string,
  featureId: string,
  status: string,
): Promise<void> {
  const id = featureId.toUpperCase();
  let md = await readText(backlogPath);
  const re = new RegExp(
    `(##\\s+${id}\\s*:[\\s\\S]*?[-*]\\s*\\*\\*Status:\\*\\*\\s*)([^\\n]+)`,
    "i",
  );
  if (!re.test(md)) return;
  md = md.replace(re, `$1${status}`);
  await writeText(backlogPath, md);
}

/**
 * Copy greenfield change artifacts into memory/ (product spine).
 */
export async function promoteGreenfieldToMemory(
  projectRoot: string,
  config: Config,
  changeId: string,
): Promise<string[]> {
  const dir = changePath(projectRoot, config, changeId);
  const mem = memoryDir(projectRoot, config);
  await ensureDir(mem);

  const map: { from: string; to: string }[] = [
    { from: "vision.md", to: "product.md" },
    { from: "requirements.md", to: "requirements.md" },
    { from: "features.md", to: "features.md" },
    { from: "architecture.md", to: "architecture.md" },
  ];

  const written: string[] = [];
  for (const { from, to } of map) {
    const src = join(dir, from);
    if (!(await pathExists(src))) continue;
    const body = await readText(src);
    if (!isSubstantiveArtifactContent(body)) continue;
    const dest = join(mem, to);
    await writeText(
      dest,
      body.includes("Promoted from greenfield")
        ? body
        : `${body.trim()}\n\n---\n\n_Promoted from greenfield change \`${changeId}\`._\n`,
    );
    written.push(join(config.memory_path, to));
  }

  // Touch index to mention backlog if missing
  const indexPath = join(mem, "index.md");
  if (await pathExists(indexPath)) {
    let index = await readText(indexPath);
    if (!index.includes("features.md")) {
      index = index.replace(
        /\| Architecture \|/,
        `| Feature backlog | [features.md](features.md) |\n| Architecture |`,
      );
      await writeText(indexPath, index);
    }
  }

  return written;
}
