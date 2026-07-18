import { defineCommand, runMain } from "citty";
import { consola } from "consola";
import pc from "picocolors";
import {
  advanceStage,
  approveGate,
  buildAgentPrompt,
  buildContext,
  completeChange,
  createChange,
  formatStatus,
  getActiveChangeId,
  initProject,
  isInitialized,
  listChanges,
  listWorkflowNames,
  loadConfig,
  loadWorkflow,
  recommendWorkflow,
  resolveChangeId,
  runLocalVerify,
  setActiveChange,
  skipStage,
  switchWorkflow,
} from "@structured-vibe/core";

function projectRoot(): string {
  return process.cwd();
}

async function requireInit(): Promise<void> {
  if (!(await isInitialized(projectRoot()))) {
    consola.error("SDD is not initialized here. Run `sdd init` first.");
    process.exit(1);
  }
}

const init = defineCommand({
  meta: { name: "init", description: "Initialize SDD in the current directory" },
  args: {
    force: { type: "boolean", description: "Overwrite default workflows/templates", default: false },
  },
  async run({ args }) {
    try {
      const result = await initProject({
        projectRoot: projectRoot(),
        force: args.force,
      });
      consola.success("Initialized structured vibe coding (SDD)");
      consola.info(`Config: .sdd/config.yaml`);
      consola.info(`Workflows: .sdd/workflows/ (${(await listWorkflowNames(projectRoot())).join(", ")})`);
      consola.log("");
      consola.log(pc.dim("Next:"));
      consola.log(`  ${pc.cyan("sdd new")} "Your first change"`);
      consola.log(`  ${pc.cyan("sdd status")}`);
      void result;
    } catch (err) {
      consola.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
  },
});

const newCmd = defineCommand({
  meta: { name: "new", description: "Start a new change (spec-first)" },
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
  },
  async run({ args }) {
    await requireInit();
    const root = projectRoot();
    const config = await loadConfig(root);

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

    try {
      const rec = await recommendWorkflow(root, title, config, {
        preferred: args.workflow,
      });

      let workflowName = rec.name;
      if (!args.workflow && !args.yes) {
        consola.log("");
        consola.log(`${pc.bold("Recommended:")} ${pc.green(rec.name)} ${pc.dim(`(${rec.reason})`)}`);
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
      consola.log(pc.dim("Edit artifacts, then: sdd next · sdd agent · sdd status"));
    } catch (err) {
      consola.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
  },
});

const status = defineCommand({
  meta: { name: "status", description: "Show active change and stage progress" },
  args: {
    change: { type: "string", description: "Change id", alias: "c" },
    list: { type: "boolean", description: "List all open changes", default: false },
  },
  async run({ args }) {
    await requireInit();
    const root = projectRoot();
    const config = await loadConfig(root);
    try {
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
    } catch (err) {
      consola.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
  },
});

const next = defineCommand({
  meta: { name: "next", description: "Advance to the next workflow stage" },
  args: {
    change: { type: "string", description: "Change id", alias: "c" },
    force: { type: "boolean", description: "Skip gate/artifact checks", default: false },
  },
  async run({ args }) {
    await requireInit();
    const root = projectRoot();
    const config = await loadConfig(root);
    try {
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
    } catch (err) {
      consola.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
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
    await requireInit();
    const root = projectRoot();
    const config = await loadConfig(root);
    try {
      const id = await resolveChangeId(root, config, args.change);
      const ctx = await skipStage(root, config, id, args.stage, args.reason);
      consola.success(`Skipped stage ${args.stage}`);
      consola.log(formatStatus(ctx));
    } catch (err) {
      consola.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
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
    await requireInit();
    const root = projectRoot();
    const config = await loadConfig(root);
    try {
      const id = await resolveChangeId(root, config, args.change);
      const ctx = await switchWorkflow(root, config, id, args.workflow, args.reason);
      consola.success(`Workflow set to ${args.workflow}`);
      consola.log(formatStatus(ctx));
    } catch (err) {
      consola.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
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
    await requireInit();
    const root = projectRoot();
    const config = await loadConfig(root);
    const action = args.action;
    if (!["approve", "waive", "fail"].includes(action)) {
      consola.error("action must be approve | waive | fail");
      process.exit(1);
    }
    const statusMap = {
      approve: "approved",
      waive: "waived",
      fail: "failed",
    } as const;
    try {
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
    } catch (err) {
      consola.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
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
    await requireInit();
    const root = projectRoot();
    const config = await loadConfig(root);
    try {
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
        consola.log(pc.dim("Fix commands, re-run sdd verify, or sdd gate approve/waive to override."));
        process.exitCode = 1;
      } else {
        consola.log(pc.dim("When satisfied: sdd gate approve && sdd next (or sdd complete)"));
      }
    } catch (err) {
      consola.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
  },
});

const complete = defineCommand({
  meta: { name: "complete", description: "Complete the change and archive it" },
  args: {
    change: { type: "string", description: "Change id", alias: "c" },
  },
  async run({ args }) {
    await requireInit();
    const root = projectRoot();
    const config = await loadConfig(root);
    try {
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
    } catch (err) {
      consola.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
  },
});

const workflows = defineCommand({
  meta: { name: "workflows", description: "List available workflow packs" },
  async run() {
    await requireInit();
    const root = projectRoot();
    try {
      const names = await listWorkflowNames(root);
      for (const name of names) {
        const wf = await loadWorkflow(root, name);
        consola.log(
          `${pc.cyan(name)}  ${pc.dim(wf.description ?? "")}  ${pc.dim(`(${wf.stages.length} stages)`)}`,
        );
      }
    } catch (err) {
      consola.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
  },
});

const agent = defineCommand({
  meta: { name: "agent", description: "Export agent handoff prompt for current stage" },
  args: {
    change: { type: "string", description: "Change id", alias: "c" },
  },
  async run({ args }) {
    await requireInit();
    const root = projectRoot();
    const config = await loadConfig(root);
    try {
      const id = await resolveChangeId(root, config, args.change);
      const ctx = await buildContext(root, config, id);
      const prompt = await buildAgentPrompt(ctx, config, root);
      // raw stdout for easy piping
      process.stdout.write(prompt);
      if (!prompt.endsWith("\n")) process.stdout.write("\n");
    } catch (err) {
      consola.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
  },
});

const useChange = defineCommand({
  meta: { name: "checkout", description: "Set the active change" },
  args: {
    change: { type: "positional", description: "Change id", required: true },
  },
  async run({ args }) {
    await requireInit();
    const root = projectRoot();
    const config = await loadConfig(root);
    try {
      await buildContext(root, config, args.change);
      await setActiveChange(root, config, args.change);
      consola.success(`Active change: ${args.change}`);
    } catch (err) {
      consola.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
  },
});

const help = defineCommand({
  meta: { name: "help", description: "Show help overview" },
  async run() {
    const root = projectRoot();
    consola.log(pc.bold("sdd") + pc.dim(" — structured vibe coding (local SDD)"));
    consola.log("");
    consola.log(
      "Commands: init · new · status · next · skip · use · gate · verify · complete · workflows · agent · checkout",
    );
    if (await isInitialized(root)) {
      const config = await loadConfig(root);
      const active = await getActiveChangeId(root, config);
      if (active) consola.log(pc.dim(`Active change: ${active}`));
    } else {
      consola.log(pc.dim("Not initialized. Run: sdd init"));
    }
  },
});

const main = defineCommand({
  meta: {
    name: "sdd",
    description: "Structured vibe coding — flexible local Spec-Driven Development",
    version: "0.1.0",
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
    checkout: useChange,
    help,
  },
});

runMain(main);
