import { join } from "pathe";
import { pathExists, removePath, writeText } from "./fs.js";
import { loadConfig } from "./config.js";
import { buildContext, getActiveChangeId } from "./change-context.js";
import { buildAgentPrompt, formatStatus } from "./agent-handoff.js";
import { sddRoot } from "./paths.js";

/**
 * AI coding agents (not IDEs).
 * Speckit-style: one integration at a time; public keys: `copilot` | `claude` | `grok`.
 */
export type AgentTarget = "copilot" | "claude-code" | "grok";

/** Registry entry — add a new AI agent by appending here only. */
export interface AgentIntegration {
  id: AgentTarget;
  /** Speckit-style public key (`--ai` / `--integration`). */
  key: string;
  aliases: string[];
  label: string;
  hint: string;
  requiresCli: boolean;
  installUrl: string;
  /** Binary name when requiresCli (e.g. `claude`). */
  cliBinary?: string;
  /** Relative path for a thin role agent file. */
  rolePath: (roleId: string) => string;
  /**
   * Which thin roles to install. Default: all SDD_AGENT_ROLES.
   * Grok loads every `*.md` under `.grok/rules/`, so only install the router
   * role there to avoid conflicting planner/implementer instructions.
   */
  rolesToInstall?: SddAgentRoleId[];
  /** One markdown table row for AGENTS.md. */
  agentsMdRow: string;
}

export const AGENT_INTEGRATIONS: AgentIntegration[] = [
  {
    id: "copilot",
    key: "copilot",
    aliases: ["github-copilot", "gh-copilot"],
    label: "GitHub Copilot",
    hint: ".github/agents/*.agent.md (VS Code, Cursor, JetBrains, …)",
    requiresCli: false,
    installUrl: "https://github.com/features/copilot",
    rolePath: (roleId) => `.github/agents/${roleId}.agent.md`,
    agentsMdRow:
      "| GitHub Copilot | `.github/agents/*.agent.md` (same roles; any IDE that supports Copilot agents) |",
  },
  {
    id: "claude-code",
    key: "claude",
    aliases: ["claude-code", "claudecode"],
    label: "Claude Code",
    hint: ".claude/agents/*.md (terminal agent)",
    requiresCli: true,
    cliBinary: "claude",
    installUrl: "https://docs.anthropic.com/en/docs/claude-code",
    rolePath: (roleId) => `.claude/agents/${roleId}.md`,
    agentsMdRow:
      "| Claude Code | `.claude/agents/` (`sdd`, `sdd-planner`, `sdd-implementer`, `sdd-reviewer`) |",
  },
  {
    id: "grok",
    key: "grok",
    aliases: ["grok-build", "grokbuild", "xai", "xai-grok"],
    label: "Grok Build",
    hint: ".grok/rules/sdd.md + AGENTS.md (terminal TUI from xAI)",
    requiresCli: false,
    cliBinary: "grok",
    installUrl: "https://docs.x.ai",
    // Single rules file: Grok auto-loads all .grok/rules/*.md
    rolePath: () => `.grok/rules/sdd.md`,
    rolesToInstall: ["sdd"],
    agentsMdRow:
      "| Grok Build | `.grok/rules/sdd.md` + `AGENTS.md` (reads protocol + active-context; run `sdd` in shell) |",
  },
];

export const ALL_AGENT_TARGETS: AgentTarget[] = AGENT_INTEGRATIONS.map((i) => i.id);

/** Default when non-interactive and no --ai (matches Speckit). */
export const DEFAULT_INIT_INTEGRATION: AgentTarget = "copilot";

/** @deprecated Prefer AgentIntegration / AGENT_INTEGRATIONS — kept for UI option lists. */
export type AgentTargetOption = Pick<
  AgentIntegration,
  "id" | "key" | "label" | "hint" | "requiresCli" | "installUrl"
>;

export const AGENT_TARGET_OPTIONS: AgentTargetOption[] = AGENT_INTEGRATIONS.map(
  ({ id, key, label, hint, requiresCli, installUrl }) => ({
    id,
    key,
    label,
    hint,
    requiresCli,
    installUrl,
  }),
);

const IDE_NAMES = new Set([
  "intellij",
  "idea",
  "jetbrains",
  "vscode",
  "vs-code",
  "cursor",
]);

