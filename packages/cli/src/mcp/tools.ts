/**
 * MCP tool handlers — call core APIs (no agent launch).
 * Agents use these instead of dumping whole repos or re-implementing sdd.
 */

import { join } from "node:path";
import {
  advanceStage,
  approveGate,
  buildContext,
  changePath,
  completeChange,
  createChange,
  formatJsonSummary,
  formatStatus,
  generateCodeContext,
  getActiveChangeId,
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
  skipStage,
  startFeatureFromBacklog,
  startGreenfield,
  switchWorkflow,
  writeAgentHandoff,
} from "@structured-vibe-coding/core";
import { errText, okText, requireProject, resolveMcpProjectRoot } from "./project.js";

export async function toolHelp() {
  return okText(
    [
      "# sdd MCP tools",
      "",
      "All tools talk to the **same engine** as the `sdd` CLI.",
      "Process tools do **not** launch your AI (no agent spawn).",
      "",
      "## Setup",
      "- Project must be initialized: `sdd init --here --ai …`",
      "- Prefer env `SDD_PROJECT_ROOT=/abs/path/to/app` in MCP config",
      "",
      "## Process (same as CLI)",
      "- sdd_doctor, sdd_status (list=true for all open changes), sdd_workflows",
      "- sdd_new, sdd_greenfield, sdd_feature_list, sdd_feature_start",
      "- sdd_next, sdd_skip, sdd_use, sdd_gate, sdd_verify, sdd_complete",
      "- sdd_handoff (refresh brief for the current change)",
      "",
      "## Code (token-saving)",
      "- sdd_code_context — AST slices; prefer symbols/paths; default maxTokens 4000",
      "",
      "Use sdd_code_context for product code. Keep specs as markdown under changes/.",
      "CLI and MCP both honor SDD_PROJECT_ROOT when set.",
      "",
    ].join("\n"),
  );
}

export async function toolStatus(args: {
  projectRoot?: string;
  change?: string;
  list?: boolean;
}) {
  try {
    const { root, config } = await requireProject(args.projectRoot);
    if (args.list) {
      const ids = await listChanges(root, config);
      if (!ids.length) return okText("No open changes.");
      const lines: string[] = [];
      for (const id of ids) {
        try {
          const ctx = await buildContext(root, config, id);
          lines.push(
            `${ctx.meta.status === "in_progress" ? "●" : "○"} ${id}  ${ctx.meta.workflow}  ${ctx.meta.stage}`,
          );
        } catch (e) {
          lines.push(`! ${id}  ${e instanceof Error ? e.message : e}`);
        }
      }
      return okText(lines.join("\n"));
    }
    const id = await resolveChangeId(root, config, args.change);
    const ctx = await buildContext(root, config, id);
    return okText(formatStatus(ctx));
  } catch (e) {
    return errText(e instanceof Error ? e.message : String(e));
  }
}

export async function toolWorkflows(args: { projectRoot?: string }) {
  try {
    const root = resolveMcpProjectRoot(args.projectRoot);
    if (!(await isInitialized(root))) {
      return errText(`Not initialized: ${root}`);
    }
    const names = await listWorkflowNames(root);
    const lines: string[] = [];
    for (const name of names) {
      const wf = await loadWorkflow(root, name);
      lines.push(
        `${name}  (${wf.stages.length} stages)  ${wf.description ?? ""}`.trim(),
      );
    }
    return okText(lines.join("\n") || "(no workflows)");
  } catch (e) {
    return errText(e instanceof Error ? e.message : String(e));
  }
}

