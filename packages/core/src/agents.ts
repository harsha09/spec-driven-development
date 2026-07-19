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

/**
 * AI coding agents (not IDEs).
 * VS Code / Cursor / IntelliJ are editors; they host tools like Copilot or Claude Code.
 *
 * Speckit-style: one integration at a time; public keys are short (`copilot`, `claude`).
 */
export type AgentTarget = "copilot" | "claude-code";

export const ALL_AGENT_TARGETS: AgentTarget[] = ["copilot", "claude-code"];

/** Default when non-interactive and no --ai / --integration (matches Speckit). */
export const DEFAULT_INIT_INTEGRATION: AgentTarget = "copilot";

export interface AgentTargetOption {
  /** Internal install id (file paths / agents.json). */
  id: AgentTarget;
  /** Speckit-style public key used with --ai / --integration. */
  key: string;
  label: string;
  hint: string;
  /** If true, CLI may check that the agent binary is on PATH. */
  requiresCli: boolean;
  installUrl: string;
}

/** Human-facing options for interactive AI-agent pick (CLI / IDE). */
export const AGENT_TARGET_OPTIONS: AgentTargetOption[] = [
  {
    id: "copilot",
    key: "copilot",
    label: "GitHub Copilot",
    hint: ".github/agents/*.agent.md (VS Code, Cursor, JetBrains, …)",
    requiresCli: false,
    installUrl: "https://github.com/features/copilot",
  },
  {
    id: "claude-code",
    key: "claude",
    label: "Claude Code",
    hint: ".claude/agents/*.md (terminal agent)",
    requiresCli: true,
    installUrl: "https://docs.anthropic.com/en/docs/claude-code",
  },
];

/** Public CLI keys → internal targets (Speckit uses `claude`, not `claude-code`). */
export function integrationKeyFor(target: AgentTarget): string {
  return AGENT_TARGET_OPTIONS.find((o) => o.id === target)?.key ?? target;
}

export function optionForTarget(target: AgentTarget): AgentTargetOption | undefined {
  return AGENT_TARGET_OPTIONS.find((o) => o.id === target);
}

/**
 * Parse Speckit-style integration keys: `copilot`, `claude`, `claude-code`, …
 * Throws on unknown ids or IDE names.
 */
export function parseAgentTargets(raw: string | string[]): AgentTarget[] {
  const parts = (Array.isArray(raw) ? raw : [raw])
    .flatMap((s) => String(s).split(","))
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const out: AgentTarget[] = [];
  for (const p of parts) {
    // IDEs are not AI agent targets
    if (
      p === "intellij" ||
      p === "idea" ||
      p === "jetbrains" ||
      p === "vscode" ||
      p === "vs-code" ||
      p === "cursor"
    ) {
      throw new Error(
        `"${p}" is an IDE, not an AI coding agent. Choose: copilot or claude (Claude Code).`,
      );
    }
    const id =
      p === "claude" || p === "claude-code" || p === "claudecode"
        ? "claude-code"
        : p === "github-copilot" || p === "gh-copilot" || p === "copilot"
          ? "copilot"
          : p;
    if (!ALL_AGENT_TARGETS.includes(id as AgentTarget)) {
      const keys = AGENT_TARGET_OPTIONS.map((o) => o.key).join(", ");
      throw new Error(`Unknown AI coding agent "${p}". Choose from: ${keys}`);
    }
    if (!out.includes(id as AgentTarget)) out.push(id as AgentTarget);
  }
  return out;
}

/** Parse a single Speckit-style integration (exactly one). */
export function parseIntegration(raw: string): AgentTarget {
  const list = parseAgentTargets(raw);
  if (list.length !== 1) {
    throw new Error(
      `Expected one AI coding agent (like Speckit --integration), got: ${raw}`,
    );
  }
  return list[0]!;
}

/** Roles emitted as thin agents (shared body generator — no skill files). */
export type SddAgentRoleId =
  | "sdd"
  | "sdd-planner"
  | "sdd-implementer"
  | "sdd-reviewer";

export interface SddAgentRole {
  id: SddAgentRoleId;
  description: string;
  roleLine: string;
  /** Extra one-liner constraints for this role only */
  roleRules: string[];
}