export function getIntegration(target: AgentTarget): AgentIntegration {
  const found = AGENT_INTEGRATIONS.find((i) => i.id === target);
  if (!found) throw new Error(`Unknown agent integration: ${target}`);
  return found;
}

export function integrationKeyFor(target: AgentTarget): string {
  return getIntegration(target).key;
}

export function optionForTarget(target: AgentTarget): AgentTargetOption {
  return getIntegration(target);
}

/**
 * Paths this integration owns (safe to delete when switching agents).
 * Never includes shared SDD dirs (memory, changes, .sdd) or whole .github (workflows stay).
 */
export function agentHostPaths(target: AgentTarget): string[] {
  switch (target) {
    case "copilot":
      return [".github/agents"];
    case "claude-code":
      return [".claude/agents"];
    case "grok":
      return [".grok/rules"];
    default:
      return [];
  }
}

/** Legacy paths from older SDD versions that installed IntelliJ notes as an "agent". */
const LEGACY_AGENT_PATHS = [".idea/sdd-agent-notes.md"];

/**
 * Remove agent files for hosts other than `keep` (and legacy IntelliJ notes).
 * Does not touch .sdd/, memory/, changes/, or non-agent .github content.
 */
export async function removeOtherAgentHosts(
  projectRoot: string,
  keep: AgentTarget,
): Promise<string[]> {
  const removed: string[] = [];
  for (const integ of AGENT_INTEGRATIONS) {
    if (integ.id === keep) continue;
    for (const rel of agentHostPaths(integ.id)) {
      const full = join(projectRoot, rel);
      if (await pathExists(full)) {
        await removePath(full);
        removed.push(rel);
      }
    }
  }
  for (const rel of LEGACY_AGENT_PATHS) {
    const full = join(projectRoot, rel);
    if (await pathExists(full)) {
      await removePath(full);
      removed.push(rel);
    }
  }
  // Prune empty .claude / .idea parents if we emptied them
  for (const parent of [".claude", ".idea", ".grok"]) {
    if (keep === "grok" && parent === ".grok") continue;
    const full = join(projectRoot, parent);
    if (!(await pathExists(full))) continue;
    try {
      const { readdir } = await import("node:fs/promises");
      const kids = await readdir(full);
      if (kids.length === 0) {
        await removePath(full);
        removed.push(parent);
      }
    } catch {
      // ignore
    }
  }
  return removed;
}

/** Parse one Speckit-style integration key. */
export function parseIntegration(raw: string): AgentTarget {
  const p = raw.trim().toLowerCase();
  if (!p) {
    throw new Error(
      `Expected one AI coding agent. Choose from: ${AGENT_INTEGRATIONS.map((i) => i.key).join(", ")}`,
    );
  }
  if (IDE_NAMES.has(p)) {
    throw new Error(
      `"${p}" is an IDE, not an AI coding agent. Choose: ${AGENT_INTEGRATIONS.map((i) => i.key).join(", ")}.`,
    );
  }
  for (const integ of AGENT_INTEGRATIONS) {
    if (integ.id === p || integ.key === p || integ.aliases.includes(p)) {
      return integ.id;
    }
  }
  throw new Error(
    `Unknown AI coding agent "${raw}". Choose from: ${AGENT_INTEGRATIONS.map((i) => i.key).join(", ")}`,
  );
}

/**
 * Parse one or more keys (comma-separated). Prefer parseIntegration for product flows.
 * @deprecated Multi-install is not the product default; use parseIntegration.
 */
