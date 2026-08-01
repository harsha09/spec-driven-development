import { defineCommand, runMain } from "citty";
import { join } from "node:path";
import { consola } from "consola";
import pc from "picocolors";
import {
  advanceStage,
  approveGate,
  buildContext,
  buildRefinePlan,
  changePath,
  completeChange,
  createChange,
  formatJsonSummary,
  formatStatus,
  generateCodeContext,
  getActiveChangeId,
  getStage,
  installAgentIntegration,
  isInitialized,
  listBacklogFeatures,
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
  startFeatureFromBacklog,
  startGreenfield,
  switchWorkflow,
  writeAgentHandoff,
  writeRefineBrief,
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
        "Install only this AI agent: grok | copilot | claude | ollama. Does NOT create other hosts' folders.",
      alias: "a",
    },
    integration: {
      type: "string",
      description: "Alias for --ai (Speckit-style)",
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

      const stage = getStage(ctx.workflow, ctx.meta, ctx.meta.stage);
      const firstArt =
        stage?.artifacts.find((a) => a.required) ?? stage?.artifacts[0];
      if (firstArt) {
        const artPath = join(ctx.path, firstArt.path);
        consola.log(pc.bold("Next steps:"));
        consola.log(`  1. Open ${pc.cyan(artPath)}`);
        consola.log(
          `  2. Replace the template with real sentences (what’s wrong, what you’ll do, how you’ll know it worked)`,
        );
        consola.log(`  3. Run ${pc.cyan("sdd next")}  (or ${pc.cyan("sdd agent")} to draft with AI)`);
        consola.log("");
        consola.log(pc.dim("Example intent/feature body:"));
        consola.log(
          pc.dim(
            "  Empty list crashes the expenses page. Show an empty state instead of throwing.",
          ),
        );
        consola.log(
          pc.dim(
            "  Success: open expenses with zero rows — no error, empty state visible.",
          ),
        );
        consola.log("");
      }

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
    description: "Show active change status (does not launch the AI agent)",
  },
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
      consola.log("");
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
      description: "Only write checklist/results stubs, do not run commands",
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
      if (result.evidencePath) {
        consola.info(`Evidence: ${result.evidencePath}`);
      } else {
        consola.info(
          `Results: ${join(root, config.changes_path, id, "local-test-results.md")}`,
        );
      }
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
    description: "Complete the change, then notify/launch the AI agent",
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
      const { archivedTo, ctx, promoted } = await completeChange(root, config, id);
      consola.success(`Completed ${ctx.id}`);
      if (archivedTo) consola.info(`Archived to ${archivedTo}`);
      if (promoted?.length) {
        consola.success(`Promoted greenfield → memory: ${promoted.join(", ")}`);
        consola.log(
          pc.dim(
            'Next: sdd feature list · sdd feature start F-001  (implement backlog items)',
          ),
        );
      }
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
        event: `change completed${archivedTo ? " and archived" : ""}${promoted?.length ? " · greenfield promoted" : ""}`,
        reuseHandoff: true,
      });
      await reportAgentLaunch(launch);
    });
  },
});

const greenfield = defineCommand({
  meta: {
    name: "greenfield",
    description:
      'Bootstrap a new product from a one-line idea (vision → requirements → features → architecture)',
  },
  args: {
    idea: {
      type: "positional",
      description: 'One-line product idea, e.g. "Team expense tracker for remote startups"',
      required: false,
    },
    "no-agent": noAgentArg,
  },
  async run({ args }) {
    await withProject(async ({ root, config }) => {
      let idea = args.idea?.trim();
      if (!idea) {
        idea = await consola.prompt("One-line product idea:", { type: "text" });
        if (!idea || typeof idea !== "string") {
          consola.error("Idea is required");
          process.exit(1);
        }
      }

      const { ctx, visionPath } = await startGreenfield({
        projectRoot: root,
        config,
        idea,
      });

      consola.success(`Started greenfield ${pc.cyan(ctx.id)}`);
      consola.log(`Workflow: ${ctx.meta.workflow}`);
      consola.log(`Stage:    ${ctx.meta.stage}`);
      consola.log(`Path:     ${ctx.path}`);
      consola.log("");
      consola.log(formatStatus(ctx));
      consola.log("");
      consola.log(pc.bold("Next steps:"));
      consola.log(`  1. Expand ${pc.cyan(visionPath)} (who, problem, MVP success)`);
      consola.log(`  2. ${pc.cyan("sdd next")} through requirements → features → architecture`);
      consola.log(`  3. ${pc.cyan("sdd complete")} promotes vision/requirements/features/architecture → memory/`);
      consola.log(`  4. ${pc.cyan("sdd feature start F-001")} implements each backlog item`);
      consola.log("");

      const launch = await launchConfiguredAgent({
        projectRoot: root,
        config,
        ctx,
        noAgent: args["no-agent"],
        event: `greenfield start · stage ${ctx.meta.stage}`,
      });
      await reportAgentLaunch(launch);
    });
  },
});

