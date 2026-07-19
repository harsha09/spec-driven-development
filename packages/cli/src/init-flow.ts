/**
 * Speckit-style init UX: project path, single AI integration, steps, tool check.
 * Mirrors `specify init` patterns without skills.
 */
import { mkdir, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve, basename, isAbsolute } from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import {
  AGENT_TARGET_OPTIONS,
  DEFAULT_INIT_INTEGRATION,
  initProject,
  installAgentIntegrations,
  isInitialized,
  listWorkflowNames,
  optionForTarget,
  parseIntegration,
  type AgentTarget,
} from "@structured-vibe-coding/core";

export interface InitCliArgs {
  path?: string;
  here?: boolean;
  force?: boolean;
  /** Speckit-style: --ai / --integration */
  ai?: string;
  integration?: string;
  noAgents?: boolean;
  ignoreAgentTools?: boolean;
}

function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function toolOnPath(bin: string): boolean {
  const cmd = process.platform === "win32" ? "where" : "which";
  const r = spawnSync(cmd, [bin], { encoding: "utf8" });
  return r.status === 0;
}

/** Resolve project directory like Speckit: name | . | --here */
export async function resolveProjectPath(args: InitCliArgs): Promise<{
  projectRoot: string;
  here: boolean;
  createdDir: boolean;
}> {
  const hereFlag = Boolean(args.here);
  let name = args.path?.trim();

  if (name === ".") {
    return { projectRoot: process.cwd(), here: true, createdDir: false };
  }
  if (hereFlag) {
    if (name) {
      throw new Error("Cannot specify both a project name and --here");
    }
    return { projectRoot: process.cwd(), here: true, createdDir: false };
  }
  if (!name) {
    // Bare `sdd init` → current directory (common DX; Speckit uses --here / .)
    return { projectRoot: process.cwd(), here: true, createdDir: false };
  }

  const projectRoot = isAbsolute(name) ? name : resolve(process.cwd(), name);
  let createdDir = false;
  try {
    await mkdir(projectRoot, { recursive: true });
    createdDir = true;
  } catch {
    // exists
  }
  // mkdir recursive is fine if exists; mark created only if was empty new - ok either way
  return { projectRoot, here: false, createdDir };
}

export async function selectIntegration(args: InitCliArgs): Promise<AgentTarget | false> {
  if (args.noAgents) return false;

  const raw = args.ai ?? args.integration;
  if (raw?.trim()) {
    return parseIntegration(raw);
  }

  if (!isInteractive()) {
    p.log.message(
      pc.dim(
        `Non-interactive session: defaulting to '${DEFAULT_INIT_INTEGRATION}'. ` +
          `Use --ai / --integration to choose a different agent.`,
      ),
    );
    return DEFAULT_INIT_INTEGRATION;
  }

  const choice = await p.select({
    message: "Choose your AI coding agent integration:",
    options: [
      ...AGENT_TARGET_OPTIONS.map((o) => ({
        value: o.id,
        label: o.label,
        hint: o.hint,
      })),
      {
        value: "none" as const,
        label: "None",
        hint: "Skip agent files — sdd agents install later",
      },
    ],
    initialValue: DEFAULT_INIT_INTEGRATION,
  });

  if (p.isCancel(choice)) {
    p.cancel("Operation cancelled");
    process.exit(0);
  }
  if (choice === "none") return false;
  return choice as AgentTarget;
}

export async function maybeConfirmNonEmpty(
  projectRoot: string,
  force: boolean,
  here: boolean,
): Promise<void> {
  if (force) return;
  let items: string[] = [];
  try {
    items = await readdir(projectRoot);
  } catch {
    return;
  }
  // Ignore nothing meaningful if only empty
  if (!items.length) return;

  // Already SDD — force required for re-init of scaffold is handled by core
  if (await isInitialized(projectRoot)) {
    if (!isInteractive()) {
      throw new Error(
        "Already initialized. Re-run with --force to re-copy defaults.",
      );
    }
    const again = await p.confirm({
      message: "SDD already initialized. Re-copy default workflows/templates?",
      initialValue: false,
    });
    if (p.isCancel(again) || !again) {
      p.cancel("Operation cancelled");
      process.exit(0);
    }
    return;
  }

  if (!here && items.length) {
    // Speckit: non-empty named dir without --force is error unless merge confirm
    if (!isInteractive()) {
      throw new Error(
        `Directory is not empty (${items.length} items). Use --force to merge.`,
      );
    }
    const proceed = await p.confirm({
      message: `Directory is not empty (${items.length} items). Merge SDD files into it?`,
      initialValue: false,
    });
    if (p.isCancel(proceed) || !proceed) {
      p.cancel("Operation cancelled");
      process.exit(0);
    }
  }
}

