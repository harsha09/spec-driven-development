import { defineCommand, runMain } from "citty";
import { consola } from "consola";
import pc from "picocolors";
import {
  advanceStage,
  approveGate,
  buildContext,
  completeChange,
  createChange,
  formatStatus,
  getActiveChangeId,
  installAgentIntegration,
  isInitialized,
  listChanges,
  listWorkflowNames,
  loadConfig,
  loadWorkflow,
  recommendWorkflow,
  refreshActiveAgentContext,
  resolveChangeId,
  runLocalVerify,
  setActiveChange,
  skipStage,
  switchWorkflow,
  writeAgentHandoff,
} from "@structured-vibe-coding/core";
import { runSpeckitStyleInit, selectIntegration } from "./init-flow.js";
import { launchConfiguredAgent, reportAgentLaunch } from "./launch-agent.js";
import { projectRoot, withInitialized, withProject } from "./project.js";

/** Shared flag: skip launching the coding agent after a command. */
const noAgentArg = {
  type: "boolean" as const,
  description: "Do not launch the AI coding agent (or set SDD_NO_AGENT=1)",
  default: false,
};

const init = defineCommand({
  meta: {
    name: "init",
    description:
      "Initialize SDD + ONE AI agent. Example: sdd init --here --ai grok",
  },
  args: {
    path: {
      type: "positional",
      description: 'Project directory name, or "." for current dir (same as --here)',
      required: false,
    },
    here: {
      type: "boolean",
      description: "Use current directory (do not create a subfolder)",
      default: false,
    },
    force: {
      type: "boolean",
      description: "Re-init / merge into non-empty dir; rewrite agent stubs",
      default: false,
    },
    ai: {
      type: "string",
      description:
        "Install only this AI agent: grok | copilot | claude. Does NOT create other hosts' folders.",
      alias: "a",
    },
    integration: {
      type: "string",
      description: "Alias for --ai (Speckit-style)",
    },
    "no-agents": {
      type: "boolean",
      description: "Skip AI agent files (shared .sdd/memory/changes still created)",
      default: false,
    },
    "ignore-agent-tools": {
      type: "boolean",
      description: "Do not require agent CLI on PATH (e.g. claude)",
      default: false,
    },
  },
  async run({ args }) {
    try {
      await runSpeckitStyleInit({
        path: args.path,
        here: args.here,
        force: args.force,
        ai: args.ai,
        integration: args.integration,
        noAgents: args["no-agents"],
        ignoreAgentTools: args["ignore-agent-tools"],
      });
    } catch (err) {
      consola.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
  },
});

const newCmd = defineCommand({
  meta: {
    name: "new",
    description:
      "Start a change pack, refresh handoff, and launch the AI agent from init",
  },
  args: {
    title: { type: "positional", description: "Change title", required: false },
    workflow: { type: "string", description: "Workflow pack name (skip recommend)", alias: "w" },
    domain: { type: "string", description: "Optional domain id" },
    flag: {
      type: "string",
      description: "Set flag key=value (repeatable)",
      alias: "f",
    },
    yes: {
      type: "boolean",
      description: "Accept recommended workflow without prompt",
      alias: "y",
      default: false,
    },
    "no-agent": noAgentArg,
  },
  async run({ args }) {
    await withProject(async ({ root, config }) => {
      let title = args.title?.trim();
      if (!title) {
        title = await consola.prompt("Change title:", { type: "text" });
        if (!title || typeof title !== "string") {
          consola.error("Title is required");
          process.exit(1);
        }
      }

      const flags: Record<string, boolean | string | number> = {};
      const flagArg = args.flag;
      const flagList = flagArg == null ? [] : Array.isArray(flagArg) ? flagArg : [flagArg];
      for (const raw of flagList) {
        const [k, ...rest] = String(raw).split("=");
        if (!k) continue;
        const v = rest.join("=");
        if (v === "true" || v === "") flags[k] = true;
        else if (v === "false") flags[k] = false;
        else if (v && !Number.isNaN(Number(v))) flags[k] = Number(v);
        else flags[k] = v || true;
      }

      const rec = await recommendWorkflow(root, title, config, {
        preferred: args.workflow,
      });

      let workflowName = rec.name;
      if (!args.workflow && !args.yes) {
        consola.log("");
        consola.log(
          `${pc.bold("Recommended:")} ${pc.green(rec.name)} ${pc.dim(`(${rec.reason})`)}`,
        );
        if (rec.alternatives.length) {
          consola.log(`${pc.dim("Alternatives:")} ${rec.alternatives.join(", ")}`);
        }
        const choice = await consola.prompt("Use this workflow?", {
          type: "confirm",
          initial: true,
        });
        if (choice === false) {
          const names = await listWorkflowNames(root);
          const picked = await consola.prompt("Pick workflow:", {
            type: "select",
            options: names,
          });
          if (typeof picked !== "string") {
            consola.error("Cancelled");
            process.exit(1);
          }
          workflowName = picked;
        }
      } else if (!args.workflow) {
        consola.info(`Using recommended workflow: ${rec.name} (${rec.reason})`);
      }

      const ctx = await createChange({
        projectRoot: root,
        config,
        title,
        workflowName,
        domain: args.domain,
        flags,
      });

      consola.success(`Created change ${pc.cyan(ctx.id)}`);
      consola.log(`Workflow: ${ctx.meta.workflow}`);
      consola.log(`Stage:    ${ctx.meta.stage}`);
      consola.log(`Path:     ${ctx.path}`);
      consola.log("");
      consola.log(formatStatus(ctx));
      consola.log("");

      const launch = await launchConfiguredAgent({
        projectRoot: root,
        config,
        ctx,
        noAgent: args["no-agent"],
        event: `new change · stage ${ctx.meta.stage}`,
      });
      await reportAgentLaunch(launch);
    });
  },
});

const status = defineCommand({
  meta: {
    name: "status",
    description: "Show active change status, refresh handoff, launch AI agent",
  },
  args: {
    change: { type: "string", description: "Change id", alias: "c" },
    list: { type: "boolean", description: "List all open changes", default: false },
    "no-agent": noAgentArg,
  },
  async run({ args }) {
    await withProject(async ({ root, config }) => {
      if (args.list) {
        const ids = await listChanges(root, config);
        if (!ids.length) {
          consola.info("No open changes.");
          return;
        }
        for (const id of ids) {
          try {
            const ctx = await buildContext(root, config, id);
            consola.log(
              `${ctx.meta.status === "in_progress" ? pc.green("●") : "○"} ${id}  ${pc.dim(ctx.meta.workflow)}  ${ctx.meta.stage}`,
            );
          } catch (err) {
            consola.log(
              `${pc.red("!")} ${id}  ${pc.dim(err instanceof Error ? err.message : String(err))}`,
            );
          }
        }
        return;
      }
      const id = await resolveChangeId(root, config, args.change);
      const ctx = await buildContext(root, config, id);
      consola.log(formatStatus(ctx));
      consola.log("");
      const launch = await launchConfiguredAgent({
        projectRoot: root,
        config,
        ctx,
        noAgent: args["no-agent"],
        event: `status · stage ${ctx.meta.stage}`,
      });
      await reportAgentLaunch(launch);
    });
  },
});

const next = defineCommand({
  meta: {
    name: "next",
    description: "Advance stage, then launch the AI agent for the new stage",
  },
  args: {
    change: { type: "string", description: "Change id", alias: "c" },
    force: { type: "boolean", description: "Skip gate/artifact checks", default: false },
    "no-agent": noAgentArg,
  },
  async run({ args }) {
    await withProject(async ({ root, config }) => {
      const id = await resolveChangeId(root, config, args.change);
      const result = await advanceStage(root, config, id, { force: args.force });
      for (const w of result.warnings) consola.warn(w);
      if (result.to) {
        consola.success(`${result.from} → ${result.to}`);
        if (result.artifactsCreated.length) {
          consola.info(`Artifacts: ${result.artifactsCreated.join(", ")}`);
        }
      } else {
        consola.info("Already on the last stage (or no next stage).");
      }
      consola.log("");
      consola.log(formatStatus(result.ctx));
      consola.log("");
      const launch = await launchConfiguredAgent({
        projectRoot: root,
        config,
        ctx: result.ctx,
        noAgent: args["no-agent"],
        event: result.to
          ? `advanced ${result.from} → ${result.to}`
          : `on last stage ${result.ctx.meta.stage}`,
      });
      await reportAgentLaunch(launch);
    });
  },
});

const skip = defineCommand({
  meta: {
    name: "skip",
    description: "Skip a stage, then launch the AI agent",
  },
  args: {
    stage: { type: "positional", description: "Stage id to skip", required: true },
    reason: { type: "string", description: "Why this stage is skipped", alias: "r", required: true },
    change: { type: "string", description: "Change id", alias: "c" },
    "no-agent": noAgentArg,
  },
  async run({ args }) {
    await withProject(async ({ root, config }) => {
      const id = await resolveChangeId(root, config, args.change);
      const ctx = await skipStage(root, config, id, args.stage, args.reason);
      consola.success(`Skipped stage ${args.stage}`);
      consola.log(formatStatus(ctx));
      consola.log("");
      const launch = await launchConfiguredAgent({
        projectRoot: root,
        config,
        ctx,
        noAgent: args["no-agent"],
        event: `skipped ${args.stage} · now ${ctx.meta.stage}`,
      });
      await reportAgentLaunch(launch);
    });
  },
});

const use = defineCommand({
  meta: {
    name: "use",
    description: "Switch workflow for this change, then launch the AI agent",
  },
  args: {
    workflow: { type: "positional", description: "Workflow name", required: true },
    reason: { type: "string", description: "Why switching", alias: "r" },
    change: { type: "string", description: "Change id", alias: "c" },
    "no-agent": noAgentArg,
  },
  async run({ args }) {
    await withProject(async ({ root, config }) => {
      const id = await resolveChangeId(root, config, args.change);
      const ctx = await switchWorkflow(root, config, id, args.workflow, args.reason);
      consola.success(`Workflow set to ${args.workflow}`);
      consola.log(formatStatus(ctx));
      consola.log("");
      const launch = await launchConfiguredAgent({
        projectRoot: root,
        config,
        ctx,
        noAgent: args["no-agent"],
        event: `workflow → ${args.workflow} · stage ${ctx.meta.stage}`,
      });
      await reportAgentLaunch(launch);
    });
  },
});

const gate = defineCommand({
  meta: {
    name: "gate",
    description: "Approve/waive/fail a gate, then launch the AI agent",
  },
  args: {
    action: {
      type: "positional",
      description: "approve | waive | fail",
      required: true,
    },
    stage: { type: "string", description: "Stage id (default: current)", alias: "s" },
    note: { type: "string", description: "Note", alias: "n" },
    change: { type: "string", description: "Change id", alias: "c" },
    "no-agent": noAgentArg,
  },
  async run({ args }) {
    await withProject(async ({ root, config }) => {
      const action = args.action;
      if (!["approve", "waive", "fail"].includes(action)) {
        throw new Error("action must be approve | waive | fail");
      }
      const statusMap = {
        approve: "approved",
        waive: "waived",
        fail: "failed",
      } as const;
      const id = await resolveChangeId(root, config, args.change);
      const ctx = await approveGate(
        root,
        config,
        id,
        args.stage,
        args.note,
        statusMap[action as keyof typeof statusMap],
      );
      consola.success(`Gate ${action}d on ${args.stage ?? ctx.meta.stage}`);
      consola.log(formatStatus(ctx));
      consola.log("");
      const launch = await launchConfiguredAgent({
        projectRoot: root,
        config,
        ctx,
        noAgent: args["no-agent"],
        event: `gate ${action} on ${args.stage ?? ctx.meta.stage}`,
      });
      await reportAgentLaunch(launch);
    });
  },
});

const verify = defineCommand({
  meta: {
    name: "verify",
    description: "Run local verify, then launch the AI agent with results context",
  },
  args: {
    change: { type: "string", description: "Change id", alias: "c" },
    "no-run": {
      type: "boolean",
      description: "Only write checklist/evidence stubs, do not run commands",
      default: false,
    },
    "no-agent": noAgentArg,
  },
  async run({ args }) {
    await withProject(async ({ root, config }) => {
      const id = await resolveChangeId(root, config, args.change);
      const result = await runLocalVerify(root, config, id, {
        runCommands: !args["no-run"],
      });
      consola.success(`Local verify for stage: ${result.stageId}`);
      if (result.results.length) {
        for (const r of result.results) {
          const ok = r.exitCode === 0;
          consola.log(
            `  ${ok ? pc.green("✓") : pc.red("✗")} ${r.name} ${pc.dim(`(exit ${r.exitCode})`)}`,
          );
        }
      } else {
        consola.info("No commands configured — complete checklist in local-test-results.md");
      }
      if (result.checklist.length) {
        consola.log(pc.dim("Checklist:"));
        for (const item of result.checklist) consola.log(`  - [ ] ${item}`);
      }
      consola.info(`Evidence: ${result.evidencePath}`);
      if (!result.ok) {
        consola.warn("Verify did not pass (required commands failed or were skipped).");
        consola.log(
          pc.dim("Fix commands, re-run sdd verify, or sdd gate approve/waive to override."),
        );
        process.exitCode = 1;
      }
      consola.log("");
      const ctx = await buildContext(root, config, id);
      const launch = await launchConfiguredAgent({
        projectRoot: root,
        config,
        ctx,
        noAgent: args["no-agent"],
        event: `local verify ${result.ok ? "passed" : "failed"} · stage ${result.stageId}`,
      });
      await reportAgentLaunch(launch);
    });
  },
});

const complete = defineCommand({
  meta: {
    name: "complete",
    description: "Complete and archive the change, then notify/launch the AI agent",
  },
  args: {
    change: { type: "string", description: "Change id", alias: "c" },
    "no-agent": noAgentArg,
  },
  async run({ args }) {
    await withProject(async ({ root, config }) => {
      const id = await resolveChangeId(root, config, args.change);
      // Handoff while change still under changes/
      const before = await buildContext(root, config, id);
      await writeAgentHandoff(root, config, id);
      const { archivedTo, ctx } = await completeChange(root, config, id);
      consola.success(`Completed ${ctx.id}`);
      if (archivedTo) consola.info(`Archived to ${archivedTo}`);
      if (ctx.workflow.on_complete?.domain_sync === "recommend") {
        consola.log(
          pc.dim(
            "Tip: consider folding stable design notes into domains/ if this domain is anchored.",
          ),
        );
      }
      consola.log("");
      const launch = await launchConfiguredAgent({
        projectRoot: root,
        config,
        ctx: before,
        changeId: before.id,
        noAgent: args["no-agent"],
        event: `change completed${archivedTo ? " and archived" : ""}`,
        reuseHandoff: true,
      });
      await reportAgentLaunch(launch);
    });
  },
});

const workflows = defineCommand({
  meta: { name: "workflows", description: "List available workflow packs (no agent launch)" },
  async run() {
    await withProject(async ({ root }) => {
      const names = await listWorkflowNames(root);
      for (const name of names) {
        const wf = await loadWorkflow(root, name);
        consola.log(
          `${pc.cyan(name)}  ${pc.dim(wf.description ?? "")}  ${pc.dim(`(${wf.stages.length} stages)`)}`,
        );
      }
    });
  },
});

const agent = defineCommand({
  meta: {
    name: "agent",
    description: "Refresh handoff and launch the configured AI agent (or --print only)",
  },
  args: {
    change: { type: "string", description: "Change id", alias: "c" },
    print: {
      type: "boolean",
      description: "Only write/print handoff — do not launch agent",
      default: false,
    },
    "no-agent": noAgentArg,
  },
  async run({ args }) {
    await withProject(async ({ root, config }) => {
      const id = await resolveChangeId(root, config, args.change);
      const ctx = await buildContext(root, config, id);
      if (args.print || args["no-agent"]) {
        await refreshActiveAgentContext(root);
        const path = await writeAgentHandoff(root, config, id);
        const body = await import("node:fs/promises").then((fs) => fs.readFile(path, "utf8"));
        process.stdout.write(body);
        if (!body.endsWith("\n")) process.stdout.write("\n");
        consola.info(pc.dim(`Written to ${path}`));
        return;
      }
      const launch = await launchConfiguredAgent({
        projectRoot: root,
        config,
        ctx,
        event: `explicit sdd agent · stage ${ctx.meta.stage}`,
      });
      await reportAgentLaunch(launch);
    });
  },
});

const agentsInstall = defineCommand({
  meta: {
    name: "install",
    description:
      "Install or switch AI agent files for ONE host. Example: sdd agents install --ai grok --force",
  },
  args: {
    target: {
      type: "string",
      description: "Alias of --ai: grok | copilot | claude",
      alias: "t",
    },
    ai: {
      type: "string",
      description: "AI agent to install: grok | copilot | claude (only this host)",
      alias: "a",
    },
    integration: {
      type: "string",
      description: "Alias for --ai",
    },
    force: {
      type: "boolean",
      description: "Overwrite stubs for the selected agent",
      default: false,
    },
  },
  async run({ args }) {
    await withInitialized(async (root) => {
      const selected = await selectIntegration({
        ai: args.ai ?? args.target,
        integration: args.integration,
        requireAgent: true,
      });
      if (selected === false) {
        consola.info("No AI coding agent selected — nothing installed.");
        return;
      }
      const result = await installAgentIntegration({
        projectRoot: root,
        target: selected,
        force: args.force,
      });
      consola.success(`Installed AI integration: ${result.target}`);
      for (const f of result.created) consola.log(`  + ${f}`);
      for (const f of result.skipped) consola.log(pc.dim(`  = ${f} (exists, use --force)`));
    });
  },
});

const agentsRefresh = defineCommand({
  meta: {
    name: "refresh",
    description: "Refresh active-context + handoff and launch the AI agent",
  },
  args: {
    "no-agent": noAgentArg,
  },
  async run({ args }) {
    await withProject(async ({ root, config }) => {
      const path = await refreshActiveAgentContext(root);
      consola.success(path ? `Updated ${path}` : "SDD not ready");
      const launch = await launchConfiguredAgent({
        projectRoot: root,
        config,
        noAgent: args["no-agent"],
        event: "agents refresh",
      });
      await reportAgentLaunch(launch);
    });
  },
});

const agents = defineCommand({
  meta: {
    name: "agents",
    description: "Manage AI coding-agent integrations (copilot | claude | grok)",
  },
  subCommands: {
    install: agentsInstall,
    refresh: agentsRefresh,
  },
});

const useChange = defineCommand({
  meta: {
    name: "checkout",
    description: "Set the active change, then launch the AI agent",
  },
  args: {
    change: { type: "positional", description: "Change id", required: true },
    "no-agent": noAgentArg,
  },
  async run({ args }) {
    await withProject(async ({ root, config }) => {
      const ctx = await buildContext(root, config, args.change);
      await setActiveChange(root, config, args.change);
      consola.success(`Active change: ${args.change}`);
      consola.log("");
      const launch = await launchConfiguredAgent({
        projectRoot: root,
        config,
        ctx,
        noAgent: args["no-agent"],
        event: `checkout ${args.change}`,
      });
      await reportAgentLaunch(launch);
    });
  },
});

const help = defineCommand({
  meta: { name: "help", description: "Show help overview" },
  async run() {
    const root = projectRoot();
    consola.log(pc.bold("sdd") + " — local Spec-Driven Development + your AI coding agent");
    consola.log("");
    consola.log(pc.bold("Idea:"));
    consola.log(pc.dim("  Process commands update the change pack, then hand work to the agent"));
    consola.log(pc.dim("  configured at init (grok/claude CLI, or Copilot chat in the IDE)."));
    consola.log("");
    consola.log(pc.bold("Setup (once):"));
    consola.log(`  ${pc.cyan("sdd init --here --ai grok")}     Grok Build only`);
    consola.log(`  ${pc.cyan("sdd init --here --ai copilot")}  GitHub Copilot only`);
    consola.log(`  ${pc.cyan("sdd init --here --ai claude")}   Claude Code only`);
    consola.log("");
    consola.log(pc.bold("Everyday (each launches the agent unless --no-agent):"));
    consola.log(`  ${pc.cyan('sdd new "My change"')}   create pack + agent`);
    consola.log(`  ${pc.cyan("sdd status")}            status + agent`);
    consola.log(`  ${pc.cyan("sdd next")}              next stage + agent`);
    consola.log(`  ${pc.cyan("sdd verify")}            verify + agent`);
    consola.log(`  ${pc.cyan("sdd complete")}          archive + agent`);
    consola.log(`  ${pc.cyan("sdd agent")}             handoff + agent`);
    consola.log("");
    consola.log(pc.bold("Skip agent launch:"));
    consola.log(`  ${pc.cyan("sdd next --no-agent")}   or  ${pc.cyan("SDD_NO_AGENT=1 sdd next")}`);
    consola.log("");
    consola.log(pc.dim("Docs: docs/ide-and-agents.md · sdd <command> --help"));
    if (await isInitialized(root)) {
      const config = await loadConfig(root);
      const active = await getActiveChangeId(root, config);
      if (active) consola.log(pc.dim(`Active change: ${active}`));
    } else {
      consola.log(pc.dim("Not initialized. Run: sdd init --here --ai grok"));
    }
  },
});

const main = defineCommand({
  meta: {
    name: "sdd",
    description:
      "Local SDD: process + launch your init-configured AI agent after each command",
    version: "0.6.1",
  },
  subCommands: {
    init,
    new: newCmd,
    status,
    next,
    skip,
    use,
    gate,
    verify,
    complete,
    workflows,
    agent,
    agents,
    checkout: useChange,
    help,
  },
});

await runMain(main);