const featureList = defineCommand({
  meta: {
    name: "list",
    description: "List product feature backlog (memory/features.md or greenfield pack)",
  },
  async run() {
    await withProject(async ({ root, config }) => {
      const { path, features } = await listBacklogFeatures(root, config);
      consola.log(pc.bold("Feature backlog") + pc.dim(`  ${path}`));
      consola.log("");
      for (const f of features) {
        const st =
          f.status === "done" || f.status === "completed"
            ? pc.green(f.status)
            : f.status === "in_progress"
              ? pc.yellow(f.status)
              : pc.dim(f.status);
        consola.log(
          `${pc.cyan(f.id)}  ${f.name}  ${st}  ${pc.dim(f.priority)}  ${pc.dim(f.workflow)}`,
        );
        if (f.summary) consola.log(pc.dim(`       ${f.summary}`));
      }
      consola.log("");
      consola.log(pc.dim('Start one: sdd feature start F-001'));
    });
  },
});

const featureStart = defineCommand({
  meta: {
    name: "start",
    description: "Start a change pack from backlog id (e.g. F-001)",
  },
  args: {
    id: {
      type: "positional",
      description: "Feature id, e.g. F-001",
      required: true,
    },
    workflow: {
      type: "string",
      description: "Override workflow (default: from backlog or feature)",
      alias: "w",
    },
    "no-agent": noAgentArg,
  },
  async run({ args }) {
    await withProject(async ({ root, config }) => {
      const { ctx, feature } = await startFeatureFromBacklog({
        projectRoot: root,
        config,
        featureId: args.id,
        workflowName: args.workflow,
      });

      consola.success(
        `Started ${pc.cyan(feature.id)} → change ${pc.cyan(ctx.id)}`,
      );
      consola.log(`Title:    ${ctx.meta.title}`);
      consola.log(`Workflow: ${ctx.meta.workflow}`);
      consola.log(`Stage:    ${ctx.meta.stage}`);
      consola.log(`Path:     ${ctx.path}`);
      consola.log("");
      consola.log(formatStatus(ctx));
      consola.log("");
      consola.log(
        pc.dim(
          "Backlog status set to in_progress. When done: sdd verify → sdd complete",
        ),
      );
      consola.log("");

      const launch = await launchConfiguredAgent({
        projectRoot: root,
        config,
        ctx,
        noAgent: args["no-agent"],
        event: `feature ${feature.id} start · stage ${ctx.meta.stage}`,
      });
      await reportAgentLaunch(launch);
    });
  },
});

