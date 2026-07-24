/**
 * Speckit-style init UX: project path, single AI integration, steps, tool check.
 */
import { mkdir, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve, basename, isAbsolute } from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import {
  AGENT_TARGET_OPTIONS,
  DEFAULT_INIT_INTEGRATION,
  getIntegration,
  initProject,
  installAgentIntegration,
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
async function resolveProjectPath(args: InitCliArgs): Promise<{
  projectRoot: string;
  here: boolean;
}> {
  const hereFlag = Boolean(args.here);
  const name = args.path?.trim();

  if (hereFlag || name === "." || name === "./") {
    return { projectRoot: process.cwd(), here: true };
  }

  if (name) {
    const projectRoot = isAbsolute(name) ? name : resolve(process.cwd(), name);
    await mkdir(projectRoot, { recursive: true });
    return { projectRoot, here: false };
  }

  if (!isInteractive()) {
    throw new Error(
      "Provide a project path, use --here for the current directory, or run interactively.",
    );
  }

  const mode = await p.select({
    message: "Where should SDD be initialized?",
    options: [
      { value: "here", label: "Current directory", hint: process.cwd() },
      { value: "new", label: "New subdirectory", hint: "create a folder" },
    ],
  });
  if (p.isCancel(mode)) {
    p.cancel("Operation cancelled");
    process.exit(0);
  }
  if (mode === "here") {
    return { projectRoot: process.cwd(), here: true };
  }
  const folder = await p.text({
    message: "Project directory name:",
    placeholder: "my-app",
    validate: (v) => (!v?.trim() ? "Name is required" : undefined),
  });
  if (p.isCancel(folder) || !folder?.trim()) {
    p.cancel("Operation cancelled");
    process.exit(0);
  }
  const projectRoot = resolve(process.cwd(), folder.trim());
  await mkdir(projectRoot, { recursive: true });
  return { projectRoot, here: false };
}

/**
 * Speckit-style single AI integration pick.
 * Always returns an agent target (required for init and agents install).
 */
export async function selectIntegration(opts: {
  ai?: string;
  integration?: string;
}): Promise<AgentTarget> {
  const raw = opts.ai ?? opts.integration;
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

  const options = AGENT_TARGET_OPTIONS.map((o) => ({
    value: o.id as AgentTarget,
    label: o.label,
    hint: o.hint,
  }));

  const choice = await p.select({
    message: "Choose your AI coding agent integration:",
    options,
    initialValue: DEFAULT_INIT_INTEGRATION,
  });

  if (p.isCancel(choice)) {
    p.cancel("Operation cancelled");
    process.exit(0);
  }
  return choice as AgentTarget;
}

async function maybeConfirmNonEmpty(
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
  if (!items.length) return;

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

async function checkAgentTool(
  target: AgentTarget,
  ignoreAgentTools: boolean,
): Promise<void> {
  if (ignoreAgentTools) return;
  const integ = getIntegration(target);
  if (!integ.requiresCli) return;

  const bin = integ.cliBinary ?? integ.key;
  if (toolOnPath(bin)) return;

  if (!isInteractive()) {
    throw new Error(
      `${integ.label} CLI ('${bin}') not found. Install from ${integ.installUrl}\n` +
        `Tip: use --ignore-agent-tools to skip this check`,
    );
  }

  p.log.warn(`${integ.label} CLI ('${bin}') not found on PATH.`);
  p.log.message(`Install from: ${pc.cyan(integ.installUrl)}`);
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

  const selected = await selectIntegration({
    ai: args.ai,
    integration: args.integration,
  });

  const agentLabel = `${optionForTarget(selected)?.label ?? selected} ${pc.dim(`(${optionForTarget(selected)?.key ?? selected})`)}`;

  p.note(
    [
      `${pc.bold("Project")}     ${basename(projectRoot)}`,
      `${pc.bold("Path")}        ${pc.dim(projectRoot)}`,
      `${pc.bold("Mode")}        ${here ? "current directory (--here)" : "project path"}`,
      `${pc.bold("AI agent")}    ${agentLabel}`,
    ].join("\n"),
    "SDD project setup",
  );

  await checkAgentTool(selected, Boolean(args.ignoreAgentTools));

  const s = p.spinner();

  s.start("Install shared infrastructure (.sdd, workflows, templates, memory)");
  const already = await isInitialized(projectRoot);
  const result = await initProject({
    projectRoot,
    force: force || already,
    agents: false,
  });
  s.stop("Shared infrastructure ready");

  s.start(`Install ${optionForTarget(selected)?.label ?? selected} integration`);
  const ag = await installAgentIntegration({
    projectRoot,
    target: selected,
    force: true,
  });
  s.stop(
    `AI integration: ${optionForTarget(selected)?.key ?? selected} (+${ag.created.length} files)`,
  );
  const agentDetail = optionForTarget(selected)?.key ?? selected;
  result.agents = { created: ag.created, skipped: ag.skipped };

  const workflows = await listWorkflowNames(projectRoot);
  p.log.step(`Workflows: ${workflows.join(", ")}`);
  p.log.step(`Config: .sdd/config.yaml`);
  if (result.agents?.created.length) {
    p.log.step(
      `Agent files (${agentDetail}): ${result.agents.created.slice(0, 8).join(", ")}${result.agents.created.length > 8 ? "…" : ""}`,
    );
  }

  p.note(
    [
      pc.bold("Always created (shared SDD):"),
      `  .sdd/   memory/   changes/   domains/`,
      "",
      pc.bold("AI agent (selected host):"),
      selected === "grok"
        ? `  .grok/rules/sdd.md  +  AGENTS.md  +  .sdd/protocol.md`
        : selected === "claude-code"
          ? `  .claude/agents/*.md  +  AGENTS.md  +  .sdd/protocol.md`
          : `  .github/agents/*.agent.md  +  AGENTS.md  +  .sdd/protocol.md`,
      "",
      pc.dim("Other hosts are removed when you pick one AI."),
    ].join("\n"),
    "What was installed",
  );

  const next = [
    here ? `# already in project` : `cd ${projectRoot}`,
    `sdd new "Your first change"`,
    `sdd status`,
    `# agent: ${agentDetail} · read .sdd/active-context.md then .sdd/protocol.md`,
  ];

  p.outro(
    pc.green("Initialized") +
      ` · AI agent: ${pc.cyan(agentDetail)} only\n\n` +
      pc.dim("Next:\n") +
      next.map((l) => `  ${l}`).join("\n"),
  );
}
