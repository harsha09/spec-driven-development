import { constants } from "node:fs";
import { access, lstat, readdir, rmdir, unlink } from "node:fs/promises";
import { dirname, join } from "pathe";
import { buildAgentPrompt, formatStatus } from "./agent-handoff.js";
import { buildContext, getActiveChangeId } from "./change-context.js";
import { loadConfig } from "./config.js";
import { SddError } from "./errors.js";
import { pathExists, readText, writeText } from "./fs.js";
import { type KeptFile, generatedState, markGenerated } from "./generated.js";
import { sddRoot } from "./paths.js";
import type { Config } from "./schemas.js";

/**
 * AI coding agents (not IDEs).
 * Speckit-style: one integration at a time; public keys: `copilot` | `claude` | `grok` | `ollama` | `kilo`.
 */
export type AgentTarget = "copilot" | "claude-code" | "grok" | "ollama" | "kilo";

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
  {
    id: "ollama",
    key: "ollama",
    aliases: ["local", "llama", "ollama-local"],
    label: "Ollama (local)",
    hint: "Local models via `ollama` CLI + AGENTS.md / .ollama/sdd.md (set SDD_OLLAMA_MODEL)",
    requiresCli: true,
    cliBinary: "ollama",
    installUrl: "https://ollama.com",
    // Single project brief — Ollama does not auto-load multi-role agent trees
    rolePath: () => `.ollama/sdd.md`,
    rolesToInstall: ["sdd"],
    agentsMdRow:
      "| Ollama (local) | `.ollama/sdd.md` + `AGENTS.md` + handoff; launch: `ollama run $SDD_OLLAMA_MODEL` |",
  },
  {
    id: "kilo",
    key: "kilo",
    aliases: ["kilocode", "kilo-code", "kilo-ai"],
    label: "Kilo Code",
    hint: ".kilo/sdd.md + AGENTS.md (terminal CLI from kilo.ai)",
    requiresCli: true,
    cliBinary: "kilo",
    installUrl: "https://kilo.ai/docs/code-with-ai/platforms/cli",
    // Single project brief — Kilo loads AGENTS.md and supports instruction files
    rolePath: () => `.kilo/sdd.md`,
    rolesToInstall: ["sdd"],
    agentsMdRow:
      "| Kilo Code | `.kilo/sdd.md` + `AGENTS.md` (reads protocol + active-context; run `kilo` or `sdd` in shell) |",
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

const IDE_NAMES = new Set(["intellij", "idea", "jetbrains", "vscode", "vs-code", "cursor"]);

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
    case "ollama":
      return [".ollama"];
    case "kilo":
      return [".kilo"];
    default:
      return [];
  }
}

/** Legacy paths from older SDD versions that installed IntelliJ notes as an "agent". */
const LEGACY_AGENT_PATHS = [".idea/sdd-agent-notes.md"];

/** Top-level host folders that may be removed once sdd has emptied them (never `.github`). */
const PRUNABLE_PARENTS = [".claude", ".idea", ".grok", ".ollama", ".kilo"];

export interface RemoveAgentHostsResult {
  /** Project-relative files and directories sdd removed */
  removed: string[];
  /** Files left in place because sdd did not generate them, they were edited, or are links */
  kept: KeptFile[];
}

type PathKind = "missing" | "file" | "dir" | "symlink" | "other";

/** lstat-based kind: never follows symlinks, so dangling links and loops are fine. */
async function pathKind(full: string): Promise<PathKind> {
  try {
    const st = await lstat(full);
    if (st.isSymbolicLink()) return "symlink";
    if (st.isDirectory()) return "dir";
    if (st.isFile()) return "file";
    return "other";
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return "missing";
    throw err;
  }
}

/** First project-relative component of `rel` that is a symlink, or null. */
async function symlinkOnPath(projectRoot: string, rel: string): Promise<string | null> {
  let cur = "";
  for (const part of rel.split("/")) {
    cur = cur ? `${cur}/${part}` : part;
    const kind = await pathKind(join(projectRoot, cur));
    if (kind === "symlink") return cur;
    if (kind === "missing") return null;
  }
  return null;
}

