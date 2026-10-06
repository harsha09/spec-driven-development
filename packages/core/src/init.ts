import { join } from "pathe";
import { type AgentTarget, installAgentIntegration } from "./agents.js";
import { defaultConfig, saveConfig } from "./config.js";
import {
  defaultMcpYamlPath,
  defaultMemoryDir,
  defaultTemplatesDir,
  defaultWorkflowsDir,
} from "./defaults.js";
import {
  copyDirSkipExisting,
  ensureDir,
  pathExists,
  readText,
  writeText,
  writeTextIfMissing,
} from "./fs.js";
import {
  type KeptStateFile,
  copyDefaultsManaged,
  loadManifest,
  mergeConfigFile,
  saveManifest,
} from "./manifest.js";
import { mcpConfigPath } from "./mcp/sources.js";
import { changesDir, domainsDir, memoryDir, sddRoot, templatesDir, workflowsDir } from "./paths.js";
import type { Config } from "./schemas.js";

export interface InitOptions {
  projectRoot: string;
  force?: boolean;
  /**
   * AI coding agent to install (single, Speckit-style). Not an IDE.
   * - omit / `false` — no agent files
   * - `AgentTarget` — install that integration only
   */
  agents?: false | AgentTarget;
}

export interface InitResult {
  created: string[];
  config: Config;
  agents?: { created: string[]; skipped: string[] };
  /** .sdd/ workflows/templates left alone: edited since sdd wrote them, or never written by sdd */
  stateKept: KeptStateFile[];
  /** Unedited .sdd/ workflows/templates not refreshed because --force was not given */
  stateSkipped: string[];
  /** config.yaml keys added from the current defaults (existing values are never changed) */
  configAdded: string[];
}

