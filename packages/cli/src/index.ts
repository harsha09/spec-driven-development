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
  loadInstalledAgent,
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
import { launchAgentAfterNew } from "./launch-agent.js";
import { projectRoot, withInitialized, withProject } from "./project.js";

const init = defineCommand({
  meta: {
    name: "init",
    description:
      "Initialize SDD in a project and install ONE AI coding agent (default step: pick agent). Example: sdd init --here --ai grok",
  },
  args: {
    path: {
      type: "positional",
      description: "Project directory name, or \".\" for current dir (same as --here)",
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
        "Install only this AI agent: grok | copilot | claude. Does NOT create the other hosts' folders.",
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
      "Start a new change, write agent handoff, and launch the AI agent from init (use --no-agent to skip)",
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
    "no-agent": {
      type: "boolean",
      description: "Do not launch the AI coding agent after creating the change",
      default: false,
    },
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

      // Launch AI agent configured at sdd init (from .sdd/agents.json)
      const launch = await launchAgentAfterNew({
        projectRoot: root,
        config,
        ctx,
        noAgent: args["no-agent"],
      });
      consola.log("");
      consola.info(`Handoff: ${launch.handoffPath}`);
      if (launch.launched) {
        consola.success(
          `Started ${launch.target} (${(launch.command ?? []).join(" ")})`,
        );
      } else {
        const installed = await loadInstalledAgent(root);
        const label = installed?.integration.label ?? "AI agent";
        consola.info(
          pc.dim(
            launch.reason ??
              `${label}: open the tool in this project and read .sdd/handoff.md`,
          ),
        );
        if (launch.target === "grok") {
          consola.log(pc.dim("  Or: open Grok Build here — it loads AGENTS.md + .grok/rules/sdd.md"));
        }
      }
      consola.log("");
      consola.log(pc.dim("After the agent fills this stage: sdd next · sdd status · sdd verify"));
    });
  },
});

const status = defineCommand({
  meta: { name: "status", description: "Show active change and stage progress" },
  args: {
    change: { type: "string", description: "Change id", alias: "c" },
    list: { type: "boolean", description: "List all open changes", default: false },
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
    });
  },
});

const next = defineCommand({
  meta: { name: "next", description: "Advance to the next workflow stage" },
  args: {
    change: { type: "string", description: "Change id", alias: "c" },
    force: { type: "boolean", description: "Skip gate/artifact checks", default: false },
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
    });
  },
});

const skip = defineCommand({
  meta: { name: "skip", description: "Skip a stage for this change (per-PR override)" },
  args: {
    stage: { type: "positional", description: "Stage id to skip", required: true },
    reason: { type: "string", description: "Why this stage is skipped", alias: "r", required: true },
    change: { type: "string", description: "Change id", alias: "c" },
  },
  async run({ args }) {
    await withProject(async ({ root, config }) => {
      const id = await resolveChangeId(root, config, args.change);
      const ctx = await skipStage(root, config, id, args.stage, args.reason);
      consola.success(`Skipped stage ${args.stage}`);
      consola.log(formatStatus(ctx));
    });
  },
});

const use = defineCommand({
  meta: {
    name: "use",
    description: "Switch workflow for this change (per-PR)",
  },
  args: {
    workflow: { type: "positional", description: "Workflow name", required: true },
    reason: { type: "string", description: "Why switching", alias: "r" },
    change: { type: "string", description: "Change id", alias: "c" },
  },
  async run({ args }) {
    await withProject(async ({ root, config }) => {
      const id = await resolveChangeId(root, config, args.change);
      const ctx = await switchWorkflow(root, config, id, args.workflow, args.reason);
      consola.success(`Workflow set to ${args.workflow}`);
      consola.log(formatStatus(ctx));
    });
  },
});

const gate = defineCommand({
  meta: { name: "gate", description: "Approve / waive / fail a stage gate" },
  args: {
    action: {
      type: "positional",
      description: "approve | waive | fail",
      required: true,
    },
    stage: { type: "string", description: "Stage id (default: current)", alias: "s" },
    note: { type: "string", description: "Note", alias: "n" },
    change: { type: "string", description: "Change id", alias: "c" },
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
    });
  },
});

const verify = defineCommand({
  meta: { name: "verify", description: "Run local verification for the current stage" },
  args: {
    change: { type: "string", description: "Change id", alias: "c" },
    "no-run": {
      type: "boolean",
      description: "Only write checklist/evidence stubs, do not run commands",
      default: false,
    },
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
      } else {
        consola.log(pc.dim("When satisfied: sdd gate approve && sdd next (or sdd complete)"));
      }
    });
  },
});

