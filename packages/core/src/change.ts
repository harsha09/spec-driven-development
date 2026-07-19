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
  activePointerPath,
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
  isStageSkipped,
  loadWorkflow,
  nextStageId,
  resolveStages,
  shouldAutoSkip,
} from "./workflow.js";

export interface CreateChangeInput {
  projectRoot: string;
  config: Config;
  title: string;
  workflowName: string;
  domain?: string;
  flags?: Record<string, boolean | string | number>;
  branch?: string;
}

export interface ChangeContext {
  id: string;
  path: string;
  meta: ChangeMeta;
  workflow: Workflow;
  stages: Stage[];
  active: Stage[];
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

  // Provisional meta so skip_when / flags apply when choosing the first stage
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

  // Keep agent context in sync for Copilot / Claude Code / IDEs
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

    // directory artifacts (e.g. evidence/)
    if (artifact.path.endsWith("/")) {
      await ensureDir(target);
      created.push(artifact.path);
      continue;
    }

    let content = defaultArtifactContent(artifact.id, meta, stage, workflow);
    if (artifact.template) {
      const templatePath = join(tdir, artifact.template.replace(/^templates\//, ""));
      // also try as-is relative to templates dir
      const candidates = [
        join(tdir, artifact.template),
        templatePath,
        join(tdir, `${artifact.id}.md`),
      ];
      for (const c of candidates) {
        if (await pathExists(c)) {
          const raw = await readText(c);
          content = interpolate(raw, meta, stage, workflow);
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

export async function loadChangeMeta(
  projectRoot: string,
  config: Config,
  changeId: string,
): Promise<ChangeMeta> {
  const path = changeMetaPath(projectRoot, config, changeId);
  if (!(await pathExists(path))) {
    throw new Error(`Change not found: ${changeId}`);
  }
  return ChangeMetaSchema.parse(await readYaml(path));
}

export async function saveChangeMeta(
  projectRoot: string,
  config: Config,
  meta: ChangeMeta,
): Promise<void> {
  meta.updated = nowIso();
  await writeYaml(changeMetaPath(projectRoot, config, meta.id), ChangeMetaSchema.parse(meta));
}

export async function buildContext(
  projectRoot: string,
  config: Config,
  changeId: string,
): Promise<ChangeContext> {
  const meta = await loadChangeMeta(projectRoot, config, changeId);
  const workflow = await loadWorkflow(projectRoot, meta.workflow);
  return {
    id: changeId,
    path: changePath(projectRoot, config, changeId),
    meta,
    workflow,
    stages: resolveStages(workflow, meta),
    active: activeStages(workflow, meta),
  };
}

export async function listChanges(projectRoot: string, config: Config): Promise<string[]> {
  return listDirs(changesDir(projectRoot, config));
}

export async function getActiveChangeId(
  projectRoot: string,
  config: Config,
): Promise<string | null> {
  const pointer = activePointerPath(projectRoot, config);
  if (await pathExists(pointer)) {
    const id = (await readText(pointer)).trim();
    if (id && (await pathExists(changePath(projectRoot, config, id)))) {
      return id;
    }
    // Stale pointer (e.g. change archived) — clear it
    if (id) {
      await writeText(pointer, "");
    }
  }
  // fallback: most recently updated in-progress change
  const all = await listChanges(projectRoot, config);
  const inProgress: { id: string; updated: string }[] = [];
  for (const id of all) {
    try {
      const meta = await loadChangeMeta(projectRoot, config, id);
      if (meta.status === "in_progress" || meta.status === "blocked") {
        inProgress.push({ id, updated: meta.updated ?? meta.created });
      }
    } catch {
      // ignore
    }
  }
  if (!inProgress.length) return null;
  inProgress.sort((a, b) => b.updated.localeCompare(a.updated));
  return inProgress[0]!.id;
}

/** Clear active pointer if it points at this change id (does not re-resolve). */
export async function clearActiveIf(
  projectRoot: string,
  config: Config,
  changeId: string,
): Promise<void> {
  const pointer = activePointerPath(projectRoot, config);
  if (!(await pathExists(pointer))) return;
  const id = (await readText(pointer)).trim();
  if (id === changeId) {
    await writeText(pointer, "");
  }
}

export async function setActiveChange(
  projectRoot: string,
  config: Config,
  changeId: string,
): Promise<void> {
  await ensureDir(changesDir(projectRoot, config));
  await writeText(activePointerPath(projectRoot, config), `${changeId}\n`);
}

export async function resolveChangeId(
  projectRoot: string,
  config: Config,
  changeId?: string,
): Promise<string> {
  if (changeId) return changeId;
  const active = await getActiveChangeId(projectRoot, config);
  if (!active) {
    throw new Error("No active change. Pass --change <id> or run `sdd new`.");
  }
  return active;
}

export interface AdvanceResult {
  ctx: ChangeContext;
  from: string;
  to: string | null;
  completed: boolean;
  artifactsCreated: string[];
  warnings: string[];
}

export async function canLeaveStage(
  ctx: ChangeContext,
  config: Config,
): Promise<{ ok: boolean; errors: string[]; warnings: string[] }> {
  const stage = getStage(ctx.workflow, ctx.meta, ctx.meta.stage);
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!stage) {
    return { ok: false, errors: [`Unknown stage: ${ctx.meta.stage}`], warnings };
  }

  // required artifacts
  for (const artifact of stage.artifacts) {
    if (!artifact.required) continue;
    const target = join(ctx.path, artifact.path);
    if (!(await pathExists(target))) {
      errors.push(`Missing required artifact: ${artifact.path}`);
      continue;
    }
    // if file, ensure not only default empty-ish? keep light — just exists
  }

  // Workflow gate types are authoritative. policy.gates=hard may elevate soft→hard;
  // policy.gates=soft never demotes an explicit hard gate (that was a serious bug).
  const declared = stage.gate?.type ?? "soft";
  let effectiveGate = declared;
  if (config.policy.gates === "hard" && declared === "soft") {
    effectiveGate = "hard";
  }

  const gateState = ctx.meta.gates?.[stage.id];
  if (effectiveGate === "hard") {
    if (!gateState || (gateState.status !== "approved" && gateState.status !== "waived")) {
      errors.push(
        `Hard gate on stage "${stage.id}" is not approved. Run \`sdd gate approve\` or complete the checklist.`,
      );
    }
  } else if (effectiveGate === "soft" && stage.gate?.checklist?.length) {
    if (!gateState || gateState.status === "pending") {
      warnings.push(
        `Soft gate checklist not signed off on "${stage.id}" (proceeding allowed).`,
      );
    }
  }

  // Required local verify commands must have succeeded (or human gate approve/waive)
  const requiredCmds = stage.verify?.commands?.filter((c) => c.required) ?? [];
  if (requiredCmds.length) {
    const verifyOk = ctx.meta.verify_results?.[stage.id]?.ok === true;
    const humanOverride =
      gateState?.status === "waived" || gateState?.status === "approved";
    if (!verifyOk && !humanOverride) {
      errors.push(
        `Required local verify commands have not passed for "${stage.id}". Run \`sdd verify\` (or \`sdd gate approve/waive\` with a note).`,
      );
    } else if (!verifyOk && humanOverride) {
      warnings.push(
        `Stage "${stage.id}" gate signed off without a successful required verify run.`,
      );
    }
  }

  return { ok: errors.length === 0, errors, warnings };
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
  // nextStageId already walks past skipped / auto-skipped stages
  const next = nextStageId(ctx.workflow, ctx.meta);

  if (!next) {
    // no more stages — ready for complete, stay on last
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

  // if skipping current stage, move forward (never backward)
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
  // keep stage if exists in new workflow, else first stage
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

export async function approveGate(
  projectRoot: string,
  config: Config,
  changeId: string,
  stageId: string | undefined,
  note?: string,
  status: "approved" | "waived" | "failed" = "approved",
): Promise<ChangeContext> {
  const ctx = await buildContext(projectRoot, config, changeId);
  const id = stageId ?? ctx.meta.stage;
  ctx.meta.gates = {
    ...ctx.meta.gates,
    [id]: { status, note, at: nowIso() },
  };
  await saveChangeMeta(projectRoot, config, ctx.meta);
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
    // allow complete only if on last active stage or force? require last stage
    const active = activeStages(ctx.workflow, ctx.meta);
    const last = active[active.length - 1];
    if (last && ctx.meta.stage !== last.id) {
      throw new Error(
        `Cannot complete: still on stage "${ctx.meta.stage}". Finish remaining stages or skip them. Next: ${next}`,
      );
    }
  }

  // verify leave last stage
  const check = await canLeaveStage(ctx, config);
  if (!check.ok) {
    throw new Error(check.errors.join("\n"));
  }

  ctx.meta.status = "completed";
  ctx.meta.completed_at = nowIso();
  await saveChangeMeta(projectRoot, config, ctx.meta);

  // Clear active pointer before moving the folder (avoids stale pointer bugs)
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

  // reload from archive if moved
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

export function formatStatus(ctx: ChangeContext): string {
  const lines: string[] = [];
  lines.push(`Change: ${ctx.meta.title}`);
  lines.push(`ID:     ${ctx.id}`);
  lines.push(`Status: ${ctx.meta.status}`);
  lines.push(`Workflow: ${ctx.meta.workflow}`);
  lines.push(`Path: ${ctx.path}`);
  lines.push("");
  lines.push("Stages:");
  for (const stage of ctx.stages) {
    const skipped =
      isStageSkipped(ctx.meta, stage.id) || shouldAutoSkip(stage, ctx.meta);
    let mark = " ";
    if (skipped) mark = "·";
    else if (stage.id === ctx.meta.stage) mark = "●";
    else {
      const order = ctx.active.map((s) => s.id);
      const cur = order.indexOf(ctx.meta.stage);
      const idx = order.indexOf(stage.id);
      if (idx >= 0 && cur >= 0 && idx < cur) mark = "✓";
    }
    const gate = ctx.meta.gates?.[stage.id];
    const gateInfo = gate ? ` [${gate.status}]` : "";
    const skipInfo = skipped ? " (skipped)" : "";
    lines.push(`  [${mark}] ${stage.id}${stage.title ? ` — ${stage.title}` : ""}${gateInfo}${skipInfo}`);
  }
  if (ctx.meta.overrides?.skip_stages?.length) {
    lines.push("");
    lines.push(`Overrides: skip=${ctx.meta.overrides.skip_stages.join(", ")}`);
  }
  return lines.join("\n");
}

export async function buildAgentPrompt(ctx: ChangeContext, config: Config, projectRoot: string): Promise<string> {
  const stage = getStage(ctx.workflow, ctx.meta, ctx.meta.stage);
  const parts: string[] = [];
  parts.push(`# SDD Agent Handoff`);
  parts.push("");
  parts.push(`You are implementing a change under Structured Vibe Coding (local SDD).`);
  parts.push("");
  parts.push(`## Change`);
  parts.push(`- Title: ${ctx.meta.title}`);
  parts.push(`- ID: ${ctx.id}`);
  parts.push(`- Workflow: ${ctx.meta.workflow}`);
  parts.push(`- Current stage: ${ctx.meta.stage}${stage?.title ? ` (${stage.title})` : ""}`);
  parts.push(`- Change path: ${ctx.path}`);
  parts.push("");

  if (stage?.summary) {
    parts.push(`## Stage goal`);
    parts.push(stage.summary);
    parts.push("");
  }

  if (stage?.agent_context?.instructions) {
    parts.push(`## Instructions`);
    parts.push(stage.agent_context.instructions);
    parts.push("");
  }

  parts.push(`## Constraints`);
  parts.push(`- Follow artifacts in the change directory as source of truth.`);
  parts.push(`- Do not skip ARB/decision constraints if present.`);
  parts.push(`- Local development only — verify on this machine.`);
  parts.push(`- Prefer small, reviewable commits.`);
  parts.push("");

  parts.push(`## Artifacts to read`);
  const memoryHint = join(projectRoot, config.memory_path);
  parts.push(`- Memory: ${memoryHint}/`);
  for (const s of ctx.stages) {
    for (const a of s.artifacts) {
      parts.push(`- ${join(ctx.path, a.path)}`);
    }
  }
  parts.push("");
  parts.push(`## Current stage artifacts`);
  if (stage) {
    for (const a of stage.artifacts) {
      parts.push(`- ${a.path}${a.required ? " (required)" : ""}`);
    }
  }
  parts.push("");
  parts.push(`When done with this stage, the human will run \`sdd next\` or \`sdd verify\` / \`sdd complete\`.`);

  return parts.join("\n");
}
