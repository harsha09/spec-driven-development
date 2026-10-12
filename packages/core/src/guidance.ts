import { join } from "pathe";
import { defaultMemoryDir } from "./defaults.js";
import { pathExists, readText, writeText } from "./fs.js";
import { generatedState, markGenerated } from "./generated.js";
import { guidancePaths, memoryDir, sddRoot } from "./paths.js";
import type { Config } from "./schemas.js";

/** `.sdd/README.md` body. Paths come from config. */
export function renderSddReadme(config: Pick<Config, "memory_path" | "changes_path">): string {
  const paths = guidancePaths(config);
  return `# Structured Vibe Coding (SDD)

This directory configures local Spec-Driven Development for this repo.

- \`config.yaml\` — project settings and per-change policy
- \`workflows/\` — YAML workflow packs (customize freely)
- \`templates/\` — markdown templates for stage artifacts
- \`protocol.md\` / \`active-context.md\` — agent playbook + live task (after agent install)

Work lives in \`../${paths.changes}/<id>/\`. Completed packs stay there with \`status: completed\`.
Promote lasting decisions into \`../${paths.memory}/\`. (Archive-on-complete is opt-in.)

**Documentation map (stable):** \`../${paths.memoryIndex}\`  
**Change-scoped docs:** \`../${paths.changes}/<id>/\`

## Quick commands

\`\`\`bash
sdd new "My feature"
sdd status
sdd next
sdd verify
sdd complete
\`\`\`
`;
}

/** Documentation map. Paths come from config. */
export function renderMemoryIndex(config: Pick<Config, "memory_path" | "changes_path">): string {
  const paths = guidancePaths(config);
  return `# Documentation map

Parent page for **stable** project docs. Humans and coding agents: start here, then open only what you need.

| Kind | Where | Lifetime |
|------|--------|----------|
| **This map + memory** | \`${paths.memory}/*.md\` | Long-lived |
| **Active change** | \`${paths.changes}/<id>/\` (see \`.sdd/active-context.md\`) | Until complete |
| **Finished work** | \`${paths.changes}/<id>/\` with \`status: completed\` | History (pack stays in place; archive is opt-in) |
| **Optional domains** | \`domains/\` | Long-lived by area |

## Stable docs

| Topic | File |
|-------|------|
| Product / vision | [product.md](product.md) |
| Requirements | [requirements.md](requirements.md) (after greenfield) |
| Feature backlog | [features.md](features.md) (after greenfield; \`sdd backlog start F-001\`) |
| Constitution (non-negotiables) | [constitution.md](constitution.md) |
| Architecture | [architecture.md](architecture.md) |
| Coding & process conventions | [conventions.md](conventions.md) |

**Greenfield:** \`sdd greenfield "one-line idea"\` then promote into \`${paths.memory}/\` on complete.  
Add rows here when you introduce new durable docs (e.g. \`security.md\`, \`ops.md\`).

## Active work

1. Run \`sdd status\` (or open \`.sdd/active-context.md\`).
2. Read stage artifacts under the active change folder only.
3. Prefer small updates to change packs; **promote** lasting decisions into \`${paths.memory}/\` after \`sdd complete\`.

## Ownership (suggested)

| Area | Owner |
|------|--------|
| \`${paths.memory}/*\` | Tech lead / architect |
| Current \`${paths.changes}/<id>/\` | Author of the change (PR owner) |
| \`domains/<name>/\` | Domain owner (if used) |

Keep this map short. Link out; do not paste large designs here.
`;
}

/**
 * Rewrite generated guidance that still names the default folders when config
 * uses other paths. Edited files are left alone.
 */
export async function refreshConfiguredGuidance(
  projectRoot: string,
  config: Config,
): Promise<void> {
  await writeConfiguredMemoryIndex(memoryDir(projectRoot, config), config);
  await writeConfiguredReadme(projectRoot, config);
}

async function writeConfiguredMemoryIndex(memoryRoot: string, config: Config): Promise<void> {
  const indexPath = join(memoryRoot, "index.md");
  const paths = guidancePaths(config);
  if (paths.memory === "memory" && paths.changes === "changes") return;
  if (!(await pathExists(indexPath))) return;
  const existing = await readText(indexPath);
  const state = generatedState(existing);
  if (state === "edited") return;
  const shippedPath = join(defaultMemoryDir(), "index.md");
  const shipped = (await pathExists(shippedPath)) ? await readText(shippedPath) : "";
  if (state !== "unmodified" && existing.replace(/\r\n/g, "\n").trim() !== shipped.trim()) return;
  const body = renderMemoryIndex(config);
  if (existing.includes(`\`${paths.memory}/`) && existing.includes(`\`${paths.changes}/`)) return;
  await writeText(indexPath, markGenerated(body));
}

async function writeConfiguredReadme(projectRoot: string, config: Config): Promise<void> {
  const readmePath = join(sddRoot(projectRoot), "README.md");
  if (!(await pathExists(readmePath))) return;
  const existing = await readText(readmePath);
  if (generatedState(existing) !== "unmodified") return;
  const body = renderSddReadme(config);
  const marked = markGenerated(body);
  if (existing === marked) return;
  await writeText(readmePath, marked);
}
