/**
 * Launch the AI coding agent configured at `sdd init` (from .sdd/agents.json).
 */
import { spawnSync } from "node:child_process";
import { consola } from "consola";
import pc from "picocolors";
import {
  agentKickoffMessage,
  loadInstalledAgent,
  writeAgentHandoff,
  type AgentTarget,
  type Config,
  type ChangeContext,
} from "@structured-vibe-coding/core";

export interface LaunchAfterNewOptions {
  projectRoot: string;
  config: Config;
  ctx: ChangeContext;
  /** Skip spawning the agent CLI */
  noAgent?: boolean;
}

export interface LaunchAfterNewResult {
  handoffPath: string;
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

/**
 * After `sdd new`: write handoff, then start the configured agent with a short kickoff.
 * Full brief lives in .sdd/handoff.md + active-context (agent reads those).
 */
export async function launchAgentAfterNew(
  opts: LaunchAfterNewOptions,
): Promise<LaunchAfterNewResult> {
  const handoffPath = await writeAgentHandoff(
    opts.projectRoot,
    opts.config,
    opts.ctx.id,
  );

  const installed = await loadInstalledAgent(opts.projectRoot);
  if (!installed) {
    return {
      handoffPath,
      target: null,
      launched: false,
      reason: "No AI agent configured (run sdd init --ai grok|copilot|claude)",
    };
  }

  if (opts.noAgent) {
    return {
      handoffPath,
      target: installed.target,
      launched: false,
      reason: "Skipped (--no-agent)",
    };
  }

  const kickoff = agentKickoffMessage({
    title: opts.ctx.meta.title,
    stage: opts.ctx.meta.stage,
    changeId: opts.ctx.id,
  });

  const target = installed.target;
  const cwd = opts.projectRoot;

  // Non-TTY (CI): never hang on interactive agent
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return {
      handoffPath,
      target,
      launched: false,
      reason: "Non-interactive session — open agent manually with .sdd/handoff.md",
    };
  }

  if (target === "grok") {
    const bin = installed.integration.cliBinary ?? "grok";
    if (!toolOnPath(bin)) {
      return {
        handoffPath,
        target,
        launched: false,
        reason: `${bin} not on PATH. Install Grok Build, then re-run or open the project in Grok (handoff: ${handoffPath})`,
      };
    }
    // Prefer one-shot prompt; falls back message if CLI shape differs
    consola.info(pc.cyan(`Starting ${installed.integration.label}…`));
    const args = ["-p", kickoff];
    const r = spawnSync(bin, args, { cwd, stdio: "inherit", encoding: "utf8" });
    if (r.error || (r.status !== 0 && r.status !== null)) {
      // Fallback: open interactive TUI in project (loads AGENTS.md + rules)
      consola.info(pc.dim(`Retrying interactive ${bin}…`));
      const r2 = spawnSync(bin, [], { cwd, stdio: "inherit" });
      return {
        handoffPath,
        target,
        launched: r2.status === 0 || r2.status === null,
        command: [bin],
        reason: r2.error ? String(r2.error.message) : undefined,
      };
    }
    return { handoffPath, target, launched: true, command: [bin, ...args] };
  }

  if (target === "claude-code") {
    const bin = installed.integration.cliBinary ?? "claude";
    if (!toolOnPath(bin)) {
      return {
        handoffPath,
        target,
        launched: false,
        reason: `${bin} not on PATH. Install Claude Code CLI, or open the project and paste .sdd/handoff.md`,
      };
    }
    consola.info(pc.cyan(`Starting ${installed.integration.label}…`));
    // Claude Code: -p for print/one-shot when available
    const args = ["-p", kickoff];
    const r = spawnSync(bin, args, { cwd, stdio: "inherit", encoding: "utf8" });
    if (r.error || (r.status !== 0 && r.status !== null)) {
      const r2 = spawnSync(bin, [kickoff], { cwd, stdio: "inherit" });
      return {
        handoffPath,
        target,
        launched: !r2.error,
        command: [bin, kickoff],
        reason: r2.error ? String(r2.error.message) : undefined,
      };
    }
    return { handoffPath, target, launched: true, command: [bin, ...args] };
  }

  // copilot — no reliable CLI to start custom agents
  return {
    handoffPath,
    target,
    launched: false,
    reason:
      "GitHub Copilot: open VS Code/Cursor → Copilot Chat → pick agent `sdd` / paste .sdd/handoff.md",
  };
}
