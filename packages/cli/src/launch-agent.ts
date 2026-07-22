/**
 * Launch the AI coding agent configured at `sdd init` (from .sdd/agents.json).
 *
 * Purpose: every SDD process step should hand work to the coding agent.
 * - grok / claude: spawn CLI explicitly
 * - copilot: host UI handles agents — we refresh handoff + instruct the human
 */
import { spawnSync } from "node:child_process";
import { consola } from "consola";
import pc from "picocolors";
import {
  agentKickoffMessage,
  loadInstalledAgent,
  refreshActiveAgentContext,
  resolveChangeId,
  writeAgentHandoff,
  type AgentTarget,
  type Config,
  type ChangeContext,
} from "@structured-vibe-coding/core";

export interface LaunchAgentOptions {
  projectRoot: string;
  config: Config;
  /** Active change context (preferred) */
  ctx?: ChangeContext;
  /** Or resolve change id (default: active) */
  changeId?: string;
  /** Skip spawning (CLI --no-agent or SDD_NO_AGENT=1) */
  noAgent?: boolean;
  /** What just happened — included in kickoff */
  event?: string;
  /**
   * If false, only write handoff (no spawn). Used by `sdd agent` print mode.
   * Default true when not noAgent.
   */
  launch?: boolean;
  /**
   * Skip rewriting handoff (e.g. change already archived after complete).
   * Still launches with kickoff using ctx / changeId.
   */
  reuseHandoff?: boolean;
  /**
   * When set, replaces default "do stage work" kickoff instructions
   * (e.g. sdd refine mode).
   */
  kickoffInstructions?: string;
}

export interface LaunchAgentResult {
  handoffPath: string | null;
  target: AgentTarget | null;
  launched: boolean;
  command?: string[];
  reason?: string;
}

function toolOnPath(bin: string): boolean {
  const cmd = process.platform === "win32" ? "where" : "which";
  const r = spawnSync(cmd, [bin], { encoding: "utf8" });
  return r.status === 0;
}

function shouldSkipLaunch(noAgent?: boolean): boolean {
  if (noAgent) return true;
  if (process.env.SDD_NO_AGENT === "1" || process.env.SDD_NO_AGENT === "true") {
    return true;
  }
  return false;
}

/** @deprecated use launchConfiguredAgent */
export async function launchAgentAfterNew(opts: {
  projectRoot: string;
  config: Config;
  ctx: ChangeContext;
  noAgent?: boolean;
}): Promise<LaunchAgentResult> {
  return launchConfiguredAgent({
    projectRoot: opts.projectRoot,
    config: opts.config,
    ctx: opts.ctx,
    noAgent: opts.noAgent,
    event: "new change started",
  });
}

/**
 * Refresh context, write handoff, launch the init-configured agent.
 */
