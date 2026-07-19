import { join } from "pathe";
import {
  ChangeMetaSchema,
  type ChangeMeta,
  type Config,
  type Workflow,
  type Stage,
} from "./schemas.js";
import {
  ensureDir,
  listDirs,
  pathExists,
  readText,
  readYaml,
  writeText,
  writeYaml,
  copyDir,
  removePath,
} from "./fs.js";
import {
  archiveDir,
  changeMetaPath,
  changePath,
  changesDir,
  templatesDir,
} from "./paths.js";
import { changeDirName, nowIso, uniqueChangeDirName } from "./slug.js";
import {
  activeStages,
  firstActiveStageId,
  getStage,
  loadWorkflow,
  nextStageId,
} from "./workflow.js";
import {
  buildContext,
  clearActiveIf,
  saveChangeMeta,
  setActiveChange,
  type ChangeContext,
} from "./change-context.js";
import { canLeaveStage } from "./stage-gates.js";

// Re-export split modules so public API stays `from "./change.js"` / core index
export type { ChangeContext } from "./change-context.js";
export {
  buildContext,
  clearActiveIf,
  getActiveChangeId,
  listChanges,
  loadChangeMeta,
  resolveChangeId,
  saveChangeMeta,
  setActiveChange,
} from "./change-context.js";
export { canLeaveStage, approveGate } from "./stage-gates.js";
export { formatStatus, buildAgentPrompt } from "./agent-handoff.js";

export interface CreateChangeInput {
  projectRoot: string;
  config: Config;
  title: string;
  workflowName: string;
  domain?: string;
  flags?: Record<string, boolean | string | number>;
  branch?: string;
}

export interface AdvanceResult {
  ctx: ChangeContext;
  from: string;
  to: string | null;
  completed: boolean;
  artifactsCreated: string[];
  warnings: string[];
}

async function existingChangeIds(projectRoot: string, config: Config): Promise<Set<string>> {
  const open = await listDirs(changesDir(projectRoot, config));
  const archived = await listDirs(archiveDir(projectRoot, config));
  return new Set([...open, ...archived]);
}

export async function createChange(input: CreateChangeInput): Promise<ChangeContext> {
  const { projectRoot, config, title, workflowName } = input;
  const workflow = await loadWorkflow(projectRoot, workflowName);
  if (!workflow.stages.length) {
    throw new Error(`Workflow ${workflowName} has no stages`);
  }

  const baseId = changeDirName(title);
  const id = uniqueChangeDirName(baseId, await existingChangeIds(projectRoot, config));
  const dir = changePath(projectRoot, config, id);
  await ensureDir(dir);

  let meta: ChangeMeta = ChangeMetaSchema.parse({
    id,
    title,
    workflow: workflowName,
    created: nowIso(),
    updated: nowIso(),
    status: "in_progress",
    stage: workflow.stages[0]!.id,
    domain: input.domain,
    branch: input.branch,
    flags: input.flags ?? {},
    overrides: {
      skip_stages: [],
      gates: {},
      extra_stages: [],
    },
    skipped: [],
    gates: {},
  });

  const startId = firstActiveStageId(workflow, meta) ?? workflow.stages[0]!.id;
  meta = { ...meta, stage: startId };
  const firstStage = getStage(workflow, meta, startId);
  if (!firstStage) {
    throw new Error(`Workflow ${workflowName} has no active stages`);
  }

  await writeYaml(changeMetaPath(projectRoot, config, id), meta);
  await materializeStageArtifacts(projectRoot, config, id, workflow, meta, firstStage);
  await setActiveChange(projectRoot, config, id);

  try {
    const { refreshActiveAgentContext } = await import("./agents.js");
    await refreshActiveAgentContext(projectRoot);
  } catch {
    // optional
  }

  return buildContext(projectRoot, config, id);
}

