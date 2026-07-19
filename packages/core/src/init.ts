import { join } from "pathe";
import { defaultConfig, saveConfig } from "./config.js";
import {
  copyDir,
  copyDirSkipExisting,
  ensureDir,
  pathExists,
  writeText,
  writeTextIfMissing,
} from "./fs.js";
import {
  defaultMemoryDir,
  defaultTemplatesDir,
  defaultWorkflowsDir,
} from "./defaults.js";
import {
  archiveDir,
  changesDir,
  domainsDir,
  memoryDir,
  templatesDir,
  workflowsDir,
  sddRoot,
} from "./paths.js";
import type { Config } from "./schemas.js";
import { installAgentIntegration, type AgentTarget } from "./agents.js";

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
}

export async function initProject(opts: InitOptions): Promise<InitResult> {
  const { projectRoot, force = false } = opts;
  const created: string[] = [];
  const root = sddRoot(projectRoot);

  if ((await pathExists(join(root, "config.yaml"))) && !force) {
    throw new Error(
      `Already initialized (${join(root, "config.yaml")}). Use --force to re-copy defaults.`,
    );
  }

  const config = defaultConfig();
  await ensureDir(root);
  await saveConfig(projectRoot, config);
  created.push(join(root, "config.yaml"));

  // workflows
  const wfDest = workflowsDir(projectRoot);
  await ensureDir(wfDest);
  const wfSrc = defaultWorkflowsDir();
  if (await pathExists(wfSrc)) {
    await copyDir(wfSrc, wfDest);
    created.push(wfDest);
  }

  // templates
  const tDest = templatesDir(projectRoot);
  await ensureDir(tDest);
  const tSrc = defaultTemplatesDir();
  if (await pathExists(tSrc)) {
    await copyDir(tSrc, tDest);
    created.push(tDest);
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
  await ensureDir(archiveDir(projectRoot, config));
  await ensureDir(domainsDir(projectRoot, config));
  created.push(changesDir(projectRoot, config));
  created.push(archiveDir(projectRoot, config));
  created.push(domainsDir(projectRoot, config));

  // gitkeep style
  await writeText(join(changesDir(projectRoot, config), ".gitkeep"), "");
  await writeText(join(archiveDir(projectRoot, config), ".gitkeep"), "");
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

Work lives in \`../changes/\` and completed work in \`../archive/\`.

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

  return { created, config, agents: agentsResult };
}
