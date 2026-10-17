# Code context

> Generated on-demand for agents. Not a substitute for process context
> (.sdd/protocol.md, active-context, change packs).
> Regenerable — run `sdd context --out change` (or pass `--path` / `--symbol`).

## Summary
- Change: Issue #28: phase timestamps and session token import
- Focus paths: packages/core/src/change.ts, packages/core/src/schemas.ts, packages/cli/src/commands.ts
- Focus symbols: (none)
- Keywords: transition, skip, enter, exit, phase, metrics, token, import, command, registration, issue, timestamps, session
- Files analyzed: 3 · Symbols: 26 · Slices: 26
- Truncated: no
- Notes: Focus from explicit paths (3); Change signals from: 2026-10-12-issue-28-phase-timestamps-and-session-token-import

## Gaps
_None._

## Slices

### `packages/cli/src/commands.ts` · `commands` (lines 1248–1270) · seed-path, hop-0, keyword-name×1, keyword-path×1
```ts
export const commands = {
  init,
  new: newCmd,
  greenfield,
  backlog,
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
};
```

### `packages/core/src/change.ts` · `skipStage` (lines 332–380) · seed-path, hop-0, keyword-name×1, exported
```ts
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
  ctx.meta.skipped = [...(ctx.meta.skipped ?? []), { stage: stageId, reason, at: nowIso() }];

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
```

### `packages/core/src/schemas.ts` · `VerifyCommandSchema` (lines 17–21) · seed-path, hop-0, keyword-name×1, exported
```ts
export const VerifyCommandSchema = z.object({
  name: z.string(),
  run: z.string(),
  required: z.boolean().default(false),
});
```

### `packages/core/src/schemas.ts` · `Complexity` (lines 188–188) · seed-path, hop-0, keyword-name×1, exported
```ts
export type Complexity = "low" | "medium" | "high";
```

### `packages/core/src/change.ts` · `CreateChangeInput` (lines 59–67) · seed-path, hop-0, exported
```ts
export interface CreateChangeInput {
  projectRoot: string;
  config: Config;
  title: string;
  workflowName: string;
  domain?: string;
  flags?: Record<string, boolean | string | number>;
  branch?: string;
}
```

### `packages/core/src/change.ts` · `AdvanceResult` (lines 69–76) · seed-path, hop-0, exported
```ts
export interface AdvanceResult {
  ctx: ChangeContext;
  from: string;
  to: string | null;
  completed: boolean;
  artifactsCreated: string[];
  warnings: string[];
}
```

### `packages/core/src/change.ts` · `createChange` (lines 84–135) · seed-path, hop-0, exported
```ts
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
```

### `packages/core/src/change.ts` · `advanceStage` (lines 231–330) · seed-path, hop-0, exported
```ts
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

  // Fall back if pointer jumped past incomplete work (e.g. design stub, already on tasks)
  if (!opts?.force) {
    const fallback = await fallbackIncompleteStageId(ctx);
    if (fallback && fallback !== ctx.meta.stage) {
      const from = ctx.meta.stage;
      ctx.meta.stage = fallback;
      await saveChangeMeta(projectRoot, config, ctx.meta);
      const stage = getStage(ctx.workflow, ctx.meta, fallback)!;
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
        to: fallback,
        completed: false,
        artifactsCreated,
        warnings: [
          ...warnings,
          `Fell back to incomplete stage "${fallback}" (required work not done). Finish it before advancing.`,
        ],
      };
    }
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
```

### `packages/core/src/change.ts` · `switchWorkflow` (lines 382–416) · seed-path, hop-0, exported
```ts
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
```

### `packages/core/src/change.ts` · `completeChange` (lines 418–492) · seed-path, hop-0, exported
```ts
export async function completeChange(
  projectRoot: string,
  config: Config,
  changeId: string,
): Promise<{ archivedTo: string | null; ctx: ChangeContext; promoted?: string[] }> {
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

  let promoted: string[] | undefined;
  if (ctx.meta.workflow === "greenfield" || ctx.meta.flags?.greenfield === true) {
    try {
      const { promoteGreenfieldToMemory } = await import("./greenfield.js");
      promoted = await promoteGreenfieldToMemory(projectRoot, config, changeId);
    } catch {
      // non-fatal
    }
  }

  await clearActiveIf(projectRoot, config, changeId);

  let archivedTo: string | null = null;
  const shouldArchive =
    config.persistence.archive_on_complete && ctx.workflow.on_complete?.archive !== false;

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
      promoted,
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

  return {
    archivedTo,
    promoted,
    ctx: await buildContext(projectRoot, config, changeId),
  };
}
```

