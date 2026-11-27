import {
  type Config,
  assessTaskProgress,
  buildContext,
  describeProgress,
  nowIso,
  saveChangeMeta,
  taskProgressRecord,
} from "@structured-vibe-coding/core";
import { consola } from "consola";

/**
 * Record task and checklist counts, then stop `sdd next` / `sdd complete`
 * when they are open. `--allow-unchecked` continues and says so.
 * `--strict` blocks even when config policy.task_checks is warn.
 */
export async function enforceTaskProgress(input: {
  root: string;
  config: Config;
  changeId: string;
  action: "next" | "complete";
  allowUnchecked: boolean;
  strict: boolean;
}): Promise<void> {
  if (input.allowUnchecked && input.strict) {
    throw new Error("Use either --allow-unchecked or --strict, not both.");
  }
  const ctx = await buildContext(input.root, input.config, input.changeId);
  const progress = await assessTaskProgress(ctx, input.root);
  ctx.meta.task_progress = taskProgressRecord(progress, nowIso());
  await saveChangeMeta(input.root, input.config, ctx.meta);
  const { blocking, warnings } = describeProgress({
    action: input.action,
    stageId: ctx.meta.stage,
    progress,
  });
  for (const warning of warnings) consola.warn(warning);
  if (!blocking.length) return;
  const block =
    input.strict || (!input.allowUnchecked && input.config.policy.task_checks !== "warn");
  if (!block) {
    if (input.allowUnchecked) consola.warn("Continuing because --allow-unchecked was set.");
    for (const message of blocking) consola.warn(message);
    return;
  }
  for (const message of blocking) consola.error(message);
  process.exit(1);
}
