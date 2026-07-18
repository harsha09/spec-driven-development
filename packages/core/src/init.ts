import { join } from "pathe";
import { defaultConfig, saveConfig } from "./config.js";
import { copyDir, ensureDir, pathExists, writeText } from "./fs.js";
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

export interface InitOptions {
  projectRoot: string;
  force?: boolean;
  pack?: "default" | "enterprise";
}

export interface InitResult {
  created: string[];
  config: Config;
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

  // memory
  const mDest = memoryDir(projectRoot, config);
  await ensureDir(mDest);
  const mSrc = defaultMemoryDir();
  if (await pathExists(mSrc)) {
    await copyDir(mSrc, mDest);
  } else {
    await writeText(
      join(mDest, "product.md"),
      "# Product\n\n<!-- What are you building? -->\n",
    );
    await writeText(
      join(mDest, "architecture.md"),
      "# Architecture\n\n<!-- High-level system shape -->\n",
    );
    await writeText(
      join(mDest, "conventions.md"),
      "# Conventions\n\n<!-- Coding and process conventions -->\n",
    );
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

Work lives in \`../changes/\` and completed work in \`../archive/\`.

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

  return { created, config };
}