export const SDD_AGENT_ROLES: SddAgentRole[] = [
  {
    id: "sdd",
    description:
      "Default SDD agent. Use for any Spec-Driven Development work on the active change pack.",
    roleLine: "Router: inspect stage in active-context; plan or implement accordingly.",
    roleRules: [
      "If stage is intent/feature/design/tasks/stories/research: act as planner (artifacts, little or no product code).",
      "If stage is implement: act as implementer (scoped code only).",
      "If stage is local_verify: act as reviewer (gaps vs acceptance; fixes only).",
    ],
  },
  {
    id: "sdd-planner",
    description:
      "SDD planner. Use when filling intent, design, research, stories, or tasks — not large code changes.",
    roleLine: "Planner: produce/update stage markdown only.",
    roleRules: [
      "Do not make large product code changes unless the user explicitly overrides.",
      "Keep artifacts short and actionable.",
    ],
  },
  {
    id: "sdd-implementer",
    description:
      "SDD implementer. Use when coding the active change (implement stage).",
    roleLine: "Implementer: code only for the active change pack.",
    roleRules: [
      "Follow tasks.md / acceptance; honor arb-decision and design constraints.",
      "Do not expand scope beyond the change title/intent.",
    ],
  },
  {
    id: "sdd-reviewer",
    description:
      "SDD reviewer. Use before verify/complete or to check work against the change pack.",
    roleLine: "Reviewer: compare work to acceptance and stage artifacts.",
    roleRules: [
      "List gaps; suggest minimal fixes only.",
      "Remind user to run sdd verify before sdd complete.",
    ],
  },
];

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
 * Install **agents only** (no skills, no fat instructions).
 *
 * Single playbook: `.sdd/protocol.md`
 * Live state:      `.sdd/active-context.md`
 * Thin agents:     `.claude/agents/*` and `.github/agents/*` (pointers + role)
 */
