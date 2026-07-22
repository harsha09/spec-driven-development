/**
 * Stage-scoped refine: plan + brief for the coding agent.
 * Constitution is read-only; prior pack artifacts are impact-scanned;
 * process is never blocked.
 */

import { join } from "pathe";
import type { Config } from "./schemas.js";
import { buildContext, type ChangeContext } from "./change-context.js";
import { pathExists, writeText } from "./fs.js";
import { memoryDir, sddRoot } from "./paths.js";
import {
  getStage,
  isStageSkipped,
  resolveStages,
  shouldAutoSkip,
} from "./workflow.js";

export type RefineMode = "refine" | "analyze";

export interface BuildRefinePlanOptions {
  projectRoot: string;
  config: Config;
  changeId: string;
  /** Stage to refine (default: current meta.stage) */
  stageId?: string;
  /** Only edit focus-stage files; still read prior + constitution */
  focusOnly?: boolean;
  mode?: RefineMode;
}

export interface RefineArtifactRef {
  stageId: string;
  path: string;
  required: boolean;
  absPath: string;
}

export interface RefinePlan {
  changeId: string;
  title: string;
  workflow: string;
  focusStageId: string;
  focusStageTitle: string;
  mode: RefineMode;
  focusOnly: boolean;
  focusArtifacts: RefineArtifactRef[];
  priorArtifacts: RefineArtifactRef[];
  laterArtifacts: RefineArtifactRef[];
  constitutionPath: string;
  constitutionExists: boolean;
  changePath: string;
  briefPath: string;
  reportPath: string;
  openItemsPath: string;
  /** Short CLI kickoff line */
  kickoff: string;
  /** Full brief markdown written to briefPath */
  briefMarkdown: string;
}

function stageArtifactRefs(
  ctx: ChangeContext,
  stageId: string,
): RefineArtifactRef[] {
  const stage = getStage(ctx.workflow, ctx.meta, stageId);
  if (!stage) return [];
  return stage.artifacts.map((a) => ({
    stageId,
    path: a.path,
    required: Boolean(a.required),
    absPath: join(ctx.path, a.path),
  }));
}

function listMarkdown(refs: RefineArtifactRef[]): string {
  if (!refs.length) return "_None._";
  return refs
    .map(
      (r) =>
        `- \`${r.path}\` (stage \`${r.stageId}\`${r.required ? ", required" : ""}) → \`${r.absPath}\``,
    )
    .join("\n");
}

/**
 * Build a refine plan for the active (or given) change and optional stage.
 */