### `packages/core/src/schemas.ts` · `GateSchema` (lines 3–8) · seed-path, hop-0, exported
```ts
export const GateSchema = z.object({
  type: z.enum(["none", "soft", "hard"]).default("soft"),
  mode: z.enum(["none", "human_approval", "checklist"]).default("checklist"),
  checklist: z.array(z.string()).default([]),
  overridable: z.boolean().default(true),
});
```

### `packages/core/src/schemas.ts` · `ArtifactDefSchema` (lines 10–15) · seed-path, hop-0, exported
```ts
export const ArtifactDefSchema = z.object({
  id: z.string(),
  path: z.string(),
  template: z.string().optional(),
  required: z.boolean().default(true),
});
```

### `packages/core/src/schemas.ts` · `StageSchema` (lines 23–55) · seed-path, hop-0, exported
```ts
export const StageSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  summary: z.string().optional(),
  /**
   * standard — normal work stage
   * brainstorm — optional multi-approach exploration (before design)
   * clarify — optional Q&A before leaving a major stage
   */
  kind: z.enum(["standard", "brainstorm", "clarify"]).default("standard"),
  /** When true, stage is optional (skippable); agents may skip if not needed */
  optional: z.boolean().default(false),
  artifacts: z.array(ArtifactDefSchema).default([]),
  gate: GateSchema.default({}),
  skippable: z.boolean().default(true),
  skip_when: z
    .object({
      flags: z.array(z.string()).optional(),
    })
    .optional(),
  verify: z
    .object({
      commands: z.array(VerifyCommandSchema).default([]),
      evidence_dir: z.string().optional(),
    })
    .optional(),
  agent_context: z
    .object({
      include: z.array(z.string()).default([]),
      instructions: z.string().optional(),
    })
    .optional(),
});
```

### `packages/core/src/schemas.ts` · `WorkflowSchema` (lines 57–81) · seed-path, hop-0, exported
```ts
export const WorkflowSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  version: z.number().default(1),
  stages: z.array(StageSchema).min(1),
  recommendation: z
    .object({
      when: z
        .object({
          labels: z.array(z.string()).optional(),
          keywords: z.array(z.string()).optional(),
          max_complexity: z.enum(["low", "medium", "high"]).optional(),
          min_complexity: z.enum(["low", "medium", "high"]).optional(),
        })
        .optional(),
      priority: z.number().default(0),
    })
    .optional(),
  on_complete: z
    .object({
      archive: z.boolean().default(false),
      domain_sync: z.enum(["never", "recommend", "require"]).default("never"),
    })
    .optional(),
});
```

### `packages/core/src/schemas.ts` · `ConfigSchema` (lines 83–116) · seed-path, hop-0, exported
```ts
export const ConfigSchema = z.object({
  version: z.number().default(1),
  memory_path: z.string().default("memory"),
  changes_path: z.string().default("changes"),
  archive_path: z.string().default("archive"),
  domains_path: z.string().default("domains"),
  default_workflow: z.string().default("recommend"),
  allowed_workflows: z.array(z.string()).optional(),
  per_change: z
    .object({
      allow_skip: z.boolean().default(true),
      allow_gate_override: z.enum(["true", "false", "soft_only"]).default("soft_only"),
      allow_custom_stages: z.boolean().default(true),
      require_reason_on_skip: z.boolean().default(true),
    })
    .default({}),
  persistence: z
    .object({
      default: z.enum(["change_only", "domain_sync"]).default("change_only"),
      archive_on_complete: z.boolean().default(false),
      domain_sync: z
        .object({
          mode: z.enum(["never", "recommend", "require"]).default("never"),
          anchored_domains: z.array(z.string()).default([]),
        })
        .default({}),
    })
    .default({}),
  policy: z
    .object({
      gates: z.enum(["soft", "hard"]).default("soft"),
    })
    .default({}),
});
```