async function canAccess(full: string, mode: number): Promise<boolean> {
  try {
    await access(full, mode);
    return true;
  } catch {
    return false;
  }
}

function fsCode(err: unknown): string | undefined {
  return (err as NodeJS.ErrnoException | undefined)?.code;
}

/** Turn a raw fs error (EACCES, EISDIR, …) into a sentence naming the path. */
export function describeFsError(err: unknown, action: string, rel: string): string {
  const code = fsCode(err);
  const why =
    code === "EACCES" || code === "EPERM"
      ? "permission denied"
      : code === "EISDIR"
        ? "it is a directory, not a file"
        : code === "ENOTDIR"
          ? "a parent path is a file, not a directory"
          : code === "ELOOP"
            ? "too many levels of symbolic links"
            : code === "ENOENT"
              ? "it does not exist (dangling symbolic link?)"
              : ((err as Error)?.message ?? String(err));
  return `Cannot ${action} ${rel}: ${why}${code ? ` (${code})` : ""}.`;
}

/** Thrown before anything is written when sdd cannot safely install agent files. */
export class AgentInstallPreflightError extends SddError {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(
      [
        "sdd cannot set up the AI agent files. Nothing was written.",
        ...problems.map((pr) => `  - ${pr}`),
        "Fix the paths above, then re-run.",
      ].join("\n"),
      { code: "AGENT_PREFLIGHT" },
    );
    this.name = "AgentInstallPreflightError";
    this.problems = problems;
  }
}

/** Files sdd would remove from other hosts' folders, and what it leaves alone. */
interface RemovalPlan {
  remove: string[];
  kept: KeptFile[];
}

async function planOtherHostRemoval(projectRoot: string, keep: AgentTarget): Promise<RemovalPlan> {
  const remove: string[] = [];
  const kept: KeptFile[] = [];
  const candidates: string[] = [];
  for (const integ of AGENT_INTEGRATIONS) {
    if (integ.id === keep) continue;
    candidates.push(...agentHostPaths(integ.id));
  }
  candidates.push(...LEGACY_AGENT_PATHS);

  const visit = async (rel: string): Promise<void> => {
    const full = join(projectRoot, rel);
    const kind = await pathKind(full);
    if (kind === "missing") return;
    if (kind === "symlink") {
      // Never follow, read through, or delete a link (sdd never creates them).
      kept.push({ path: rel, reason: "symlink" });
      return;
    }
    if (kind === "dir") {
      let names: string[];
      try {
        names = (await readdir(full)).sort();
      } catch {
        kept.push({ path: rel, reason: "unreadable" });
        return;
      }
      for (const name of names) await visit(`${rel}/${name}`);
      return;
    }
    if (kind !== "file") {
      kept.push({ path: rel, reason: "not-generated" });
      return;
    }
    let state: ReturnType<typeof generatedState>;
    try {
      state = generatedState(await readText(full));
    } catch {
      kept.push({ path: rel, reason: "unreadable" });
      return;
    }
    if (state === "unmodified") remove.push(rel);
    else kept.push({ path: rel, reason: state });
  };

  for (const rel of candidates) {
    const link = await symlinkOnPath(projectRoot, rel);
    if (link) {
      if (!kept.some((k) => k.path === link)) kept.push({ path: link, reason: "symlink" });
      continue;
    }
    await visit(rel);
  }
  return { remove, kept };
}

async function removalProblems(projectRoot: string, plan: RemovalPlan): Promise<string[]> {
  const problems: string[] = [];
  for (const rel of plan.remove) {
    const dir = dirname(rel);
    if (!(await canAccess(join(projectRoot, dir), constants.W_OK))) {
      problems.push(
        `Cannot remove ${rel} (another host's sdd file): ${dir}/ is not writable (permission denied). Make it writable or delete the file yourself.`,
      );
    }
  }
  return problems;
}