export async function checkAgentTool(
  target: AgentTarget,
  ignoreAgentTools: boolean,
): Promise<void> {
  if (ignoreAgentTools) return;
  const opt = optionForTarget(target);
  if (!opt?.requiresCli) return;

  // Claude Code binary is typically `claude`
  const bin = target === "claude-code" ? "claude" : opt.key;
  if (toolOnPath(bin)) return;

  if (!isInteractive()) {
    throw new Error(
      `${opt.label} CLI ('${bin}') not found. Install from ${opt.installUrl}\n` +
        `Tip: use --ignore-agent-tools to skip this check`,
    );
  }

  p.log.warn(`${opt.label} CLI ('${bin}') not found on PATH.`);
  p.log.message(`Install from: ${pc.cyan(opt.installUrl)}`);
  const cont = await p.confirm({
    message: "Continue without the agent CLI on PATH?",
    initialValue: false,
  });
  if (p.isCancel(cont) || !cont) {
    p.cancel(`Install ${bin} or re-run with --ignore-agent-tools`);
    process.exit(1);
  }
}

export async function runSpeckitStyleInit(args: InitCliArgs): Promise<void> {
  console.log("");
  p.intro(pc.bgCyan(pc.black(" sdd ")) + "  Structured Vibe Coding (Spec-Driven Development)");

  const { projectRoot, here } = await resolveProjectPath(args);
  const force = Boolean(args.force);

  await maybeConfirmNonEmpty(projectRoot, force, here);

  const selected = await selectIntegration(args);

  // Setup panel (Speckit-style summary)
  const lines = [
    `${pc.bold("Project")}     ${basename(projectRoot)}`,
    `${pc.bold("Path")}        ${pc.dim(projectRoot)}`,
    `${pc.bold("Mode")}        ${here ? "current directory (--here)" : "project path"}`,
    `${pc.bold("AI agent")}    ${
      selected === false
        ? pc.dim("none")
        : `${optionForTarget(selected)?.label ?? selected} ${pc.dim(`(${optionForTarget(selected)?.key ?? selected})`)}`
    }`,
  ];
  p.note(lines.join("\n"), "SDD project setup");

  if (selected !== false) {
    await checkAgentTool(selected, Boolean(args.ignoreAgentTools));
  }

  const s = p.spinner();

  s.start("Install shared infrastructure (.sdd, workflows, templates, memory)");
  const already = await isInitialized(projectRoot);
  const result = await initProject({
    projectRoot,
    force: force || already,
    agents: false, // install agents as separate Speckit-like step
  });
  s.stop("Shared infrastructure ready");

  let agentDetail = "skipped";
  if (selected !== false) {
    s.start(`Install ${optionForTarget(selected)?.label ?? selected} integration`);
    const ag = await installAgentIntegrations({
      projectRoot,
      targets: [selected],
      force: true,
    });
    s.stop(
      `AI integration: ${optionForTarget(selected)?.key ?? selected} (+${ag.created.length} files)`,
    );
    agentDetail = optionForTarget(selected)?.key ?? selected;
    result.agents = { created: ag.created, skipped: ag.skipped };
  } else {
    p.log.step("AI integration skipped");
  }

  const workflows = await listWorkflowNames(projectRoot);
  p.log.step(`Workflows: ${workflows.join(", ")}`);
  p.log.step(`Config: .sdd/config.yaml`);
  if (result.agents?.created.length) {
    p.log.step(
      `Agents: ${result.agents.created.slice(0, 5).join(", ")}${result.agents.created.length > 5 ? "…" : ""}`,
    );
  }

  const next = [
    `cd ${here ? "." : projectRoot}`,
    `sdd new "Your first change"`,
    `sdd status`,
  ];
  if (selected !== false) {
    next.push(`# agent: ${agentDetail} · playbook .sdd/protocol.md · context .sdd/active-context.md`);
  } else {
    next.push(`sdd agents install --ai copilot   # or --ai claude`);
  }

  p.outro(
    pc.green("Initialized") +
      "\n\n" +
      pc.dim("Next:") +
      "\n" +
      next.map((l) => `  ${l}`).join("\n"),
  );
}