export async function installAgentIntegrations(
  opts: InstallAgentsOptions,
): Promise<InstallAgentsResult> {
  if (!opts.targets?.length) {
    throw new Error(
      `Specify at least one AI coding agent: ${ALL_AGENT_TARGETS.join(", ")} (not an IDE; do not install all by default)`,
    );
  }
  const targets = opts.targets;
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

  // Always: one protocol + live context
  await write(join(".sdd", "protocol.md"), PROTOCOL_MD);
  await refreshActiveAgentContext(root);

  for (const role of SDD_AGENT_ROLES) {
    const body = renderThinAgent(role);
    if (targets.includes("claude-code")) {
      await write(`.claude/agents/${role.id}.md`, body);
    }
    if (targets.includes("copilot")) {
      // Copilot custom agents (same files in VS Code, Cursor, JetBrains, …)
      await write(`.github/agents/${role.id}.agent.md`, body);
    }
  }

  // Tiny shared pointer for hosts that read AGENTS.md (not a second playbook)
  await write("AGENTS.md", renderAgentsMd(targets));

  await write(
    join(".sdd", "agents.json"),
    JSON.stringify(
      {
        version: 2,
        mode: "agents-only",
        protocol: ".sdd/protocol.md",
        activeContext: ".sdd/active-context.md",
        roles: SDD_AGENT_ROLES.map((r) => r.id),
        installed: targets,
        /** Speckit-style primary integration key (first target). */
        integration: targets[0] ? integrationKeyFor(targets[0]) : null,
        updated: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
  );

  // Speckit-like init options snapshot
  await write(
    join(".sdd", "init-options.json"),
    JSON.stringify(
      {
        ai: targets[0] ? integrationKeyFor(targets[0]) : null,
        integration: targets[0] ? integrationKeyFor(targets[0]) : null,
        installed: targets.map(integrationKeyFor),
        updated: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
  );

  return { created, skipped, targets };
}

/** Thin agent body shared by Claude Code and GitHub Copilot (same text). */
export function renderThinAgent(role: SddAgentRole): string {
  const rules = role.roleRules.map((r) => `- ${r}`).join("\n");
  return `---
name: ${role.id}
description: ${role.description}
---

# ${role.id}

${role.roleLine}

## Required reads (in order)

1. \`.sdd/active-context.md\` — current change and stage
2. \`.sdd/protocol.md\` — SDD rules for this repo (single playbook)
3. Active change files under \`changes/<id>/\` as listed in active-context

## Role rules

${rules}

## Done

Remind the human: \`sdd verify\` then \`sdd next\` / \`sdd complete\` as appropriate.
Do not claim the change is complete without local verification when the workflow requires it.
`;
}

/** Write .sdd/active-context.md for the current change (all agents read this). */
export async function refreshActiveAgentContext(projectRoot: string): Promise<string | null> {
  const markerDir = sddRoot(projectRoot);
  if (!(await pathExists(join(markerDir, "config.yaml")))) {
    return null;
  }

  // Ensure protocol exists for agents that only got a partial install
  const protocolPath = join(markerDir, "protocol.md");
  if (!(await pathExists(protocolPath))) {
    await writeText(protocolPath, PROTOCOL_MD);
  }

  const config = await loadConfig(projectRoot);
  const activeId = await getActiveChangeId(projectRoot, config);
  const outPath = join(markerDir, "active-context.md");

  if (!activeId) {
    const empty = `# SDD active context

_No active change._ Run \`sdd new "…"\` or **SDD: New Change** in the IDE.

Then re-run \`sdd agents refresh\` (or advance a stage) to update this file.

Protocol: \`.sdd/protocol.md\`
`;
    await writeText(outPath, empty);
    return outPath;
  }

  const ctx = await buildContext(projectRoot, config, activeId);
  const handoff = await buildAgentPrompt(ctx, config, projectRoot);
  const status = formatStatus(ctx);

  const body = `# SDD active context

> Auto-generated for coding agents.  
> Change: **${ctx.meta.title}** · \`${ctx.id}\` · stage **${ctx.meta.stage}**  
> Protocol: \`.sdd/protocol.md\`

## Status

\`\`\`
${status}
\`\`\`

${handoff}
`;

  await writeText(outPath, body);
  return outPath;
}

/** Single playbook — only long agent-facing content we author once. */
export const PROTOCOL_MD = `# SDD protocol

This repo uses **Structured Vibe Coding** (\`sdd\`). Agents must follow this file plus \`.sdd/active-context.md\`. Do not invent a parallel process.

## Source of truth

| What | Where |
|------|--------|
| Process state | \`changes/<id>/meta.yaml\` (workflow, stage, gates) |
| Current task snapshot | \`.sdd/active-context.md\` |
| Stable product/tech rules | \`memory/*.md\` |
| Stage artifacts | files in \`changes/<id>/\` for the active change |

## Required read order

1. \`.sdd/active-context.md\`
2. This file (\`.sdd/protocol.md\`)
3. \`meta.yaml\` + artifacts for the **current stage** (and prior stages if needed)
4. \`memory/\` when architecture or conventions matter

## Stage behavior

| Stage kind | Agent focus |
|------------|-------------|
| intent / feature / stories | Clarify scope; write short artifacts |
| design / lld / db / research / hl_arb | Specs and decisions; minimal product code |
| tasks | Break work into implementable checklist |
| implement | Code only for this change; follow tasks/acceptance |
| local_verify | Check acceptance; fix only; prepare for complete |

## Hard rules

1. **Do not skip hard gates.** If blocked, tell the human to run \`sdd gate approve\` (or fix the gate).
2. **Stay in scope** of the active change title/intent. No drive-by refactors or new features.
3. **Honor constraints** in \`arb-decision.md\`, design, and memory non-negotiables.
4. **Local verify** is part of done when the workflow has a verify stage: \`sdd verify\`.
5. Prefer small, reviewable diffs.

## Commands (human / shell)

\`\`\`bash
sdd status
sdd next
sdd agent              # print handoff
sdd agents refresh     # refresh active-context.md
sdd verify
sdd complete
\`\`\`

## Out of scope for agents

- Replacing CI/CD or team process tools
- Deleting \`.sdd\` / archive history
- Claiming complete without verify when required
`;

function renderAgentsMd(targets: AgentTarget[]): string {
  const rows: string[] = [];
  if (targets.includes("claude-code")) {
    rows.push(
      "| Claude Code | `.claude/agents/` (`sdd`, `sdd-planner`, `sdd-implementer`, `sdd-reviewer`) |",
    );
  }
  if (targets.includes("copilot")) {
    rows.push(
      "| GitHub Copilot | `.github/agents/*.agent.md` (same roles; any IDE that supports Copilot agents) |",
    );
  }
  return `# Agents

This repo uses **SDD agents only** (no skills).

AI coding agents are **not** the same as IDEs: VS Code, Cursor, and IntelliJ host tools like Copilot or Claude Code.

| Read first | |
|------------|--|
| Live task | \`.sdd/active-context.md\` |
| Playbook | \`.sdd/protocol.md\` |

| AI agent | Files |
|----------|--------|
${rows.join("\n")}

Refresh context: \`sdd agents refresh\`.
`;
}