export async function toolNew(args: {
  projectRoot?: string;
  title: string;
  workflow?: string;
  yes?: boolean;
}) {
  try {
    const { root, config } = await requireProject(args.projectRoot);
    const title = args.title.trim();
    if (!title) return errText("title is required");

    let workflowName = args.workflow?.trim();
    if (!workflowName) {
      const rec = await recommendWorkflow(root, title, config);
      workflowName = rec.name;
    }

    const ctx = await createChange({
      projectRoot: root,
      config,
      title,
      workflowName,
    });
    await writeAgentHandoff(root, config, ctx.id);
    await refreshActiveAgentContext(root);

    return okText(
      [
        `Created change ${ctx.id}`,
        `Workflow: ${ctx.meta.workflow}`,
        `Stage: ${ctx.meta.stage}`,
        `Path: ${ctx.path}`,
        "",
        formatStatus(ctx),
        "",
        "Fill the stage artifact with real sentences, then call sdd_next.",
      ].join("\n"),
    );
  } catch (e) {
    return errText(e instanceof Error ? e.message : String(e));
  }
}

export async function toolGreenfield(args: {
  projectRoot?: string;
  idea: string;
}) {
  try {
    const { root, config } = await requireProject(args.projectRoot);
    const idea = args.idea.trim();
    if (idea.length < 3) return errText("idea must be a short product sentence");

    const { ctx, visionPath } = await startGreenfield({
      projectRoot: root,
      config,
      idea,
    });
    await writeAgentHandoff(root, config, ctx.id);
    await refreshActiveAgentContext(root);

    return okText(
      [
        `Started greenfield ${ctx.id}`,
        `Stage: ${ctx.meta.stage}`,
        `Vision: ${visionPath}`,
        "",
        formatStatus(ctx),
        "",
        "Expand vision.md, then sdd_next through requirements → features → architecture → sdd_complete.",
      ].join("\n"),
    );
  } catch (e) {
    return errText(e instanceof Error ? e.message : String(e));
  }
}

export async function toolFeatureList(args: { projectRoot?: string }) {
  try {
    const { root, config } = await requireProject(args.projectRoot);
    const { path, features } = await listBacklogFeatures(root, config);
    const lines = [
      `Backlog: ${path}`,
      "",
      ...features.map(
        (f) =>
          `${f.id}  ${f.name}  [${f.status}]  ${f.priority}  ${f.workflow}` +
          (f.summary ? `\n       ${f.summary}` : ""),
      ),
      "",
      "Start one: sdd_feature_start with featureId F-001",
    ];
    return okText(lines.join("\n"));
  } catch (e) {
    return errText(e instanceof Error ? e.message : String(e));
  }
}

export async function toolFeatureStart(args: {
  projectRoot?: string;
  featureId: string;
  workflow?: string;
}) {
  try {
    const { root, config } = await requireProject(args.projectRoot);
    const { ctx, feature } = await startFeatureFromBacklog({
      projectRoot: root,
      config,
      featureId: args.featureId,
      workflowName: args.workflow,
    });
    await writeAgentHandoff(root, config, ctx.id);
    await refreshActiveAgentContext(root);
    return okText(
      [
        `Started ${feature.id} → ${ctx.id}`,
        `Title: ${ctx.meta.title}`,
        `Workflow: ${ctx.meta.workflow}`,
        `Stage: ${ctx.meta.stage}`,
        `Path: ${ctx.path}`,
        "",
        formatStatus(ctx),
      ].join("\n"),
    );
  } catch (e) {
    return errText(e instanceof Error ? e.message : String(e));
  }
}

export async function toolNext(args: {
  projectRoot?: string;
  change?: string;
  force?: boolean;
}) {
  try {
    const { root, config } = await requireProject(args.projectRoot);
    const id = await resolveChangeId(root, config, args.change);
    const result = await advanceStage(root, config, id, {
      force: Boolean(args.force),
    });
    await writeAgentHandoff(root, config, id);
    await refreshActiveAgentContext(root);
    const lines = [
      result.to
        ? `Advanced ${result.from} → ${result.to}`
        : `Already on last stage (${result.ctx.meta.stage})`,
      ...(result.warnings ?? []).map((w) => `Warning: ${w}`),
      result.artifactsCreated?.length
        ? `Artifacts: ${result.artifactsCreated.join(", ")}`
        : "",
      "",
      formatStatus(result.ctx),
    ].filter(Boolean);
    return okText(lines.join("\n"));
  } catch (e) {
    return errText(e instanceof Error ? e.message : String(e));
  }
}