### `packages/core/src/schemas.ts` · `ChangeMetaSchema` (lines 118–180) · seed-path, hop-0, exported
```ts
export const ChangeMetaSchema = z.object({
  id: z.string(),
  title: z.string(),
  workflow: z.string(),
  created: z.string(),
  updated: z.string().optional(),
  status: z.enum(["in_progress", "blocked", "completed", "abandoned"]).default("in_progress"),
  stage: z.string(),
  branch: z.string().optional(),
  domain: z.string().optional(),
  flags: z.record(z.union([z.boolean(), z.string(), z.number()])).default({}),
  overrides: z
    .object({
      skip_stages: z.array(z.string()).default([]),
      gates: z.record(z.enum(["none", "soft", "hard"])).default({}),
      extra_stages: z.array(StageSchema).default([]),
    })
    .default({}),
  skipped: z
    .array(
      z.object({
        stage: z.string(),
        reason: z.string(),
        at: z.string(),
      }),
    )
    .default([]),
  gates: z
    .record(
      z.object({
        status: z.enum(["pending", "approved", "failed", "waived"]),
        note: z.string().optional(),
        at: z.string().optional(),
      }),
    )
    .default({}),
  /** Results from `sdd verify` keyed by stage id */
  verify_results: z
    .record(
      z.object({
        ok: z.boolean(),
        /** pass | fail | not_run (absent in metas written before 0.17.3) */
        status: z.enum(["pass", "fail", "not_run"]).optional(),
        at: z.string(),
        results: z
          .array(
            z.object({
              name: z.string(),
              exitCode: z.number().nullable(),
            }),
          )
          .default([]),
      }),
    )
    .default({}),
  pr: z
    .object({
      number: z.number().optional(),
      url: z.string().optional(),
    })
    .optional(),
  completed_at: z.string().optional(),
});
```

### `packages/core/src/schemas.ts` · `Gate` (lines 182–182) · seed-path, hop-0, exported
```ts
export type Gate = z.infer<typeof GateSchema>;
```

### `packages/core/src/schemas.ts` · `ArtifactDef` (lines 183–183) · seed-path, hop-0, exported
```ts
export type ArtifactDef = z.infer<typeof ArtifactDefSchema>;
```

### `packages/core/src/schemas.ts` · `Stage` (lines 184–184) · seed-path, hop-0, exported
```ts
export type Stage = z.infer<typeof StageSchema>;
```

### `packages/core/src/schemas.ts` · `Workflow` (lines 185–185) · seed-path, hop-0, exported
```ts
export type Workflow = z.infer<typeof WorkflowSchema>;
```

### `packages/core/src/schemas.ts` · `Config` (lines 186–186) · seed-path, hop-0, exported
```ts
export type Config = z.infer<typeof ConfigSchema>;
```

### `packages/core/src/schemas.ts` · `ChangeMeta` (lines 187–187) · seed-path, hop-0, exported
```ts
export type ChangeMeta = z.infer<typeof ChangeMetaSchema>;
```

### `packages/core/src/change.ts` · `existingChangeIds` (lines 78–82) · seed-path, hop-0
```ts
async function existingChangeIds(projectRoot: string, config: Config): Promise<Set<string>> {
  const open = await listDirs(changesDir(projectRoot, config));
  const archived = await listDirs(archiveDir(projectRoot, config));
  return new Set([...open, ...archived]);
}
```

### `packages/core/src/change.ts` · `materializeStageArtifacts` (lines 137–189) · seed-path, hop-0
```ts
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
          content = interpolate(await readText(c), meta, stage, workflow, {
            idea: String(meta.flags?.idea ?? meta.title ?? ""),
          });
          break;
        }
      }
    } else {
      const fallback = join(tdir, `${artifact.id}.md`);
      if (await pathExists(fallback)) {
        content = interpolate(await readText(fallback), meta, stage, workflow, {
          idea: String(meta.flags?.idea ?? meta.title ?? ""),
        });
      }
    }

    await writeText(target, content);
    created.push(artifact.path);
  }

  return created;
}
```

### `packages/core/src/change.ts` · `interpolate` (lines 191–208) · seed-path, hop-0
```ts
function interpolate(
  template: string,
  meta: ChangeMeta,
  stage: Stage,
  workflow: Workflow,
  extra?: { idea?: string },
): string {
  const idea =
    extra?.idea || String(meta.flags?.idea ?? "") || meta.title.replace(/^Greenfield:\s*/i, "");
  return template
    .replaceAll("{{title}}", meta.title)
    .replaceAll("{{id}}", meta.id)
    .replaceAll("{{workflow}}", workflow.name)
    .replaceAll("{{stage}}", stage.id)
    .replaceAll("{{stage_title}}", stage.title ?? stage.id)
    .replaceAll("{{date}}", meta.created.slice(0, 10))
    .replaceAll("{{idea}}", idea);
}
```

### `packages/core/src/change.ts` · `defaultArtifactContent` (lines 210–229) · seed-path, hop-0
```ts
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
```

## Structural notes
- Ranked files (sample): packages/cli/src/commands.ts, packages/core/src/change.ts, packages/core/src/schemas.ts