export async function buildRefinePlan(
  opts: BuildRefinePlanOptions,
): Promise<RefinePlan> {
  const ctx = await buildContext(
    opts.projectRoot,
    opts.config,
    opts.changeId,
  );
  const mode: RefineMode = opts.mode ?? "refine";
  const focusOnly = Boolean(opts.focusOnly);
  const focusStageId = opts.stageId?.trim() || ctx.meta.stage;

  const all = resolveStages(ctx.workflow, ctx.meta);
  const focusIdx = all.findIndex((s) => s.id === focusStageId);
  if (focusIdx < 0) {
    const ids = all.map((s) => s.id).join(", ");
    throw new Error(
      `Unknown stage "${focusStageId}" for workflow "${ctx.meta.workflow}". Stages: ${ids || "(none)"}`,
    );
  }

  if (
    isStageSkipped(ctx.meta, focusStageId) ||
    shouldAutoSkip(all[focusIdx]!, ctx.meta)
  ) {
    throw new Error(
      `Stage "${focusStageId}" is skipped for this change. Un-skip it or pick another stage.`,
    );
  }

  const focusStage = all[focusIdx]!;
  const priorArtifacts: RefineArtifactRef[] = [];
  for (let i = 0; i < focusIdx; i++) {
    const s = all[i]!;
    if (isStageSkipped(ctx.meta, s.id) || shouldAutoSkip(s, ctx.meta)) continue;
    priorArtifacts.push(...stageArtifactRefs(ctx, s.id));
  }

  const laterArtifacts: RefineArtifactRef[] = [];
  for (let i = focusIdx + 1; i < all.length; i++) {
    const s = all[i]!;
    if (isStageSkipped(ctx.meta, s.id) || shouldAutoSkip(s, ctx.meta)) continue;
    laterArtifacts.push(...stageArtifactRefs(ctx, s.id));
  }

  const focusArtifacts = stageArtifactRefs(ctx, focusStageId);
  const constitutionPath = join(memoryDir(opts.projectRoot, opts.config), "constitution.md");
  const constitutionExists = await pathExists(constitutionPath);
  const briefPath = join(ctx.path, "refine-brief.md");
  const reportPath = join(ctx.path, "quality-report.md");
  const openItemsPath = join(ctx.path, "open-items.md");

  const briefMarkdown = buildRefineBriefMarkdown({
    ctx,
    focusStageId,
    focusStageTitle: focusStage.title ?? focusStageId,
    mode,
    focusOnly,
    focusArtifacts,
    priorArtifacts,
    laterArtifacts,
    constitutionPath,
    constitutionExists,
    reportPath,
    openItemsPath,
  });

  const kickoff = [
    `SDD: ${mode} stage \`${focusStageId}\`.`,
    `Title: ${ctx.meta.title}`,
    `Change: ${ctx.id}`,
    `Read first: ${briefPath}`,
    `Also: .sdd/protocol.md, .sdd/active-context.md`,
    constitutionExists
      ? `Constitution (READ-ONLY): ${constitutionPath}`
      : `No constitution.md found (optional).`,
    mode === "analyze"
      ? `Mode ANALYZE: write findings to ${reportPath} only — do not edit pack artifacts.`
      : `Mode REFINE: improve focus-stage artifacts; impact-scan prior pack files (fix mechanical inconsistencies; highlight judgment calls). Never edit constitution. Do not run sdd next.`,
    focusOnly
      ? `focusOnly=true: edit only focus-stage files (still read prior + constitution).`
      : `Prior artifacts may be auto-fixed for clear contradictions/term drift; scope changes → highlight + open-items (human accept).`,
  ].join(" ");

  return {
    changeId: ctx.id,
    title: ctx.meta.title,
    workflow: ctx.meta.workflow,
    focusStageId,
    focusStageTitle: focusStage.title ?? focusStageId,
    mode,
    focusOnly,
    focusArtifacts,
    priorArtifacts,
    laterArtifacts,
    constitutionPath,
    constitutionExists,
    changePath: ctx.path,
    briefPath,
    reportPath,
    openItemsPath,
    kickoff,
    briefMarkdown,
  };
}

function buildRefineBriefMarkdown(opts: {
  ctx: ChangeContext;
  focusStageId: string;
  focusStageTitle: string;
  mode: RefineMode;
  focusOnly: boolean;
  focusArtifacts: RefineArtifactRef[];
  priorArtifacts: RefineArtifactRef[];
  laterArtifacts: RefineArtifactRef[];
  constitutionPath: string;
  constitutionExists: boolean;
  reportPath: string;
  openItemsPath: string;
}): string {
  const {
    ctx,
    focusStageId,
    focusStageTitle,
    mode,
    focusOnly,
    focusArtifacts,
    priorArtifacts,
    laterArtifacts,
    constitutionPath,
    constitutionExists,
    reportPath,
    openItemsPath,
  } = opts;

  return `# Refine brief (auto-generated)

> Change: **${ctx.meta.title}** · \`${ctx.id}\`  
> Workflow: \`${ctx.meta.workflow}\` · Focus stage: **${focusStageId}** (${focusStageTitle})  
> Mode: **${mode}** · focusOnly: **${focusOnly}**  
> Regenerable: run \`sdd refine${focusStageId !== ctx.meta.stage ? ` ${focusStageId}` : ""}\` again.

## Mission

You are the **SDD refine** agent (one agent, mode \`${mode}\`).

1. Work by **stage**, not hard-coded filenames. Focus stage resolves to the files below.
2. **Never edit** \`memory/constitution.md\` (or any constitution path). Read it as constraints only.
3. **Do not** run \`sdd next\`, \`sdd complete\`, or change \`meta.yaml\` stage/status.
4. Process is **never blocked** by findings — report and improve docs only.

## Constitution (READ-ONLY)

${
  constitutionExists
    ? `- Path: \`${constitutionPath}\` — **read only**. Conflicts → highlight in report / open items; do not "fix" constitution.`
    : `- No constitution at \`${constitutionPath}\` — skip.`
}