export async function toolSkip(args: {
  projectRoot?: string;
  change?: string;
  stage: string;
  reason: string;
}) {
  try {
    const { root, config } = await requireProject(args.projectRoot);
    const id = await resolveChangeId(root, config, args.change);
    const ctx = await skipStage(
      root,
      config,
      id,
      args.stage,
      args.reason,
    );
    await writeAgentHandoff(root, config, id);
    return okText(`Skipped ${args.stage}\n\n${formatStatus(ctx)}`);
  } catch (e) {
    return errText(e instanceof Error ? e.message : String(e));
  }
}

export async function toolUse(args: {
  projectRoot?: string;
  change?: string;
  workflow: string;
  reason?: string;
}) {
  try {
    const { root, config } = await requireProject(args.projectRoot);
    const id = await resolveChangeId(root, config, args.change);
    const ctx = await switchWorkflow(
      root,
      config,
      id,
      args.workflow,
      args.reason,
    );
    await writeAgentHandoff(root, config, id);
    return okText(`Workflow → ${args.workflow}\n\n${formatStatus(ctx)}`);
  } catch (e) {
    return errText(e instanceof Error ? e.message : String(e));
  }
}

export async function toolGate(args: {
  projectRoot?: string;
  change?: string;
  action: "approve" | "waive" | "fail";
  stage?: string;
  note?: string;
}) {
  try {
    const { root, config } = await requireProject(args.projectRoot);
    const id = await resolveChangeId(root, config, args.change);
    const statusMap = {
      approve: "approved",
      waive: "waived",
      fail: "failed",
    } as const;
    const ctx = await approveGate(
      root,
      config,
      id,
      args.stage,
      args.note,
      statusMap[args.action],
    );
    await writeAgentHandoff(root, config, id);
    return okText(
      `Gate ${args.action}d on ${args.stage ?? ctx.meta.stage}\n\n${formatStatus(ctx)}`,
    );
  } catch (e) {
    return errText(e instanceof Error ? e.message : String(e));
  }
}

export async function toolVerify(args: {
  projectRoot?: string;
  change?: string;
  noRun?: boolean;
}) {
  try {
    const { root, config } = await requireProject(args.projectRoot);
    const id = await resolveChangeId(root, config, args.change);
    const result = await runLocalVerify(root, config, id, {
      runCommands: !args.noRun,
    });
    await writeAgentHandoff(root, config, id);
    const lines = [
      `Local verify for stage: ${result.stageId}`,
      `ok: ${result.ok}`,
      ...(result.results ?? []).map(
        (r) =>
          `${r.exitCode === 0 ? "✓" : "✗"} ${r.name} (exit ${r.exitCode})`,
      ),
      result.evidencePath ? `Evidence: ${result.evidencePath}` : "",
    ].filter(Boolean);
    return result.ok
      ? okText(lines.join("\n"))
      : errText(lines.join("\n"));
  } catch (e) {
    return errText(e instanceof Error ? e.message : String(e));
  }
}

export async function toolComplete(args: {
  projectRoot?: string;
  change?: string;
}) {
  try {
    const { root, config } = await requireProject(args.projectRoot);
    const id = await resolveChangeId(root, config, args.change);
    await writeAgentHandoff(root, config, id);
    const { archivedTo, ctx, promoted } = await completeChange(
      root,
      config,
      id,
    );
    const lines = [
      `Completed ${ctx.id}`,
      archivedTo ? `Archived: ${archivedTo}` : "Pack remains under changes/",
      promoted?.length
        ? `Promoted greenfield → memory: ${promoted.join(", ")}`
        : "",
      `Status: ${ctx.meta.status}`,
    ].filter(Boolean);
    return okText(lines.join("\n"));
  } catch (e) {
    return errText(e instanceof Error ? e.message : String(e));
  }
}