/**
 * Remove the files in `plan`, then only the directories sdd emptied by doing so.
 * Empty directories the user made are never removed; `.github` itself is never removed.
 */
async function executeRemoval(projectRoot: string, plan: RemovalPlan): Promise<string[]> {
  const removed: string[] = [];
  const ancestors = new Set<string>();
  for (const rel of plan.remove) {
    try {
      await unlink(join(projectRoot, rel));
    } catch (err) {
      throw new SddError(describeFsError(err, "remove", rel), { cause: err });
    }
    removed.push(rel);
    let dir = dirname(rel);
    while (dir !== "." && dir !== "") {
      const top = !dir.includes("/");
      if (top && !PRUNABLE_PARENTS.includes(dir)) break;
      ancestors.add(dir);
      dir = dirname(dir);
    }
  }
  // Deepest first, so a parent is checked after its emptied children are gone.
  const dirs = [...ancestors].sort((a, b) => b.split("/").length - a.split("/").length);
  for (const rel of dirs) {
    const full = join(projectRoot, rel);
    if ((await pathKind(full)) !== "dir") continue;
    if ((await readdir(full)).length !== 0) continue;
    try {
      await rmdir(full);
      removed.push(rel);
    } catch {
      // Leaving an empty folder behind is harmless.
    }
  }
  return removed;
}

/**
 * Remove agent files for hosts other than `keep`, but only files sdd generated
 * and nobody edited since (marker + content hash). User files, edited files,
 * symlinks and other tools' files in those folders are kept and reported.
 * Never follows symlinks. Only folders emptied by this removal are pruned.
 * Does not touch .sdd/, memory/, changes/, or non-agent .github content.
 */
export async function removeOtherAgentHostsDetailed(
  projectRoot: string,
  keep: AgentTarget,
): Promise<RemoveAgentHostsResult> {
  const plan = await planOtherHostRemoval(projectRoot, keep);
  const problems = await removalProblems(projectRoot, plan);
  if (problems.length) throw new AgentInstallPreflightError(problems);
  const removed = await executeRemoval(projectRoot, plan);
  return { removed, kept: plan.kept };
}

/**
 * Remove sdd-generated, unedited agent files for hosts other than `keep`.
 * Returns the removed paths. See {@link removeOtherAgentHostsDetailed} for kept files.
 */