## Focus stage artifacts (primary ${mode === "analyze" ? "review" : "edit"} target)

${listMarkdown(focusArtifacts)}

## Prior stage artifacts (pack trail — always read)

${listMarkdown(priorArtifacts)}

${
  focusOnly
    ? `**focusOnly:** Do **not** edit prior files. Still read them for consistency. Highlight conflicts for the human.`
    : `**Auto prior impact (required):** After refining the focus stage, use search (\`rg\` / grep) across the change pack for terms, claims, and names you changed. For each hit on a **prior** artifact:
- **Fix** mechanical inconsistencies (contradictions, renamed terms, outdated references that clearly disagree with the refined focus).
- **Highlight** (do not silently rewrite) product/scope judgment calls — put them under Open items only if the human should explicitly accept/defer.
- Keep prior edits **minimal** — no drive-by rewrites of history.`
}

## Later stage artifacts (usually leave alone)

${listMarkdown(laterArtifacts)}

Do **not** invent content for later stages that were not materialized yet. If a later file exists and contradicts the refined focus, **highlight** only (unless the human asked to align the whole pack).

## Mode-specific rules

### analyze
- Write/update \`${reportPath}\` with findings (markdown).
- Sections: Summary · Findings (with IDs AMB-001…) · Open items (explicitly accepted only) · Disposition suggestions.
- **Do not** edit focus/prior pack artifacts (report only).

### refine
- Improve **focus** stage artifacts so this step is clear, consistent, and useful.
- Run impact scan on **prior** pack artifacts (unless focusOnly); fix mechanical issues; highlight judgment calls.
- Append a short "Refine log" at the bottom of \`${reportPath}\` (what changed, prior fixes, highlights).
- **Open items:** only move something into \`${openItemsPath}\` (or an Open items section) when the human has **explicitly accepted** deferral/acceptance with a note — or list candidates under "Proposed open items (awaiting human)" in the report. Never silently park hard questions as open items.

## Tools

- Prefer reading full pack markdown for specs.
- Use \`rg\`/\`grep\` for impact after edits (old terms, paths, API names).
- Optional product code context: \`sdd context --path … --symbol …\` (AST slices) — do not dump the whole repo.

## Done when

- Focus stage artifacts are coherent for stage \`${focusStageId}\`.
- Prior trail has no unaddressed **mechanical** contradictions (or focusOnly + highlights).
- Constitution was not modified.
- User can continue with \`sdd next\` when *they* are ready (you do not advance).
`;
}

/** Write refine brief under the change pack (and a pointer under .sdd/). */
export async function writeRefineBrief(plan: RefinePlan, projectRoot: string): Promise<string> {
  await writeText(plan.briefPath, plan.briefMarkdown);
  const pointer = join(sddRoot(projectRoot), "refine-brief.md");
  await writeText(
    pointer,
    `# Refine brief pointer

Active refine brief: \`${plan.briefPath}\`

Run: \`sdd refine${plan.focusStageId ? ` ${plan.focusStageId}` : ""}\`

`,
  );
  return plan.briefPath;
}