export async function toolHandoff(args: {
  projectRoot?: string;
  change?: string;
}) {
  try {
    const { root, config } = await requireProject(args.projectRoot);
    const id = await resolveChangeId(root, config, args.change);
    await refreshActiveAgentContext(root);
    const path = await writeAgentHandoff(root, config, id);
    const { readFile } = await import("node:fs/promises");
    const body = await readFile(path, "utf8");
    return okText(`Handoff written: ${path}\n\n${body}`);
  } catch (e) {
    return errText(e instanceof Error ? e.message : String(e));
  }
}

export async function toolCodeContext(args: {
  projectRoot?: string;
  paths?: string[];
  symbols?: string[];
  query?: string;
  includeNeighbors?: boolean;
  maxTokens?: number;
  maxFiles?: number;
  maxSlices?: number;
  maxLinesPerSlice?: number;
  format?: "markdown" | "summary";
  writeToChange?: boolean;
  change?: string;
}) {
  try {
    const root = resolveMcpProjectRoot(args.projectRoot);
    let changeId: string | null = null;
    let writeArtifactTo: string | null = null;

    if (await isInitialized(root)) {
      const config = await loadConfig(root);
      try {
        changeId = args.change
          ? await resolveChangeId(root, config, args.change)
          : await getActiveChangeId(root, config);
      } catch {
        changeId = null;
      }
      if (args.writeToChange && changeId) {
        writeArtifactTo = join(
          changePath(root, config, changeId),
          "code-context.md",
        );
      }
    }

    const result = await generateCodeContext({
      projectRoot: root,
      changeId,
      paths: args.paths?.length ? args.paths : undefined,
      symbols: args.symbols?.length ? args.symbols : undefined,
      query: args.query || undefined,
      includeNeighbors: Boolean(args.includeNeighbors),
      writeArtifactTo,
      caps: {
        maxTokensApprox: args.maxTokens ?? 4000,
        maxFiles: args.maxFiles ?? 24,
        maxSlices: args.maxSlices ?? 12,
        maxLinesPerSlice: args.maxLinesPerSlice ?? 60,
        maxOutputLines: 3000,
      },
    });

    if (args.format === "summary") {
      const text = formatJsonSummary(
        result.summary,
        result.gaps,
        result.slices,
        result.ok,
      );
      return result.ok ? okText(text) : errText(text);
    }

    const extra = result.artifactPath
      ? `\n\n_Wrote ${result.artifactPath}_\n`
      : "";
    const text = result.markdown + extra;
    return result.ok ? okText(text) : errText(text);
  } catch (e) {
    return errText(e instanceof Error ? e.message : String(e));
  }
}

export async function toolDoctor(args: { projectRoot?: string }) {
  try {
    const root = resolveMcpProjectRoot(args.projectRoot);
    const lines: string[] = [`Project: ${root}`];
    const init = await isInitialized(root);
    lines.push(init ? "✓ sdd initialized" : "✗ not initialized (sdd init --here --ai …)");
    if (init) {
      const config = await loadConfig(root);
      lines.push(`✓ config loaded`);
      const agent = await loadInstalledAgent(root).catch(() => null);
      if (agent) {
        lines.push(`✓ AI host: ${agent.ai}`);
      } else {
        lines.push("○ no installed AI snapshot (optional for MCP process tools)");
      }
      const active = await getActiveChangeId(root, config);
      lines.push(active ? `✓ active change: ${active}` : "○ no active change");
      const names = await listWorkflowNames(root);
      lines.push(`✓ workflows: ${names.join(", ") || "(none)"}`);
    }
    const node = process.version;
    lines.push(`Node: ${node}`);
    return init ? okText(lines.join("\n")) : errText(lines.join("\n"));
  } catch (e) {
    return errText(e instanceof Error ? e.message : String(e));
  }
}