export async function initProject(opts: InitOptions): Promise<InitResult> {
  const { projectRoot, force = false } = opts;
  const created: string[] = [];
  const root = sddRoot(projectRoot);

  if ((await pathExists(join(root, "config.yaml"))) && !force) {
    throw new Error(
      `Already initialized (${join(root, "config.yaml")}). Use --force to refresh defaults (your config values and edited workflows/templates are kept).`,
    );
  }

  await ensureDir(root);

  // config.yaml: keep the user's values (#15). Only missing keys are added from defaults.
  const cfgPath = join(root, "config.yaml");
  let config: Config;
  let configAdded: string[] = [];
  if (await pathExists(cfgPath)) {
    const merged = await mergeConfigFile(cfgPath, defaultConfig());
    config = merged.config;
    configAdded = merged.added;
    if (merged.written) created.push(cfgPath);
  } else {
    config = defaultConfig();
    await saveConfig(projectRoot, config);
    created.push(cfgPath);
  }

  // workflows + templates: refreshed only while unchanged since sdd wrote them (manifest)
  const manifest = await loadManifest(projectRoot);
  const stateKept: KeptStateFile[] = [];
  const stateSkipped: string[] = [];
  for (const [src, dest] of [
    [defaultWorkflowsDir(), workflowsDir(projectRoot)],
    [defaultTemplatesDir(), templatesDir(projectRoot)],
  ] as const) {
    await ensureDir(dest);
    if (!(await pathExists(src))) continue;
    const r = await copyDefaultsManaged(projectRoot, src, dest, manifest, { force });
    stateKept.push(...r.kept);
    stateSkipped.push(...r.skipped);
    if (r.written.length) created.push(dest);
  }
  await saveManifest(projectRoot, manifest);

  // external MCP sources config (sdd as client — org libs, AST engines, …)
  const mcpSrc = defaultMcpYamlPath();
  const mcpDest = mcpConfigPath(projectRoot);
  if (await pathExists(mcpSrc)) {
    const wrote = await writeTextIfMissing(mcpDest, await readText(mcpSrc));
    if (wrote) created.push(mcpDest);
  }

  // memory — stable team docs; never overwrite on --force (constitution, product, …)
  const mDest = memoryDir(projectRoot, config);
  await ensureDir(mDest);
  const mSrc = defaultMemoryDir();
  if (await pathExists(mSrc)) {
    await copyDirSkipExisting(mSrc, mDest);
  } else {
    await writeTextIfMissing(
      join(mDest, "index.md"),
      `# Documentation map

Parent page for **stable** project docs. Start here, then open only what you need.

| Topic | File |
|-------|------|
| Product | [product.md](product.md) |
| Constitution (non-negotiables) | [constitution.md](constitution.md) |
| Architecture | [architecture.md](architecture.md) |
| Conventions | [conventions.md](conventions.md) |

Active work: \`.sdd/active-context.md\` and \`changes/<id>/\`.
`,
    );
    await writeTextIfMissing(
      join(mDest, "product.md"),
      "# Product\n\n<!-- What are you building? -->\n",
    );
    await writeTextIfMissing(
      join(mDest, "constitution.md"),
      `# Constitution

<!-- Non-negotiables agents must not violate. Broader style lives in conventions.md. -->

## Principles

-

## Stack & tooling

-

## Testing

-

## Security

-

## Process

-
`,
    );
    await writeTextIfMissing(
      join(mDest, "architecture.md"),
      "# Architecture\n\n<!-- High-level system shape -->\n",
    );
    await writeTextIfMissing(
      join(mDest, "conventions.md"),
      "# Conventions\n\n<!-- Coding and process conventions -->\n",
    );
  }
  // Ensure constitution exists even for older projects re-initing (add if missing only)
  if (!(await pathExists(join(mDest, "constitution.md")))) {
    const fromDefault = join(mSrc, "constitution.md");
    if (await pathExists(fromDefault)) {
      await copyDirSkipExisting(mSrc, mDest);
    } else {
      await writeTextIfMissing(
        join(mDest, "constitution.md"),
        `# Constitution

<!-- Non-negotiables agents must not violate. Broader style lives in conventions.md. -->

## Principles

-

## Stack & tooling

-

## Testing

-

## Security

-

## Process

-
`,
      );
    }
  }
  created.push(mDest);

  await ensureDir(changesDir(projectRoot, config));
  await ensureDir(domainsDir(projectRoot, config));
  created.push(changesDir(projectRoot, config));
  created.push(domainsDir(projectRoot, config));
  // archive/ is not scaffolded by default; created only when a complete actually archives

  // gitkeep style
  await writeText(join(changesDir(projectRoot, config), ".gitkeep"), "");
  await writeText(join(domainsDir(projectRoot, config), ".gitkeep"), "");

  // root pointer README for humans
  const sddReadme = join(root, "README.md");
  if (!(await pathExists(sddReadme)) || force) {
    await writeText(
      sddReadme,
      `# Structured Vibe Coding (SDD)

This directory configures local Spec-Driven Development for this repo.

- \`config.yaml\` — project settings and per-change policy
- \`workflows/\` — YAML workflow packs (customize freely)
- \`templates/\` — markdown templates for stage artifacts
- \`protocol.md\` / \`active-context.md\` — agent playbook + live task (after agent install)

Work lives in \`../changes/<id>/\`. Completed packs stay there with \`status: completed\`.
Promote lasting decisions into \`../memory/\`. (Archive-on-complete is opt-in.)

**Documentation map (stable):** \`../memory/index.md\`  
**Change-scoped docs:** \`../changes/<id>/\`

## Quick commands

\`\`\`bash
sdd new "My feature"
sdd status
sdd next
sdd verify
sdd complete
\`\`\`
`,
    );
    created.push(sddReadme);
  }

  let agentsResult: InitResult["agents"];
  if (opts.agents) {
    const ag = await installAgentIntegration({
      projectRoot,
      target: opts.agents,
      force,
    });
    created.push(...ag.created);
    agentsResult = { created: ag.created, skipped: ag.skipped };
  }

  return { created, config, agents: agentsResult, stateKept, stateSkipped, configAdded };
}