export async function removeOtherAgentHosts(
  projectRoot: string,
  keep: AgentTarget,
): Promise<string[]> {
  return (await removeOtherAgentHostsDetailed(projectRoot, keep)).removed;
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
export type SddAgentRoleId = "sdd" | "sdd-planner" | "sdd-implementer" | "sdd-reviewer";

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
      "If kickoff/brief says refine or analyze: follow changes/<id>/refine-brief.md — stage-scoped refine; never edit constitution; do not sdd next.",
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
    description: "SDD implementer. Use when coding the active change (implement stage).",
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
  /** sdd-generated, unedited files that already existed (re-run with force to regenerate) */
  skipped: string[];
  /** Files never overwritten or deleted: not generated by sdd, or edited since */
  kept: KeptFile[];
  /** Other hosts' sdd-generated files that were removed */
  removed: string[];
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

/** What installAgentIntegration would do with one generated file. */
export interface PlannedWrite {
  rel: string;
  content: string;
  /** create: new file · overwrite: unmodified sdd file + force · skip: unmodified, no force · keep: never touched */
  action: "create" | "overwrite" | "skip" | "keep";
  keptReason?: KeptFile["reason"];
  /** For symlinks on the path: the link itself */
  keptPath?: string;
}

export interface AgentInstallPlan {
  writes: PlannedWrite[];
  removal: RemovalPlan;
  /** Reasons the install cannot proceed safely; empty when it can */
  problems: string[];
}

function agentFiles(integ: AgentIntegration): { rel: string; content: string }[] {
  const roles = integ.rolesToInstall?.length
    ? SDD_AGENT_ROLES.filter((r) => integ.rolesToInstall!.includes(r.id))
    : SDD_AGENT_ROLES;
  return [
    { rel: join(".sdd", "protocol.md"), content: PROTOCOL_MD },
    ...roles.map((role) => ({ rel: integ.rolePath(role.id), content: renderThinAgent(role) })),
    { rel: "AGENTS.md", content: renderAgentsMd(integ) },
  ];
}

/**
 * Work out every write and removal for an agent install without touching the disk,
 * and collect anything that would make it fail half-way (a directory where a file
 * goes, unreadable or read-only files, non-writable folders).
 */
export async function planAgentIntegration(opts: InstallAgentOptions): Promise<AgentInstallPlan> {
  const root = opts.projectRoot;
  const force = opts.force ?? false;
  const integ = getIntegration(opts.target);
  const problems: string[] = [];
  const writes: PlannedWrite[] = [];

  for (const { rel, content } of agentFiles(integ)) {
    const full = join(root, rel);
    // Host/agent files are never written through a symlink (file or folder).
    if (!rel.startsWith(".sdd/")) {
      const link = await symlinkOnPath(root, rel);
      if (link) {
        writes.push({ rel, content, action: "keep", keptReason: "symlink", keptPath: link });
        continue;
      }
    }
    const kind = await pathKind(full);
    if (kind === "missing") {
      // Nearest existing ancestor must be a writable directory.
      let anc = dirname(rel);
      while (anc !== "." && (await pathKind(join(root, anc))) === "missing") anc = dirname(anc);
      const ancFull = anc === "." ? root : join(root, anc);
      const ancKind = await pathKind(ancFull);
      if (ancKind !== "dir" && ancKind !== "symlink") {
        problems.push(`Cannot create ${rel}: ${anc} is a file, not a directory.`);
      } else if (!(await canAccess(ancFull, constants.W_OK))) {
        problems.push(
          `Cannot create ${rel}: ${anc === "." ? "the project folder" : `${anc}/`} is not writable (permission denied).`,
        );
      }
      writes.push({ rel, content, action: "create" });
      continue;
    }
    if (kind === "dir") {
      problems.push(
        `Cannot write ${rel}: it is a directory, not a file (EISDIR). Rename or move it.`,
      );
      writes.push({ rel, content, action: "keep", keptReason: "not-generated" });
      continue;
    }
    if (kind !== "file") {
      writes.push({ rel, content, action: "keep", keptReason: "not-generated" });
      continue;
    }
    let state: ReturnType<typeof generatedState>;
    try {
      state = generatedState(await readText(full));
    } catch (err) {
      problems.push(
        `${describeFsError(err, "read", rel)} sdd must read it to tell whether it generated the file; fix its permissions or move it.`,
      );
      writes.push({ rel, content, action: "keep", keptReason: "unreadable" });
      continue;
    }
    if (state !== "unmodified") {
      writes.push({ rel, content, action: "keep", keptReason: state });
    } else if (!force) {
      writes.push({ rel, content, action: "skip" });
    } else {
      if (!(await canAccess(full, constants.W_OK))) {
        problems.push(
          `Cannot regenerate ${rel} (--force): the file is read-only (permission denied). Make it writable or delete it.`,
        );
      }
      writes.push({ rel, content, action: "overwrite" });
    }
  }

  const removal = await planOtherHostRemoval(root, opts.target);
  problems.push(...(await removalProblems(root, removal)));
  return { writes, removal, problems };
}

/** Throw {@link AgentInstallPreflightError} (before any write) if the install cannot finish. */
export async function assertAgentInstallable(opts: InstallAgentOptions): Promise<void> {
  const plan = await planAgentIntegration(opts);
  if (plan.problems.length) throw new AgentInstallPreflightError(plan.problems);
}

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

  const plan = await planAgentIntegration({ projectRoot: root, target: opts.target, force });
  if (plan.problems.length) throw new AgentInstallPreflightError(plan.problems);

  // Single-agent product rule: remove other hosts' sdd-generated files (never user files)
  const removed = await executeRemoval(root, plan.removal);
  const kept: KeptFile[] = [...plan.removal.kept];

  const byRel = new Map(plan.writes.map((w) => [w.rel, w]));
  const write = async (rel: string) => {
    const w = byRel.get(rel)!;
    if (w.action === "keep") {
      kept.push({ path: w.keptPath ?? rel, reason: w.keptReason! });
      return;
    }
    if (w.action === "skip") {
      skipped.push(rel);
      return;
    }
    try {
      await writeText(join(root, rel), markGenerated(w.content));
    } catch (err) {
      throw new SddError(describeFsError(err, "write", rel), { cause: err });
    }
    created.push(rel);
  };

  await write(join(".sdd", "protocol.md"));
  await refreshActiveAgentContext(root);
  for (const w of plan.writes) {
    if (w.rel !== join(".sdd", "protocol.md") && w.rel !== "AGENTS.md") await write(w.rel);
  }
  await write("AGENTS.md");

  // Single snapshot (no separate init-options.json) — sdd's own state file under .sdd/
  const snapshotRel = join(".sdd", "agents.json");
  if ((await pathExists(join(root, snapshotRel))) && !force) {
    skipped.push(snapshotRel);
  } else {
    await writeText(
      join(root, snapshotRel),
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
    created.push(snapshotRel);
  }

  return { created, skipped, kept, removed, target: opts.target };
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
3. \`memory/constitution.md\` if present — non-negotiables
4. Active change files under \`changes/<id>/\` as listed in active-context

## Role rules

${rules}

## Done

Remind the human: \`sdd verify\` then \`sdd next\` / \`sdd complete\` as appropriate.
Do not claim the change is complete without local verification when the workflow requires it.
`;
}

export interface InstalledAgentSnapshot {
  /** Public key: copilot | claude | grok | ollama | kilo */
  ai: string;
  target: AgentTarget;
  integration: AgentIntegration;
}

/** Read which AI agent was configured at `sdd init` / last agents install. */
export async function loadInstalledAgent(
  projectRoot: string,
): Promise<InstalledAgentSnapshot | null> {
  const path = join(sddRoot(projectRoot), "agents.json");
  if (!(await pathExists(path))) return null;
  try {
    const raw = JSON.parse(await readText(path)) as {
      ai?: string;
      integration?: string;
      installed?: string[];
    };
    const key = raw.ai ?? raw.integration ?? raw.installed?.[0];
    if (!key || typeof key !== "string") return null;
    const target = parseIntegration(key);
    return { ai: integrationKeyFor(target), target, integration: getIntegration(target) };
  } catch {
    return null;
  }
}

/**
 * Write `.sdd/handoff.md` for the active (or given) change — full agent brief.
 * Used by `sdd agent` and auto-launch after `sdd new`.
 */
export async function writeAgentHandoff(
  projectRoot: string,
  config: Config,
  changeId: string,
): Promise<string> {
  const ctx = await buildContext(projectRoot, config, changeId);
  const body = await buildAgentPrompt(ctx, config, projectRoot);
  const outPath = join(sddRoot(projectRoot), "handoff.md");
  const header = `# SDD handoff (auto)

> Generated for the AI coding agent configured at init.  
> Change: **${ctx.meta.title}** · \`${ctx.id}\` · stage **${ctx.meta.stage}**

Also read: \`.sdd/active-context.md\`, \`.sdd/protocol.md\`, \`memory/constitution.md\` if present.

---

`;
  await writeText(outPath, header + body + "\n");
  return outPath;
}

/** Short kickoff line to pass into agent CLIs (full brief is in handoff.md). */
export function agentKickoffMessage(opts: {
  title: string;
  stage: string;
  changeId: string;
  /** What just happened, e.g. "new change", "advanced to implement" */
  event?: string;
  /**
   * When set, replaces the default "do current stage work" tail
   * (used by sdd refine and other specialized modes).
   */
  instructions?: string;
}): string {
  const event = opts.event ?? "context updated";
  if (opts.instructions?.trim()) {
    return [
      `SDD: ${event}.`,
      `Title: ${opts.title}`,
      `Change: ${opts.changeId}`,
      `Stage: ${opts.stage}`,
      opts.instructions.trim(),
    ].join(" ");
  }
  return [
    `SDD: ${event}.`,
    `Title: ${opts.title}`,
    `Change: ${opts.changeId}`,
    `Stage: ${opts.stage}`,
    `Read in order: .sdd/active-context.md, .sdd/handoff.md, .sdd/protocol.md, memory/constitution.md (if present).`,
    `Do the work for the current stage only under changes/${opts.changeId}/. Do not expand scope.`,
    `When the stage is done, tell the human to run: sdd next (or sdd verify / sdd complete as appropriate).`,
  ].join(" ");
}

/** Write .sdd/active-context.md for the current change. */
export async function refreshActiveAgentContext(projectRoot: string): Promise<string | null> {
  const markerDir = sddRoot(projectRoot);
  if (!(await pathExists(join(markerDir, "config.yaml")))) {
    return null;
  }

  const protocolPath = join(markerDir, "protocol.md");
  if (!(await pathExists(protocolPath))) {
    await writeText(protocolPath, markGenerated(PROTOCOL_MD));
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
| Non-negotiables | \`memory/constitution.md\` if present |
| Stable product/tech rules | \`memory/*.md\` (start at \`memory/index.md\` if present) |
| Stage artifacts | files in \`changes/<id>/\` for the active change |

## Required read order

1. \`.sdd/active-context.md\`
2. This file (\`.sdd/protocol.md\`)
3. \`memory/constitution.md\` if present (non-negotiables agents must not violate)
4. \`meta.yaml\` + artifacts for the **current stage** (and prior stages if needed)
5. \`memory/index.md\` (documentation map) if present, then linked memory pages when architecture or conventions matter

## Stage behavior

| Stage kind | Agent focus |
|------------|-------------|
| intent / feature / stories | Clarify scope; write short artifacts |
| design / lld / db / research / hl_arb | Specs and decisions; minimal product code |
| tasks | Break work into implementable checklist |
| implement | Code only for this change; follow tasks/acceptance |
| local_verify | Check acceptance; fix only; prepare for complete |
| brainstorm (optional) | Multiple approaches; parallel exploration; no final design yet |
| clarify_* (optional) | Ask clarifying questions; write Q&A; or tell human to skip |

## Optional stages

- Stages marked **optional** / kind \`brainstorm\` or \`clarify\` may be skipped:  
  \`sdd skip <stage_id> -r "not needed"\`
- Do **not** invent a skip by jumping stages. \`sdd next\` blocks on empty required stubs (e.g. design.md).
- If the tool falls back to an earlier stage, **complete that stage** before advancing again.

## Hard rules

1. **Do not skip hard gates.** If blocked, tell the human to run \`sdd gate approve\` (or fix the gate).
2. **Stay in scope** of the active change title/intent. No drive-by refactors or new features.
3. **Honor constraints** in \`arb-decision.md\`, design, and memory non-negotiables.
4. **Local verify** is part of done when the workflow has a verify stage: \`sdd verify\`.
5. Prefer small, reviewable diffs.
6. **Required stage artifacts must be substantive** — not empty templates. Design cannot be skipped via empty design.md.

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
- Deleting \`.sdd\` / completed change history
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
| Constitution | \`memory/constitution.md\` if present |
| Doc map (stable) | \`memory/index.md\` if present |

| AI agent | Files |
|----------|--------|
${integ.agentsMdRow}

Refresh context: \`sdd agents refresh\`.
`;
}