const feature = defineCommand({
  meta: {
    name: "feature",
    description: "Product backlog helpers (list / start from greenfield features.md)",
  },
  subCommands: {
    list: featureList,
    start: featureStart,
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
      description: "Alias of --ai: grok | copilot | claude | ollama",
      alias: "t",
    },
    ai: {
      type: "string",
      description: "AI agent to install: grok | copilot | claude | ollama (only this host)",
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
      });
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
    description: "Manage AI coding-agent integrations (copilot | claude | grok | ollama)",
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

/** Normalize citty string | string[] flags. */
function asStringList(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  const s = String(value).trim();
  return s ? [s] : [];
}

const contextCmd = defineCommand({
  meta: {
    name: "context",
    description:
      "Structure-aware (AST) code context for agents — symbols/slices, not full-repo dump",
  },
  args: {
    path: {
      type: "string",
      description: "Seed path (file or directory; repeatable)",
      alias: "p",
    },
    symbol: {
      type: "string",
      description: "Priority symbol name (repeatable)",
      alias: "s",
    },
    query: {
      type: "string",
      description: "Free-text focus for keyword ranking",
      alias: "q",
    },
    change: {
      type: "string",
      description: "Change id (default: active)",
      alias: "c",
    },
    out: {
      type: "string",
      description:
        "Write regenerable markdown path, or 'change' for changes/<id>/code-context.md",
      alias: "o",
    },
    stdout: {
      type: "boolean",
      description: "Print full markdown to stdout",
      default: false,
    },
    neighbors: {
      type: "boolean",
      description: "Include structural import neighbors within caps",
      default: false,
    },
    json: {
      type: "boolean",
      description: "Print machine-readable JSON summary to stdout",
      default: false,
    },
    "max-files": {
      type: "string",
      description: "Cap: max files to parse (default 40)",
    },
    "max-slices": {
      type: "string",
      description: "Cap: max code slices (default 20)",
    },
    "max-lines-per-slice": {
      type: "string",
      description: "Cap: max lines per slice (default 80)",
    },
    "max-tokens": {
      type: "string",
      description: "Cap: approx token budget (default 12000)",
    },
  },
  async run({ args }) {
    await withProject(async ({ root, config }) => {
      try {
        let changeId: string | null = null;
        if (args.change) {
          try {
            changeId = await resolveChangeId(root, config, args.change);
          } catch (err) {
            consola.error(err instanceof Error ? err.message : err);
            process.exit(1);
          }
        } else {
          changeId = await getActiveChangeId(root, config);
        }

        const paths = asStringList(args.path);
        const symbols = asStringList(args.symbol);

        let writeArtifactTo: string | null = null;
        if (args.out) {
          if (args.out === "change") {
            if (!changeId) {
              consola.error(
                "No active change for --out change. Pass --change <id> or --out <path>.",
              );
              process.exit(1);
            }
            writeArtifactTo = join(
              changePath(root, config, changeId),
              "code-context.md",
            );
          } else {
            writeArtifactTo = args.out.startsWith("/")
              ? args.out
              : join(root, args.out);
          }
        }

        const num = (v: unknown): number | undefined => {
          if (v == null || v === "") return undefined;
          const n = Number(v);
          return Number.isFinite(n) && n > 0 ? n : undefined;
        };

        const result = await generateCodeContext({
          projectRoot: root,
          changeId,
          paths: paths.length ? paths : undefined,
          symbols: symbols.length ? symbols : undefined,
          query: args.query || undefined,
          includeNeighbors: Boolean(args.neighbors),
          writeArtifactTo,
          caps: {
            maxFiles: num(args["max-files"]),
            maxSlices: num(args["max-slices"]),
            maxLinesPerSlice: num(args["max-lines-per-slice"]),
            maxTokensApprox: num(args["max-tokens"]),
          },
        });

        const wantStdout =
          args.stdout || (!args.out && !args.json) || (args.out && args.stdout);

        if (args.json) {
          process.stdout.write(
            formatJsonSummary(
              result.summary,
              result.gaps,
              result.slices,
              result.ok,
            ) + "\n",
          );
        } else if (wantStdout) {
          process.stdout.write(
            result.markdown.endsWith("\n")
              ? result.markdown
              : `${result.markdown}\n`,
          );
        } else if (result.artifactPath) {
          consola.success(
            `Wrote code context → ${pc.cyan(result.artifactPath)}`,
          );
          consola.log(
            pc.dim(
              `Files: ${result.summary.filesAnalyzed} · Symbols: ${result.summary.symbolsExtracted} · Slices: ${result.summary.slicesEmitted}${result.summary.truncated ? " · truncated" : ""}`,
            ),
          );
          if (result.gaps.length) {
            consola.log(pc.dim(`Gaps: ${result.gaps.map((g) => g.code).join(", ")}`));
          }
        } else {
          process.stdout.write(
            result.markdown.endsWith("\n")
              ? result.markdown
              : `${result.markdown}\n`,
          );
        }

        if (!result.ok) {
          process.exit(1);
        }
      } catch (err) {
        consola.error(err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });
  },
});

const refine = defineCommand({
  meta: {
    name: "refine",
    description:
      "Stage-scoped refine agent: improve focus-stage artifacts, impact prior pack files (never edit constitution)",
  },
  args: {
    stage: {
      type: "positional",
      description: "Stage id to refine (default: current stage)",
      required: false,
    },
    change: { type: "string", description: "Change id", alias: "c" },
    analyze: {
      type: "boolean",
      description: "Analyze only — write quality-report.md, do not edit pack artifacts",
      default: false,
    },
    "focus-only": {
      type: "boolean",
      description: "Edit only focus-stage files (still read prior + constitution)",
      default: false,
    },
    "no-agent": noAgentArg,
  },
  async run({ args }) {
    await withProject(async ({ root, config }) => {
      const id = await resolveChangeId(root, config, args.change);
      const plan = await buildRefinePlan({
        projectRoot: root,
        config,
        changeId: id,
        stageId: args.stage,
        focusOnly: Boolean(args["focus-only"]),
        mode: args.analyze ? "analyze" : "refine",
      });
      const briefPath = await writeRefineBrief(plan, root);
      await refreshActiveAgentContext(root);
      await writeAgentHandoff(root, config, id);

      consola.success(
        `Refine brief → ${pc.cyan(briefPath)} (stage ${pc.bold(plan.focusStageId)}, mode ${plan.mode})`,
      );
      consola.log(pc.dim(`Focus artifacts: ${plan.focusArtifacts.map((a) => a.path).join(", ") || "(none)"}`));
      consola.log(
        pc.dim(
          `Prior trail: ${plan.priorArtifacts.length} file(s) · constitution ${plan.constitutionExists ? "RO" : "missing"}`,
        ),
      );
      if (plan.mode === "analyze") {
        consola.info(`Report target: ${plan.reportPath}`);
      }
      consola.log("");

      const ctx = await buildContext(root, config, id);
      const launch = await launchConfiguredAgent({
        projectRoot: root,
        config,
        ctx,
        noAgent: args["no-agent"],
        event: `${plan.mode} stage ${plan.focusStageId}`,
        kickoffInstructions: [
          `Read first: ${briefPath}`,
          `Also: .sdd/protocol.md, .sdd/active-context.md`,
          plan.constitutionExists
            ? `Constitution READ-ONLY: ${plan.constitutionPath}`
            : `No constitution.md (optional).`,
          plan.mode === "analyze"
            ? `Mode ANALYZE: write findings to ${plan.reportPath} only — do not edit pack artifacts.`
            : `Mode REFINE: improve focus-stage artifacts; impact-scan prior pack files (fix mechanical inconsistencies; highlight judgment). Never edit constitution. Do not run sdd next.`,
          plan.focusOnly
            ? `focusOnly=true: edit only focus-stage files.`
            : `Prior pack files may be fixed for clear contradictions/term drift; scope changes → highlight for human.`,
        ].join(" "),
      });
      await reportAgentLaunch(launch);
    });
  },
});

const doctor = defineCommand({
  meta: {
    name: "doctor",
    description: "Check local setup (Node, init, AI host, active change)",
  },
  async run() {
    const root = projectRoot();
    let ok = true;
    const line = (label: string, fine: boolean, detail: string) => {
      const mark = fine ? pc.green("✓") : pc.red("✗");
      if (!fine) ok = false;
      consola.log(`  ${mark} ${pc.bold(label)}  ${pc.dim(detail)}`);
    };

    consola.log(pc.bold("sdd doctor") + pc.dim(` · ${root}`));
    consola.log("");

    const major = Number(process.versions.node.split(".")[0]);
    line(
      "Node.js",
      major >= 20,
      `v${process.versions.node}${major < 24 ? " (24+ recommended)" : ""}`,
    );

    const initialized = await isInitialized(root);
    line("SDD init", initialized, initialized ? ".sdd/config.yaml found" : "run: sdd init --here --ai copilot");

    if (initialized) {
      const config = await loadConfig(root);
      const installed = await loadInstalledAgent(root);
      line(
        "AI host",
        Boolean(installed),
        installed
          ? `${installed.target} (${installed.integration.label})`
          : "none — run: sdd agents install --ai copilot",
      );
      const active = await getActiveChangeId(root, config);
      if (active) {
        line("Active change", true, active);
        const ctx = await buildContext(root, config, active);
        line("Current stage", true, ctx.meta.stage);
        const stage = getStage(ctx.workflow, ctx.meta, ctx.meta.stage);
        const first = stage?.artifacts.find((a) => a.required) ?? stage?.artifacts[0];
        if (first) {
          const p = join(ctx.path, first.path);
          line("Open next", true, p);
        }
      } else {
        line("Active change", true, "none — run: sdd new \"My first change\"");
      }
    }

    consola.log("");
    if (ok) {
      consola.success("Looks good. Try: sdd status  or  sdd new \"…\"");
    } else {
      consola.warn("Fix the ✗ items above, then re-run sdd doctor.");
      process.exitCode = 1;
    }
  },
});

async function runMcpServe() {
  // MCP protocol uses stdin/stdout — never log chatter to stdout
  try {
    const { startMcpServer } = await import("./mcp/server.js");
    await startMcpServer();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

const mcpServe = defineCommand({
  meta: {
    name: "serve",
    description:
      "Start MCP server (stdio) — use this in client config args: [\"mcp\", \"serve\"]",
  },
  async run() {
    await runMcpServe();
  },
});

const mcpClients = defineCommand({
  meta: {
    name: "clients",
    description: "List MCP hosts sdd can configure (and what each is for)",
  },
  async run() {
    const { MCP_CLIENTS } = await import("./mcp/setup.js");
    consola.log(pc.bold("MCP clients sdd can set up"));
    consola.log("");
    for (const c of MCP_CLIENTS) {
      consola.log(`${pc.cyan(c.id.padEnd(16))} ${pc.bold(c.label)}`);
      consola.log(`  ${c.useCase}`);
      if (c.projectConfigRel) {
        consola.log(pc.dim(`  project file: ${c.projectConfigRel}`));
      }
      if (c.globalConfigHint) {
        consola.log(pc.dim(`  global file:  ${c.globalConfigHint}`));
      }
      consola.log("");
    }
    consola.log(pc.dim("Configure one:"));
    consola.log(
      pc.dim('  sdd mcp setup --client cursor --write'),
    );
    consola.log(
      pc.dim('  sdd mcp setup --client claude-code --write'),
    );
  },
});

const mcpSetup = defineCommand({
  meta: {
    name: "setup",
    description:
      "Generate MCP config for Cursor / Claude Code / VS Code / Claude Desktop (use cases)",
  },
  args: {
    client: {
      type: "string",
      description:
        "cursor | claude-code | vscode | claude-desktop | print  (or omit to pick)",
      alias: "c",
    },
    write: {
      type: "boolean",
      description: "Write config file into the project (or global for claude-desktop)",
      default: false,
    },
    global: {
      type: "boolean",
      description: "Write user-global config when supported (claude-desktop)",
      default: false,
    },
    path: {
      type: "string",
      description: "Explicit config file path (optional)",
    },
    project: {
      type: "string",
      description: "Project root for SDD_PROJECT_ROOT (default: cwd / SDD_PROJECT_ROOT)",
      alias: "p",
    },
    npx: {
      type: "boolean",
      description: "Use npx @structured-vibe-coding/cli instead of global sdd",
      default: false,
    },
    command: {
      type: "string",
      description: "Override MCP command binary (default: sdd)",
    },
  },
  async run({ args }) {
    const {
      MCP_CLIENTS,
      buildConfigDocument,
      mergeAndWriteConfig,
      prettyJson,
      resolveClient,
      resolveWritePath,
    } = await import("./mcp/setup.js");

    const root = args.project?.trim() || projectRoot();
    let clientId = args.client?.trim();
    if (!clientId) {
      const picked = await consola.prompt("Which MCP host are you setting up?", {
        type: "select",
        options: MCP_CLIENTS.map((c) => ({
          label: `${c.label} (${c.id})`,
          value: c.id,
          hint: c.useCase,
        })),
      });
      if (typeof picked !== "string") {
        consola.error("Cancelled");
        process.exit(1);
      }
      clientId = picked;
    }

    let client;
    try {
      client = resolveClient(clientId);
    } catch (err) {
      consola.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }

    const command =
      args.command?.trim() || (args.npx ? "npx" : "sdd");
    const opts = {
      projectRoot: root,
      command,
    };
    const { json } = buildConfigDocument(client, opts);
    const snippet = prettyJson(json);

    consola.log("");
    consola.log(pc.bold(`Use case: ${client.label}`));
    consola.log(pc.dim(client.useCase));
    consola.log(pc.dim(`SDD_PROJECT_ROOT → ${root}`));
    consola.log("");

    if (!args.write && !args.path && !args.global) {
      consola.log(pc.bold("Config snippet (paste into your MCP host):"));
      consola.log("");
      process.stdout.write(snippet);
      consola.log("");
      consola.log(pc.bold("Next:"));
      if (client.projectConfigRel) {
        consola.log(
          `  Write project file: ${pc.cyan(`sdd mcp setup --client ${client.id} --write`)}`,
        );
        consola.log(pc.dim(`  → creates ${client.projectConfigRel}`));
      }
      if (client.id === "claude-desktop") {
        consola.log(
          `  Write global file:  ${pc.cyan("sdd mcp setup --client claude-desktop --write --global")}`,
        );
      }
      consola.log(`  Then restart the host and open this project.`);
      consola.log(
        pc.dim("  Server command in config: sdd mcp serve  (stdio process + AST tools)"),
      );
      return;
    }

    const writePath = resolveWritePath(
      client,
      root,
      args.path,
      args.global || client.id === "claude-desktop",
    );
    if (!writePath) {
      consola.error(
        "No write path for this client. Use --path or --write with cursor|claude-code|vscode.",
      );
      process.stdout.write(snippet);
      process.exit(1);
    }

    try {
      const result = await mergeAndWriteConfig(writePath, client, opts);
      consola.success(
        result.created
          ? `Created ${pc.cyan(result.path)}`
          : result.merged
            ? `Merged sdd into ${pc.cyan(result.path)}`
            : `Wrote ${pc.cyan(result.path)}`,
      );
      consola.log("");
      consola.log(pc.bold("What to do next"));
      consola.log("  1. Restart Cursor / Claude Code / VS Code / Claude Desktop");
      consola.log("  2. Open this project folder");
      consola.log("  3. Confirm tools like sdd_status / sdd_next appear for the agent");
      consola.log(
        pc.dim(
          "  Tip: project must be initialized — sdd init --here --ai copilot|claude|grok|ollama",
        ),
      );
    } catch (err) {
      consola.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
  },
});

const mcpConfig = defineCommand({
  meta: {
    name: "config",
    description: "Print MCP JSON for a client (same as setup without --write)",
  },
  args: {
    client: {
      type: "string",
      description: "cursor | claude-code | vscode | claude-desktop | print",
      alias: "c",
      default: "print",
    },
    project: {
      type: "string",
      description: "Project root for SDD_PROJECT_ROOT",
      alias: "p",
    },
    npx: {
      type: "boolean",
      description: "Use npx invocation",
      default: false,
    },
  },
  async run({ args }) {
    const { buildConfigDocument, prettyJson, resolveClient } = await import(
      "./mcp/setup.js"
    );
    const root = args.project?.trim() || projectRoot();
    const client = resolveClient(args.client || "print");
    const command = args.npx ? "npx" : "sdd";
    const { json } = buildConfigDocument(client, {
      projectRoot: root,
      command,
    });
    process.stdout.write(prettyJson(json));
  },
});

const mcpSourcesList = defineCommand({
  meta: {
    name: "list",
    description: "List external MCP sources (.sdd/mcp.yaml) sdd will call",
  },
  args: {
    stage: { type: "string", description: "Filter: show match for stage" },
    workflow: { type: "string", description: "Filter: workflow name" },
    query: { type: "string", description: "Filter: free-text / title" },
  },
  async run({ args }) {
    await withProject(async ({ root }) => {
      const {
        loadMcpConfig,
        matchMcpSources,
        explainMatch,
      } = await import("@structured-vibe-coding/core");
      const cfg = await loadMcpConfig(root);
      if (!cfg.sources.length) {
        consola.info("No external MCP sources yet.");
        consola.log(
          pc.dim(
            'Add one: sdd mcp sources add --id design-system --command npx --arg -y --arg @acme/ds-mcp --stages design,implement --tool search --tool-arg query={{query}}',
          ),
        );
        consola.log(pc.dim(`Config file: ${root}/.sdd/mcp.yaml`));
        return;
      }
      consola.log(
        pc.bold("External MCP sources") +
          pc.dim("  (sdd = client; these servers provide org/lib/AST context)"),
      );
      consola.log(pc.dim(`auto_fetch_on_handoff: ${cfg.auto_fetch_on_handoff}`));
      consola.log("");
      const matchCtx = {
        stage: args.stage,
        workflow: args.workflow,
        query: args.query,
      };
      for (const s of cfg.sources) {
        const mark = s.enabled ? pc.green("on ") : pc.dim("off");
        consola.log(
          `${mark} ${pc.cyan(s.id)}  pri=${s.priority}  ${pc.dim(s.command)} ${(s.args ?? []).join(" ")}`,
        );
        if (s.description) consola.log(pc.dim(`     ${s.description}`));
        if (s.invoke) {
          consola.log(
            pc.dim(`     invoke: ${s.invoke.tool} ${JSON.stringify(s.invoke.args ?? {})}`),
          );
        } else {
          consola.log(pc.dim("     invoke: (none — use sdd mcp fetch --tool …)"));
        }
        if (args.stage || args.workflow || args.query) {
          consola.log(pc.dim(`     ${explainMatch(s, matchCtx)}`));
        }
        consola.log("");
      }
      if (args.stage || args.workflow || args.query) {
        const matched = matchMcpSources(cfg.sources, matchCtx);
        consola.log(
          pc.bold("Would call:") +
            " " +
            (matched.map((m) => m.id).join(", ") || "(none)"),
        );
      }
    });
  },
});

const mcpSourcesAdd = defineCommand({
  meta: {
    name: "add",
    description:
      "Register an external MCP source (design system, org lib, AST engine, …)",
  },
  args: {
    id: { type: "string", description: "Source id (e.g. design-system)", required: true },
    command: {
      type: "string",
      description: "Command to start the MCP server (e.g. npx, node, path)",
      required: true,
    },
    arg: {
      type: "string",
      description: "Server arg (repeatable)",
    },
    description: { type: "string", description: "What this source provides" },
    stages: {
      type: "string",
      description: "Comma stages when sdd should use this (e.g. design,implement)",
    },
    workflows: {
      type: "string",
      description: "Comma workflows (optional)",
    },
    intents: {
      type: "string",
      description: "Comma intents: ui,design,code,api,…",
    },
    keywords: {
      type: "string",
      description: "Comma keywords matched against title/query",
    },
    tool: {
      type: "string",
      description: "Default tool to call on auto-fetch / fetch",
    },
    "tool-arg": {
      type: "string",
      description: "Tool arg key=value (repeatable), values may use {{query}} {{title}} {{stage}}",
    },
    priority: { type: "string", description: "Higher = preferred (default 0)" },
    cwd: {
      type: "string",
      description: "Working directory (default project root; {{projectRoot}} ok)",
    },
  },
  async run({ args }) {
    await withProject(async ({ root }) => {
      const { addMcpSource } = await import("@structured-vibe-coding/core");
      const argList = asStringList(args.arg);
      const toolArgs: Record<string, unknown> = {};
      for (const raw of asStringList(args["tool-arg"])) {
        const eq = raw.indexOf("=");
        if (eq <= 0) continue;
        toolArgs[raw.slice(0, eq)] = raw.slice(eq + 1);
      }
      const stages = (args.stages ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const workflows = (args.workflows ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const intents = (args.intents ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const keywords = (args.keywords ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const priority = args.priority ? Number(args.priority) : 0;

      await addMcpSource(root, {
        id: args.id,
        description: args.description ?? "",
        transport: "stdio",
        command: args.command,
        args: argList,
        env: {},
        cwd: args.cwd,
        enabled: true,
        priority: Number.isFinite(priority) ? priority : 0,
        when: { stages, workflows, intents, keywords },
        invoke: args.tool
          ? { tool: args.tool, args: toolArgs }
          : undefined,
      });
      consola.success(`Added MCP source ${pc.cyan(args.id)} → .sdd/mcp.yaml`);
      consola.log(
        pc.dim(
          "Test: sdd mcp sources test " +
            args.id +
            (args.tool ? "" : "  (add --tool on add, or pass --tool on test/fetch)"),
        ),
      );
      consola.log(
        pc.dim(
          "Auto-fetch on handoff when stage matches and invoke.tool is set (auto_fetch_on_handoff: true).",
        ),
      );
    });
  },
});

const mcpSourcesRemove = defineCommand({
  meta: { name: "remove", description: "Remove an external MCP source by id" },
  args: {
    id: { type: "positional", description: "Source id", required: true },
  },
  async run({ args }) {
    await withProject(async ({ root }) => {
      const { removeMcpSource } = await import("@structured-vibe-coding/core");
      await removeMcpSource(root, args.id);
      consola.success(`Removed source ${args.id}`);
    });
  },
});

const mcpSourcesTest = defineCommand({
  meta: {
    name: "test",
    description: "List tools from a source (or call invoke.tool) to verify connectivity",
  },
  args: {
    id: { type: "positional", description: "Source id", required: true },
    tool: { type: "string", description: "Call this tool instead of listing" },
    "tool-arg": {
      type: "string",
      description: "key=value for tool call (repeatable)",
    },
    query: { type: "string", description: "Fills {{query}} in invoke args" },
  },
  async run({ args }) {
    await withProject(async ({ root }) => {
      const {
        loadMcpConfig,
        listMcpSourceTools,
        callMcpSourceTool,
        interpolateArgs,
      } = await import("@structured-vibe-coding/core");
      const cfg = await loadMcpConfig(root);
      const source = cfg.sources.find((s) => s.id === args.id);
      if (!source) {
        consola.error(`Unknown source "${args.id}". Run: sdd mcp sources list`);
        process.exit(1);
      }
      const tool = args.tool ?? source.invoke?.tool;
      if (!tool) {
        consola.info(`Listing tools from ${source.id}…`);
        try {
          const tools = await listMcpSourceTools(source, root);
          if (!tools.length) consola.warn("No tools reported.");
          for (const t of tools) {
            consola.log(
              `${pc.cyan(t.name)}  ${pc.dim(t.description ?? "")}`,
            );
          }
        } catch (err) {
          consola.error(err instanceof Error ? err.message : err);
          process.exit(1);
        }
        return;
      }
      const extra: Record<string, unknown> = {};
      for (const raw of asStringList(args["tool-arg"])) {
        const eq = raw.indexOf("=");
        if (eq > 0) extra[raw.slice(0, eq)] = raw.slice(eq + 1);
      }
      const base = { ...(source.invoke?.args ?? {}), ...extra };
      const vars = {
        projectRoot: root,
        query: args.query ?? "",
        title: args.query ?? "",
        stage: "",
        workflow: "",
      };
      const callArgs = interpolateArgs(base, vars);
      consola.info(`Calling ${source.id} → ${tool}…`);
      const result = await callMcpSourceTool(source, root, tool, callArgs);
      if (!result.ok) {
        consola.error(result.error ?? result.text);
        process.exit(1);
      }
      process.stdout.write(
        result.text.endsWith("\n") ? result.text : `${result.text}\n`,
      );
    });
  },
});

const mcpSources = defineCommand({
  meta: {
    name: "sources",
    description:
      "External MCP sources sdd *calls* (org libs, design systems, AST engines)",
  },
  subCommands: {
    list: mcpSourcesList,
    add: mcpSourcesAdd,
    remove: mcpSourcesRemove,
    test: mcpSourcesTest,
  },
});

const mcpFetch = defineCommand({
  meta: {
    name: "fetch",
    description:
      "Call matching external MCP sources for current stage (or --source / --tool)",
  },
  args: {
    source: {
      type: "string",
      description: "Only this source id (repeatable)",
    },
    tool: { type: "string", description: "Override invoke tool" },
    "tool-arg": { type: "string", description: "key=value (repeatable)" },
    query: {
      type: "string",
      description: "Query / focus text (default: active change title)",
    },
    intents: {
      type: "string",
      description: "Comma intents e.g. ui,code",
    },
    stage: { type: "string", description: "Override stage for matching" },
    change: { type: "string", description: "Change id", alias: "c" },
    "out-handoff": {
      type: "boolean",
      description: "Also refresh .sdd/handoff.md after fetch",
      default: false,
    },
  },
  async run({ args }) {
    await withProject(async ({ root, config }) => {
      const {
        gatherMcpContext,
        formatMcpContextForHandoff,
        resolveChangeId,
        buildContext,
        writeAgentHandoff,
      } = await import("@structured-vibe-coding/core");

      let stage: string | undefined = args.stage;
      let workflow: string | undefined;
      let query = args.query?.trim();
      try {
        const id = await resolveChangeId(root, config, args.change);
        const ctx = await buildContext(root, config, id);
        stage = stage ?? ctx.meta.stage;
        workflow = ctx.meta.workflow;
        query = query || ctx.meta.title;
      } catch {
        // no active change — fetch still possible with explicit stage/query
      }

      const extra: Record<string, unknown> = {};
      for (const raw of asStringList(args["tool-arg"])) {
        const eq = raw.indexOf("=");
        if (eq > 0) extra[raw.slice(0, eq)] = raw.slice(eq + 1);
      }

      const results = await gatherMcpContext({
        projectRoot: root,
        match: {
          stage,
          workflow,
          query,
          intents: (args.intents ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        },
        sourceIds: asStringList(args.source),
        tool: args.tool,
        args: Object.keys(extra).length ? extra : undefined,
      });

      if (!results.length) {
        consola.warn(
          "No matching sources (or none configured). sdd mcp sources list",
        );
        process.exitCode = 1;
        return;
      }
      process.stdout.write(formatMcpContextForHandoff(results));
      if (args["out-handoff"]) {
        try {
          const id = await resolveChangeId(root, config, args.change);
          await writeAgentHandoff(root, config, id);
          consola.info(pc.dim("Refreshed .sdd/handoff.md"));
        } catch (err) {
          consola.warn(
            err instanceof Error ? err.message : "Could not refresh handoff",
          );
        }
      }
    });
  },
});

const mcpCmd = defineCommand({
  meta: {
    name: "mcp",
    description:
      "MCP: (1) sources sdd *calls* for org/AST context (2) serve sdd tools *to* agents (3) setup hosts",
  },
  subCommands: {
    serve: mcpServe,
    setup: mcpSetup,
    config: mcpConfig,
    clients: mcpClients,
    sources: mcpSources,
    fetch: mcpFetch,
  },
  async run() {
    // Bare `sdd mcp` → serve (hosts may use args: ["mcp"] without "serve")
    await runMcpServe();
  },
});

const help = defineCommand({
  meta: { name: "help", description: "Show a friendly overview of common commands" },
  async run() {
    const root = projectRoot();
    consola.log(pc.bold("sdd") + " — keep short plans next to your code (with your AI)");
    consola.log(pc.dim("  Needs: Node 20+ · about 10 minutes for your first loop"));
    consola.log("");
    consola.log(pc.bold("First time (learn without the AI popping up):"));
    consola.log(`  ${pc.cyan("sdd init --here --ai copilot")}   # or grok | claude | ollama`);
    consola.log(`  ${pc.cyan("sdd doctor")}`);
    consola.log(`  ${pc.cyan('sdd new "Fix empty list crash" -w hotfix -y --no-agent')}`);
    consola.log(`  # open the intent.md path it prints → write a few real sentences`);
    consola.log(`  ${pc.cyan("sdd next --no-agent")}`);
    consola.log(`  ${pc.cyan("sdd complete --no-agent")}`);
    consola.log("");
    consola.log(pc.bold("Everyday:"));
    consola.log(`  ${pc.cyan("sdd status")}            where am I?`);
    consola.log(`  ${pc.cyan("sdd next")}              next step (often opens your AI)`);
    consola.log(`  ${pc.cyan("sdd verify")}            check the work`);
    consola.log(`  ${pc.cyan("sdd complete")}          mark done`);
    consola.log("");
    consola.log(pc.bold("New product:"));
    consola.log(`  ${pc.cyan('sdd greenfield "One-line product idea"')}`);
    consola.log(`  ${pc.cyan("sdd feature list")} · ${pc.cyan("sdd feature start F-001")}`);
    consola.log("");
    consola.log(pc.bold("Tips:"));
    consola.log(`  ${pc.cyan("--no-agent")}            learn the process first, AI later`);
    consola.log(`  ${pc.cyan("sdd mcp sources add …")} attach org lib / AST MCP for sdd to call`);
    consola.log(`  ${pc.cyan("sdd mcp setup -c cursor --write")}  let agents call sdd (optional)`);
    consola.log(pc.dim("  If next fails: open the file in the error and write real sentences (not empty template)."));
    consola.log("");
    consola.log(
      pc.dim(
        "Docs: https://harsha09.github.io/spec-driven-development/tutorials/first-change/",
      ),
    );
    consola.log(
      pc.dim(
        "npm:  https://www.npmjs.com/package/@structured-vibe-coding/cli  ·  sdd <cmd> --help",
      ),
    );
    if (await isInitialized(root)) {
      const config = await loadConfig(root);
      const active = await getActiveChangeId(root, config);
      if (active) consola.log(pc.dim(`Active change: ${active}`));
    } else {
      consola.log(pc.dim("Not set up here yet. Run: sdd init --here --ai copilot"));
    }
  },
});

const main = defineCommand({
  meta: {
    name: "sdd",
    description:
      "Keep short plans next to your code. Process coach for you + your AI coding agent.",
    version: "0.14.2",
  },
  subCommands: {
    init,
    new: newCmd,
    greenfield,
    feature,
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
    context: contextCmd,
    mcp: mcpCmd,
    refine,
    doctor,
    help,
  },
});

await runMain(main);
