import { join } from "pathe";
import type { Config } from "./schemas.js";
import { pathExists } from "./fs.js";
import { getStage } from "./workflow.js";
import { nowIso } from "./slug.js";
import {
  buildContext,
  saveChangeMeta,
  type ChangeContext,
} from "./change-context.js";

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

  for (const artifact of stage.artifacts) {
    if (!artifact.required) continue;
    const target = join(ctx.path, artifact.path);
    if (!(await pathExists(target))) {
      errors.push(`Missing required artifact: ${artifact.path}`);
    }
  }

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

  return { ok: errors.length === 0, errors, warnings };
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