export function parseAgentTargets(raw: string | string[]): AgentTarget[] {
  const parts = (Array.isArray(raw) ? raw : [raw])
    .flatMap((s) => String(s).split(","))
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) {
    throw new Error("No AI coding agent specified");
  }
  const out: AgentTarget[] = [];
  for (const p of parts) {
    const id = parseIntegration(p);
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** Roles emitted as thin agents (shared body generator). */
export type SddAgentRoleId =
  | "sdd"
  | "sdd-planner"
  | "sdd-implementer"
  | "sdd-reviewer";

export interface SddAgentRole {
  id: SddAgentRoleId;
  description: string;
  roleLine: string;
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

export interface InstallAgentOptions {
  projectRoot: string;
  /** Single AI coding agent (Speckit-style). */
  target: AgentTarget;
  force?: boolean;
}

export interface InstallAgentResult {
  created: string[];
  skipped: string[];
  target: AgentTarget;
}

/** @deprecated Use InstallAgentOptions / installAgentIntegration. */
export type InstallAgentsOptions = {
  projectRoot: string;
  targets?: AgentTarget[];
  force?: boolean;
};

/** @deprecated Use InstallAgentResult. */
export type InstallAgentsResult = {
  created: string[];
  skipped: string[];
  targets: AgentTarget[];
};

/**
 * Install thin agents for **one** AI integration (registry-driven).
 * Writes protocol + active-context + role stubs + single `.sdd/agents.json` snapshot.
 */
export async function installAgentIntegration(
  opts: InstallAgentOptions,
): Promise<InstallAgentResult> {
  const integ = getIntegration(opts.target);
  const created: string[] = [];
  const skipped: string[] = [];
  const root = opts.projectRoot;
  const force = opts.force ?? false;

  // Single-agent product rule: never leave other hosts' agent trees around
  await removeOtherAgentHosts(root, opts.target);

  const write = async (rel: string, content: string) => {
    const full = join(root, rel);
    if ((await pathExists(full)) && !force) {
      skipped.push(rel);
      return;
    }
    await writeText(full, content);
    created.push(rel);
  };

  await write(join(".sdd", "protocol.md"), PROTOCOL_MD);
  await refreshActiveAgentContext(root);

  const roles =
    integ.rolesToInstall?.length
      ? SDD_AGENT_ROLES.filter((r) => integ.rolesToInstall!.includes(r.id))
      : SDD_AGENT_ROLES;
  for (const role of roles) {
    await write(integ.rolePath(role.id), renderThinAgent(role));
  }

  await write("AGENTS.md", renderAgentsMd(integ));

  // Single snapshot (no separate init-options.json)
  await write(
    join(".sdd", "agents.json"),
    JSON.stringify(
      {
        version: 3,
        mode: "agents-only",
        protocol: ".sdd/protocol.md",
        activeContext: ".sdd/active-context.md",
        roles: SDD_AGENT_ROLES.map((r) => r.id),
        /** Speckit-style public key */
        ai: integ.key,
        integration: integ.key,
        installed: [integ.id],
        updated: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
  );

  return { created, skipped, target: opts.target };
}

/**
 * Install one or more integrations (writes each host's files; snapshot = last target).
 * Prefer installAgentIntegration for product flows.
 */
export async function installAgentIntegrations(
  opts: InstallAgentsOptions,
): Promise<InstallAgentsResult> {
  if (!opts.targets?.length) {
    throw new Error(
      `Specify one AI coding agent: ${AGENT_INTEGRATIONS.map((i) => i.key).join(", ")}`,
    );
  }
  const created: string[] = [];
  const skipped: string[] = [];
  for (const target of opts.targets) {
    const r = await installAgentIntegration({
      projectRoot: opts.projectRoot,
      target,
      force: opts.force,
    });
    created.push(...r.created);
    skipped.push(...r.skipped);
  }
  return { created, skipped, targets: opts.targets };
}

/** Thin agent body shared across hosts (same text). */
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

/** Write .sdd/active-context.md for the current change. */
export async function refreshActiveAgentContext(projectRoot: string): Promise<string | null> {
  const markerDir = sddRoot(projectRoot);
  if (!(await pathExists(join(markerDir, "config.yaml")))) {
    return null;
  }

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
| Stable product/tech rules | \`memory/*.md\` (start at \`memory/index.md\` if present) |
| Stage artifacts | files in \`changes/<id>/\` for the active change |

## Required read order

1. \`.sdd/active-context.md\`
2. This file (\`.sdd/protocol.md\`)
3. \`meta.yaml\` + artifacts for the **current stage** (and prior stages if needed)
4. \`memory/index.md\` (documentation map) if present, then linked memory pages when architecture or conventions matter

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

function renderAgentsMd(integ: AgentIntegration): string {
  return `# Agents

This repo uses **SDD agents only** (no skills).

AI coding agents are **not** the same as IDEs: VS Code, Cursor, and IntelliJ host tools like Copilot or Claude Code.

| Read first | |
|------------|--|
| Live task | \`.sdd/active-context.md\` |
| Playbook | \`.sdd/protocol.md\` |
| Doc map (stable) | \`memory/index.md\` if present |

| AI agent | Files |
|----------|--------|
${integ.agentsMdRow}

Refresh context: \`sdd agents refresh\`.
`;
}