async function materializeStageArtifacts(
  projectRoot: string,
  config: Config,
  changeId: string,
  workflow: Workflow,
  meta: ChangeMeta,
  stage: Stage,
): Promise<string[]> {
  const created: string[] = [];
  const dir = changePath(projectRoot, config, changeId);
  const tdir = templatesDir(projectRoot);

  for (const artifact of stage.artifacts) {
    const target = join(dir, artifact.path);
    if (await pathExists(target)) continue;

    if (artifact.path.endsWith("/")) {
      await ensureDir(target);
      created.push(artifact.path);
      continue;
    }

    let content = defaultArtifactContent(artifact.id, meta, stage, workflow);
    if (artifact.template) {
      const templatePath = join(tdir, artifact.template.replace(/^templates\//, ""));
      const candidates = [
        join(tdir, artifact.template),
        templatePath,
        join(tdir, `${artifact.id}.md`),
      ];
      for (const c of candidates) {
        if (await pathExists(c)) {
          content = interpolate(await readText(c), meta, stage, workflow);
          break;
        }
      }
    } else {
      const fallback = join(tdir, `${artifact.id}.md`);
      if (await pathExists(fallback)) {
        content = interpolate(await readText(fallback), meta, stage, workflow);
      }
    }

    await writeText(target, content);
    created.push(artifact.path);
  }

  return created;
}

function interpolate(template: string, meta: ChangeMeta, stage: Stage, workflow: Workflow): string {
  return template
    .replaceAll("{{title}}", meta.title)
    .replaceAll("{{id}}", meta.id)
    .replaceAll("{{workflow}}", workflow.name)
    .replaceAll("{{stage}}", stage.id)
    .replaceAll("{{stage_title}}", stage.title ?? stage.id)
    .replaceAll("{{date}}", meta.created.slice(0, 10));
}

function defaultArtifactContent(
  artifactId: string,
  meta: ChangeMeta,
  stage: Stage,
  workflow: Workflow,
): string {
  return `# ${artifactId}

> Change: **${meta.title}** (\`${meta.id}\`)  
> Workflow: \`${workflow.name}\` · Stage: \`${stage.id}\`

## Summary

<!-- Write the intent / content for this artifact -->

## Notes

-
`;
}

export async function advanceStage(
  projectRoot: string,
  config: Config,
  changeId: string,
  opts?: { force?: boolean },
): Promise<AdvanceResult> {
  const ctx = await buildContext(projectRoot, config, changeId);
  const warnings: string[] = [];

  if (ctx.meta.status === "completed") {
    throw new Error("Change is already completed.");
  }

  const check = await canLeaveStage(ctx, config);
  warnings.push(...check.warnings);
  if (!check.ok && !opts?.force) {
    throw new Error(check.errors.join("\n"));
  }

  const from = ctx.meta.stage;
  const next = nextStageId(ctx.workflow, ctx.meta);

  if (!next) {
    return {
      ctx,
      from,
      to: null,
      completed: false,
      artifactsCreated: [],
      warnings: [...warnings, "No further stages. Run `sdd complete` when ready."],
    };
  }

  ctx.meta.stage = next;
  await saveChangeMeta(projectRoot, config, ctx.meta);

  const stage = getStage(ctx.workflow, ctx.meta, next)!;
  const artifactsCreated = await materializeStageArtifacts(
    projectRoot,
    config,
    changeId,
    ctx.workflow,
    ctx.meta,
    stage,
  );

  try {
    const { refreshActiveAgentContext } = await import("./agents.js");
    await refreshActiveAgentContext(projectRoot);
  } catch {
    // optional
  }

  const updated = await buildContext(projectRoot, config, changeId);
  return {
    ctx: updated,
    from,
    to: next,
    completed: false,
    artifactsCreated,
    warnings,
  };
}

export async function skipStage(
  projectRoot: string,
  config: Config,
  changeId: string,
  stageId: string,
  reason: string,
): Promise<ChangeContext> {
  if (!config.per_change.allow_skip) {
    throw new Error("Skipping stages is disabled in .sdd/config.yaml (per_change.allow_skip).");
  }
  if (config.per_change.require_reason_on_skip && !reason.trim()) {
    throw new Error("A reason is required to skip a stage.");
  }

  const ctx = await buildContext(projectRoot, config, changeId);
  const stage = getStage(ctx.workflow, ctx.meta, stageId);
  if (!stage) {
    throw new Error(`Stage "${stageId}" not found in workflow ${ctx.meta.workflow}`);
  }
  if (!stage.skippable) {
    throw new Error(`Stage "${stageId}" is not skippable.`);
  }

  const skip_stages = new Set(ctx.meta.overrides.skip_stages ?? []);
  skip_stages.add(stageId);
  ctx.meta.overrides.skip_stages = [...skip_stages];
  ctx.meta.skipped = [
    ...(ctx.meta.skipped ?? []),
    { stage: stageId, reason, at: nowIso() },
  ];

  if (ctx.meta.stage === stageId) {
    const next = nextStageId(ctx.workflow, ctx.meta);
    if (next) {
      ctx.meta.stage = next;
      const nextStage = getStage(ctx.workflow, ctx.meta, next);
      if (nextStage) {
        await materializeStageArtifacts(
          projectRoot,
          config,
          changeId,
          ctx.workflow,
          ctx.meta,
          nextStage,
        );
      }
    }
  }

  await saveChangeMeta(projectRoot, config, ctx.meta);
  return buildContext(projectRoot, config, changeId);
}

export async function switchWorkflow(
  projectRoot: string,
  config: Config,
  changeId: string,
  workflowName: string,
  reason?: string,
): Promise<ChangeContext> {
  const ctx = await buildContext(projectRoot, config, changeId);
  const workflow = await loadWorkflow(projectRoot, workflowName);

  if (config.allowed_workflows?.length && !config.allowed_workflows.includes(workflowName)) {
    throw new Error(
      `Workflow "${workflowName}" is not in allowed_workflows: ${config.allowed_workflows.join(", ")}`,
    );
  }

  ctx.meta.workflow = workflowName;
  const hasStage = workflow.stages.some((s) => s.id === ctx.meta.stage);
  if (!hasStage) {
    ctx.meta.stage = workflow.stages[0]!.id;
  }
  if (reason) {
    ctx.meta.flags = {
      ...ctx.meta.flags,
      workflow_switch_reason: reason,
    };
  }

  await saveChangeMeta(projectRoot, config, ctx.meta);
  const stage = getStage(workflow, ctx.meta, ctx.meta.stage);
  if (stage) {
    await materializeStageArtifacts(projectRoot, config, changeId, workflow, ctx.meta, stage);
  }
  return buildContext(projectRoot, config, changeId);
}

export async function completeChange(
  projectRoot: string,
  config: Config,
  changeId: string,
): Promise<{ archivedTo: string | null; ctx: ChangeContext }> {
  const ctx = await buildContext(projectRoot, config, changeId);
  const next = nextStageId(ctx.workflow, ctx.meta);
  if (next) {
    const active = activeStages(ctx.workflow, ctx.meta);
    const last = active[active.length - 1];
    if (last && ctx.meta.stage !== last.id) {
      throw new Error(
        `Cannot complete: still on stage "${ctx.meta.stage}". Finish remaining stages or skip them. Next: ${next}`,
      );
    }
  }

  const check = await canLeaveStage(ctx, config);
  if (!check.ok) {
    throw new Error(check.errors.join("\n"));
  }

  ctx.meta.status = "completed";
  ctx.meta.completed_at = nowIso();
  await saveChangeMeta(projectRoot, config, ctx.meta);

  await clearActiveIf(projectRoot, config, changeId);

  let archivedTo: string | null = null;
  const shouldArchive =
    config.persistence.archive_on_complete &&
    (ctx.workflow.on_complete?.archive !== false);

  if (shouldArchive) {
    const dest = join(archiveDir(projectRoot, config), changeId);
    if (await pathExists(dest)) {
      throw new Error(`Archive already exists for change: ${changeId}`);
    }
    await ensureDir(archiveDir(projectRoot, config));
    await copyDir(ctx.path, dest);
    await removePath(ctx.path);
    archivedTo = dest;
  }

  if (archivedTo) {
    const meta = ChangeMetaSchema.parse(await readYaml(join(archivedTo, "meta.yaml")));
    return {
      archivedTo,
      ctx: {
        id: changeId,
        path: archivedTo,
        meta,
        workflow: ctx.workflow,
        stages: ctx.stages,
        active: ctx.active,
      },
    };
  }

  return { archivedTo, ctx: await buildContext(projectRoot, config, changeId) };
}
