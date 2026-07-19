import { join } from "pathe";
import { pathExists, writeText } from "./fs.js";
import { loadConfig } from "./config.js";
import {
  buildAgentPrompt,
  buildContext,
  getActiveChangeId,
  formatStatus,
} from "./change.js";
import { sddRoot } from "./paths.js";

export type AgentTarget = "copilot" | "claude-code" | "intellij";

export const ALL_AGENT_TARGETS: AgentTarget[] = ["copilot", "claude-code", "intellij"];

export interface InstallAgentsOptions {
  projectRoot: string;
  targets?: AgentTarget[];
  force?: boolean;
}

export interface InstallAgentsResult {
  created: string[];
  skipped: string[];
  targets: AgentTarget[];
}

/**
 * Install IDE / coding-agent integration files so GitHub Copilot, Claude Code,
 * and JetBrains (via shared instructions) follow SDD.
 */
export async function installAgentIntegrations(
  opts: InstallAgentsOptions,
): Promise<InstallAgentsResult> {
  const targets = opts.targets?.length ? opts.targets : ALL_AGENT_TARGETS;
  const created: string[] = [];
  const skipped: string[] = [];
  const root = opts.projectRoot;
  const force = opts.force ?? false;

  const write = async (rel: string, content: string) => {
    const full = join(root, rel);
    if ((await pathExists(full)) && !force) {
      skipped.push(rel);
      return;
    }
    await writeText(full, content);
    created.push(rel);
  };

  // Always refresh active context pointer used by all agents
  await refreshActiveAgentContext(root);

  if (targets.includes("copilot")) {
    await write(
      ".github/copilot-instructions.md",
      COPILOT_INSTRUCTIONS,
    );
    await write(
      ".github/agents/sdd.agent.md",
      COPILOT_SDD_AGENT,
    );
    await write(
      ".github/instructions/sdd.instructions.md",
      COPILOT_PATH_INSTRUCTIONS,
    );
  }

  if (targets.includes("claude-code")) {
    await write(".claude/skills/sdd/SKILL.md", CLAUDE_SDD_SKILL);
    await write(".claude/CLAUDE.md", CLAUDE_PROJECT_MD);
  }

  if (targets.includes("intellij")) {
    // JetBrains + GitHub Copilot read repo instructions; also drop IntelliJ-oriented notes
    await write(".idea/sdd-agent-notes.md", INTELLIJ_NOTES);
    // Shared AGENTS.md is useful for Copilot in IntelliJ and other tools
    await write("AGENTS.md", AGENTS_MD);
  } else if (targets.includes("copilot") || targets.includes("claude-code")) {
    await write("AGENTS.md", AGENTS_MD);
  }

  // Marker under .sdd
  await write(
    join(".sdd", "agents.json"),
    JSON.stringify(
      {
        version: 1,
        installed: targets,
        updated: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
  );

  return { created, skipped, targets };
}

/** Write .sdd/active-context.md for the current change (all agents read this). */
export async function refreshActiveAgentContext(projectRoot: string): Promise<string | null> {
  const markerDir = sddRoot(projectRoot);
  if (!(await pathExists(join(markerDir, "config.yaml")))) {
    return null;
  }

  const config = await loadConfig(projectRoot);
  const activeId = await getActiveChangeId(projectRoot, config);
  const outPath = join(markerDir, "active-context.md");

  if (!activeId) {
    const empty = `# SDD active context

_No active change._ Run \`sdd new "…"\` or **SDD: New Change** in the IDE.

Then re-run \`sdd agents refresh\` (or advance a stage) to update this file.
`;
    await writeText(outPath, empty);
    return outPath;
  }

  const ctx = await buildContext(projectRoot, config, activeId);
  const handoff = await buildAgentPrompt(ctx, config, projectRoot);
  const status = formatStatus(ctx);

  const body = `# SDD active context

> Auto-generated for GitHub Copilot, Claude Code, and IDE agents.  
> Change: **${ctx.meta.title}** · \`${ctx.id}\` · stage **${ctx.meta.stage}**

## Status

\`\`\`
${status}
\`\`\`

${handoff}
`;

  await writeText(outPath, body);
  return outPath;
}

const AGENTS_MD = `# Agent instructions — Structured Vibe Coding (SDD)

This repository uses **Spec-Driven Development** via the \`sdd\` tool (CLI / VS Code / IntelliJ).

## Always

1. Prefer the **active change pack** under \`changes/<id>/\` as the source of truth for the current task.
2. Read \`.sdd/active-context.md\` at the start of a coding session (refresh with \`sdd agents refresh\`).
3. Read \`memory/\` for product and architecture constraints.
4. Do **not** invent large features outside the current change intent.
5. Respect **ARB / gate decisions** (e.g. \`arb-decision.md\`) and workflow constraints.
6. When implementation is done, remind the human to run **local verify** (\`sdd verify\`) before \`sdd complete\`.

## Workflows

Process is defined in \`.sdd/workflows/*.yaml\`. Stages produce markdown artifacts in the change folder. Do not skip hard gates.

## Tools

| Surface | How |
|---------|-----|
| CLI | \`sdd status\`, \`sdd next\`, \`sdd agent\`, \`sdd verify\` |
| VS Code / Cursor | Command Palette → **SDD:*** |
| IntelliJ | Tools → **SDD** actions (runs CLI) |
| GitHub Copilot | \`.github/copilot-instructions.md\` + agent \`sdd\` |
| Claude Code | \`.claude/skills/sdd/SKILL.md\` |

## Local only

Verification is **local development**. Do not assume CI replaced \`sdd verify\`.
`;

const COPILOT_INSTRUCTIONS = `<!-- Structured Vibe Coding (SDD) — GitHub Copilot instructions -->

# Project coding agent rules

This repo uses **Spec-Driven Development (SDD)** with the \`sdd\` CLI / IDE plugins.

## Before writing code

1. Open and follow \`.sdd/active-context.md\` if present.
2. Open the active change under \`changes/\` (see \`changes/.active\` or the latest in-progress folder).
3. Prefer artifacts for the **current stage** (intent/feature/design/tasks) over guessing.
4. Honor \`memory/product.md\`, \`memory/architecture.md\`, \`memory/conventions.md\`.

## While coding

- Stay within the change scope (title + intent/feature).
- Match patterns described in \`research.md\` / design when present.
- Do not violate constraints in \`arb-decision.md\` or gate notes.
- Prefer small, reviewable diffs.

## When finishing

- Suggest \`sdd verify\` (local) and only then \`sdd complete\`.
- Do not claim the change is complete without local verification when the workflow has a verify stage.

## Commands the human may run

\`\`\`bash
sdd status
sdd next
sdd agent          # print handoff
sdd agents refresh # refresh .sdd/active-context.md
sdd verify
sdd complete
\`\`\`
`;

const COPILOT_SDD_AGENT = `---
name: sdd
description: Spec-Driven Development agent for this repo. Use when implementing the active sdd change, advancing stages, or following .sdd workflows.
---

# SDD agent (GitHub Copilot)

You are the **SDD implementer** for this workspace.

## Mission

Implement only what the **active change pack** specifies. Specs and gates win over improvisation.

## Required reads (in order)

1. \`.sdd/active-context.md\`
2. \`changes/<active-id>/meta.yaml\` (workflow + stage)
3. Artifacts for the current stage and prior stages in that folder
4. \`memory/*.md\`

## Behavior

- If there is no active change, tell the user to run \`sdd new "…"\` or **SDD: New Change**.
- If \`meta.yaml\` stage is not \`implement\`, help fill the current stage artifact instead of large code rewrites—unless the user explicitly wants implementation early.
- On implement stage: execute tasks from \`tasks.md\` / acceptance criteria; keep diffs scoped.
- After code changes: remind them to run **local** \`sdd verify\`.

## Out of scope

- Redesigning the whole product
- Skipping hard gates
- Inventing requirements not in the change pack
`;

const COPILOT_PATH_INSTRUCTIONS = `---
applyTo: "changes/**,memory/**,.sdd/**"
---

# SDD paths

Files under \`changes/\`, \`memory/\`, and \`.sdd/\` drive Spec-Driven Development.

- Treat \`changes/**/meta.yaml\` as process state (do not invent fields).
- Prefer editing stage artifacts over deleting workflow history.
- When modifying code for an active change, keep alignment with that change's intent/design/tasks.
`;

const CLAUDE_SDD_SKILL = `---
name: sdd
description: Use Spec-Driven Development (sdd) for this repository — read active change, follow stages, implement within scope, local verify.
---

# Skill: Structured Vibe Coding (SDD)

## When to use

- User asks to implement a feature/fix in this repo
- User mentions sdd, change packs, stages, ARB, or local verify
- You need the source of truth for the current task

## Instructions

1. Read \`.sdd/active-context.md\` (if missing, run \`sdd agents refresh\` via bash or ask the user).
2. Read \`changes/<id>/meta.yaml\` for \`workflow\` and \`stage\`.
3. Read relevant artifacts in that change folder (intent/feature/design/tasks/acceptance).
4. Read \`memory/\` for global constraints.
5. Implement **only** in-scope work for the current change.
6. Prefer project conventions in \`memory/conventions.md\`.
7. When done coding, instruct the user to run:

\`\`\`bash
sdd verify
sdd gate approve   # if hard gate
sdd next           # or sdd complete on last stage
\`\`\`

## Bash helpers (if tools allow)

\`\`\`bash
sdd status
sdd agent
sdd agents refresh
\`\`\`

## Do not

- Skip hard gates
- Expand scope beyond the change title/intent
- Delete \`.sdd\` or archive history casually
`;

const CLAUDE_PROJECT_MD = `# Claude Code — this repo uses SDD

Load the **sdd** skill under \`.claude/skills/sdd/\` for implementation work.

Always check \`.sdd/active-context.md\` and the active folder under \`changes/\` before large edits.

CLI: \`sdd\` (npm: \`@structured-vibe-coding/cli\`).
`;

const INTELLIJ_NOTES = `# SDD + IntelliJ / GitHub Copilot

This project uses Structured Vibe Coding (\`sdd\`).

## IntelliJ plugin

Install the **Structured Vibe Coding (SDD)** plugin (or run the Gradle plugin from \`packages/intellij\`).  
Actions under **Tools → SDD** shell out to the \`sdd\` CLI — install the CLI on PATH:

\`\`\`bash
npm i -g @structured-vibe-coding/cli
\`\`\`

## GitHub Copilot in IntelliJ

Copilot respects repository instructions:

- \`.github/copilot-instructions.md\`
- \`AGENTS.md\`
- \`.sdd/active-context.md\` (refresh often)

Use the SDD plugin action **Refresh agent context** after \`sdd new\` / stage changes.
`;