export async function launchConfiguredAgent(
  opts: LaunchAgentOptions,
): Promise<LaunchAgentResult> {
  let changeId = opts.changeId ?? opts.ctx?.id;
  try {
    if (!changeId) {
      changeId = await resolveChangeId(opts.projectRoot, opts.config);
    }
  } catch {
    return {
      handoffPath: null,
      target: null,
      launched: false,
      reason: "No active change — agent not launched",
    };
  }

  await refreshActiveAgentContext(opts.projectRoot);

  let handoffPath: string | null = null;
  if (!opts.reuseHandoff) {
    try {
      handoffPath = await writeAgentHandoff(
        opts.projectRoot,
        opts.config,
        changeId,
      );
    } catch (err) {
      return {
        handoffPath: null,
        target: null,
        launched: false,
        reason: `Could not write handoff: ${err instanceof Error ? err.message : err}`,
      };
    }
  } else {
    handoffPath = `${opts.projectRoot}/.sdd/handoff.md`;
  }

  const installed = await loadInstalledAgent(opts.projectRoot);
  if (!installed) {
    return {
      handoffPath,
      target: null,
      launched: false,
      reason: "No AI agent configured (run sdd init --ai grok|copilot|claude)",
    };
  }

  if (shouldSkipLaunch(opts.noAgent) || opts.launch === false) {
    return {
      handoffPath,
      target: installed.target,
      launched: false,
      reason: opts.noAgent || process.env.SDD_NO_AGENT
        ? "Skipped (--no-agent or SDD_NO_AGENT)"
        : "Launch disabled",
    };
  }

  const title = opts.ctx?.meta.title ?? changeId;
  const stage = opts.ctx?.meta.stage ?? "unknown";
  const kickoff = agentKickoffMessage({
    title,
    stage: opts.ctx?.meta.stage ?? stage,
    changeId,
    event: opts.event ?? "SDD command finished",
    instructions: opts.kickoffInstructions,
  });

  const target = installed.target;
  const cwd = opts.projectRoot;

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return {
      handoffPath,
      target,
      launched: false,
      reason: "Non-interactive session — open agent with .sdd/handoff.md",
    };
  }

  if (target === "grok") {
    return spawnCliAgent({
      label: installed.integration.label,
      bin: installed.integration.cliBinary ?? "grok",
      kickoff,
      cwd,
      handoffPath,
      target,
      preferPrintFlag: true,
    });
  }

  if (target === "claude-code") {
    return spawnCliAgent({
      label: installed.integration.label,
      bin: installed.integration.cliBinary ?? "claude",
      kickoff,
      cwd,
      handoffPath,
      target,
      preferPrintFlag: true,
    });
  }

  // GitHub Copilot: IDE/chat owns the agent window
  return {
    handoffPath,
    target,
    launched: false,
    reason:
      "GitHub Copilot: open VS Code/Cursor → Copilot Chat → agent `sdd` (handoff refreshed at .sdd/handoff.md)",
  };
}

async function spawnCliAgent(opts: {
  label: string;
  bin: string;
  kickoff: string;
  cwd: string;
  handoffPath: string;
  target: AgentTarget;
  preferPrintFlag: boolean;
}): Promise<LaunchAgentResult> {
  if (!toolOnPath(opts.bin)) {
    return {
      handoffPath: opts.handoffPath,
      target: opts.target,
      launched: false,
      reason: `${opts.bin} not on PATH. Install ${opts.label}, or open it on this project (handoff: ${opts.handoffPath})`,
    };
  }

  consola.info(pc.cyan(`Starting ${opts.label}…`));
  if (opts.preferPrintFlag) {
    const args = ["-p", opts.kickoff];
    const r = spawnSync(opts.bin, args, {
      cwd: opts.cwd,
      stdio: "inherit",
      encoding: "utf8",
    });
    if (!r.error && (r.status === 0 || r.status === null)) {
      return {
        handoffPath: opts.handoffPath,
        target: opts.target,
        launched: true,
        command: [opts.bin, ...args],
      };
    }
  }

  // Interactive TUI / session (loads project AGENTS.md / rules)
  consola.info(pc.dim(`Opening interactive ${opts.bin} in project…`));
  const r2 = spawnSync(opts.bin, [], { cwd: opts.cwd, stdio: "inherit" });
  return {
    handoffPath: opts.handoffPath,
    target: opts.target,
    launched: !r2.error,
    command: [opts.bin],
    reason: r2.error ? String(r2.error.message) : undefined,
  };
}

/** Log launch result consistently after any sdd command. */
export async function reportAgentLaunch(result: LaunchAgentResult): Promise<void> {
  if (result.handoffPath) {
    consola.info(`Handoff: ${result.handoffPath}`);
  }
  if (result.launched) {
    consola.success(
      `Started ${result.target} (${(result.command ?? []).join(" ")})`,
    );
    return;
  }
  if (result.reason) {
    consola.info(pc.dim(result.reason));
  }
  if (result.target === "grok" && !result.launched) {
    consola.log(
      pc.dim("  Tip: open Grok Build in this folder — AGENTS.md + .grok/rules/sdd.md load automatically"),
    );
  }
}