const complete = defineCommand({
  meta: { name: "complete", description: "Complete the change and archive it" },
  args: {
    change: { type: "string", description: "Change id", alias: "c" },
  },
  async run({ args }) {
    await withProject(async ({ root, config }) => {
      const id = await resolveChangeId(root, config, args.change);
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
    });
  },
});

const workflows = defineCommand({
  meta: { name: "workflows", description: "List available workflow packs" },
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
    description:
      "Write .sdd/handoff.md and print it (does not launch the AI — use sdd new for auto-launch)",
  },
  args: {
    change: { type: "string", description: "Change id", alias: "c" },
  },
  async run({ args }) {
    await withProject(async ({ root, config }) => {
      const id = await resolveChangeId(root, config, args.change);
      await refreshActiveAgentContext(root);
      const path = await writeAgentHandoff(root, config, id);
      const body = await import("node:fs/promises").then((fs) =>
        fs.readFile(path, "utf8"),
      );
      process.stdout.write(body);
      if (!body.endsWith("\n")) process.stdout.write("\n");
      consola.info(pc.dim(`Also written to ${path}`));
    });
  },
});

const agentsInstall = defineCommand({
  meta: {
    name: "install",
    description:
      "Install or switch AI agent files for ONE host (removes other hosts' agent dirs). Example: sdd agents install --ai grok --force",
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
    description: "Refresh .sdd/active-context.md for coding agents (Copilot / Claude / Grok)",
  },
  async run() {
    await withInitialized(async (root) => {
      const path = await refreshActiveAgentContext(root);
      consola.success(path ? `Updated ${path}` : "SDD not ready");
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
  meta: { name: "checkout", description: "Set the active change" },
  args: {
    change: { type: "positional", description: "Change id", required: true },
  },
  async run({ args }) {
    await withProject(async ({ root, config }) => {
      await buildContext(root, config, args.change);
      await setActiveChange(root, config, args.change);
      consola.success(`Active change: ${args.change}`);
    });
  },
});

const help = defineCommand({
  meta: { name: "help", description: "Show help overview" },
  async run() {
    const root = projectRoot();
    consola.log(pc.bold("sdd") + " — local Spec-Driven Development (change packs + gates)");
    consola.log("");
    consola.log(pc.bold("First-time setup (one command):"));
    consola.log(`  ${pc.cyan("sdd init --here --ai grok")}     Grok Build only`);
    consola.log(`  ${pc.cyan("sdd init --here --ai copilot")}  GitHub Copilot only`);
    consola.log(`  ${pc.cyan("sdd init --here --ai claude")}   Claude Code only`);
    consola.log(pc.dim("  → creates .sdd/, memory/, changes/, archive/, domains/"));
    consola.log(pc.dim("  → plus agent files for the chosen AI only (not all hosts)"));
    consola.log("");
    consola.log(pc.bold("Everyday:"));
    consola.log(`  ${pc.cyan('sdd new "My change"')}   create change + launch AI from init`);
    consola.log(`  ${pc.cyan('sdd new "…" --no-agent')}  create change without launching AI`);
    consola.log(`  ${pc.cyan("sdd status")}            show stage`);
    consola.log(`  ${pc.cyan("sdd next")}              advance stage`);
    consola.log(`  ${pc.cyan("sdd verify")}            local verify`);
    consola.log(`  ${pc.cyan("sdd complete")}          archive change`);
    consola.log("");
    consola.log(pc.bold("Agents:"));
    consola.log(`  ${pc.cyan("sdd agents install --ai grok")}   switch AI host (optional later)`);
    consola.log(`  ${pc.cyan("sdd agents refresh")}             update .sdd/active-context.md`);
    consola.log(`  ${pc.cyan("sdd agent")}                      write/print .sdd/handoff.md only`);
    consola.log("");
    consola.log(pc.dim("Docs: https://github.com/structured-vibe-coding/spec-driven-development/blob/main/docs/README.md"));
    consola.log(pc.dim("More: sdd <command> --help"));
    if (await isInitialized(root)) {
      const config = await loadConfig(root);
      const active = await getActiveChangeId(root, config);
      if (active) consola.log(pc.dim(`Active change: ${active}`));
    } else {
      consola.log(pc.dim("This directory is not initialized. Run: sdd init --here --ai grok"));
    }
  },
});

const main = defineCommand({
  meta: {
    name: "sdd",
    description:
      "Local Spec-Driven Development. Start with: sdd init --here --ai grok|copilot|claude",
    version: "0.5.4",
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
