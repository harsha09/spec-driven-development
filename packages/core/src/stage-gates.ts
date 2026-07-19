import { join } from "pathe";
import type { Config } from "./schemas.js";
import { pathExists, readText } from "./fs.js";
import {
  activeStages,
  getStage,
  isStageSkipped,
  shouldAutoSkip,
} from "./workflow.js";
import { nowIso } from "./slug.js";
import { incompleteArtifactReason } from "./artifacts.js";
import {
  buildContext,
  saveChangeMeta,
  type ChangeContext,
} from "./change-context.js";

async function checkRequiredArtifacts(
  changePath: string,
  stageId: string,
  artifacts: { path: string; required?: boolean }[],
): Promise<string[]> {
  const errors: string[] = [];
  for (const artifact of artifacts) {
    if (!artifact.required) continue;
    if (artifact.path.endsWith("/")) {
      const target = join(changePath, artifact.path);
      if (!(await pathExists(target))) {
        errors.push(`Missing required directory: ${artifact.path} (stage ${stageId})`);
      }
      continue;
    }
    const target = join(changePath, artifact.path);
    if (!(await pathExists(target))) {
      errors.push(incompleteArtifactReason(artifact.path, null)!);
      continue;
    }
    const content = await readText(target);
    const reason = incompleteArtifactReason(artifact.path, content);
    if (reason) {
      errors.push(`${reason} (stage ${stageId})`);
    }
  }
  return errors;
}

/**
 * Prior non-skipped stages with required work must be complete before leaving
 * the current stage (prevents jumping intent → tasks with empty design).
 */
export async function incompletePriorStageErrors(
  ctx: ChangeContext,
): Promise<string[]> {
  const errors: string[] = [];
  const stages = activeStages(ctx.workflow, ctx.meta);
  const currentIdx = stages.findIndex((s) => s.id === ctx.meta.stage);
  if (currentIdx <= 0) return errors;

  for (let i = 0; i < currentIdx; i++) {
    const stage = stages[i]!;
    if (isStageSkipped(ctx.meta, stage.id) || shouldAutoSkip(stage, ctx.meta)) {
      continue;
    }
    // Optional clarify/brainstorm with no required artifacts: skip prior check
    const required = stage.artifacts.filter((a) => a.required);
    if (!required.length && stage.optional) continue;

    const stageErrors = await checkRequiredArtifacts(
      ctx.path,
      stage.id,
      stage.artifacts,
    );
    if (stageErrors.length) {
      errors.push(
        `Prior stage "${stage.id}" is not complete — finish it or \`sdd skip ${stage.id} -r "…"\` if optional.`,
      );
      errors.push(...stageErrors);
    }
  }
  return errors;
}

/** Artifact + gate + verify checks before leaving the current stage. */
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

  // Never leave an incomplete prior stage (e.g. landed on tasks with empty design)
  errors.push(...(await incompletePriorStageErrors(ctx)));

  errors.push(
    ...(await checkRequiredArtifacts(ctx.path, stage.id, stage.artifacts)),
  );

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

  // Optional stages: remind agent/human they can skip
  if (stage.optional || stage.kind === "clarify" || stage.kind === "brainstorm") {
    warnings.push(
      `Stage "${stage.id}" is optional (${stage.kind ?? "optional"}). Skip with: sdd skip ${stage.id} -r "not needed"`,
    );
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * If meta.stage points past incomplete required work, return the earliest
 * incomplete stage id to fall back to (e.g. design).
 */
export async function fallbackIncompleteStageId(
  ctx: ChangeContext,
): Promise<string | null> {
  const stages = activeStages(ctx.workflow, ctx.meta);
  for (const stage of stages) {
    if (stage.id === ctx.meta.stage) break;
    if (isStageSkipped(ctx.meta, stage.id) || shouldAutoSkip(stage, ctx.meta)) {
      continue;
    }
    const required = stage.artifacts.filter((a) => a.required);
    if (!required.length && stage.optional) continue;
    const errs = await checkRequiredArtifacts(ctx.path, stage.id, stage.artifacts);
    if (errs.length) return stage.id;
  }
  return null;
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
