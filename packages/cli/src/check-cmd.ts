import {
  backportCompletionErrors,
  buildContext,
  formatBackportPlanningLines,
  parseTasksBackportHints,
  resolveChangeId,
  saveChangeMeta,
  tasksMissingTwinPr,
} from "@structured-vibe-coding/core";
import { defineCommand } from "citty";
import { refreshTwinGitState } from "./backport-git-ops.js";
import { withProject } from "./project.js";

function emit(result: { exitCode: number; stdout: string }): void {
  if (result.stdout.length > 0) {
    process.stdout.write(result.stdout.endsWith("\n") ? result.stdout : `${result.stdout}\n`);
  }
  if (result.exitCode !== 0) process.exit(result.exitCode);
}

export const checkCmd = defineCommand({
  meta: {
    name: "check",
    description: "Validate backport planning and twin merge state for the active change",
  },
  args: {
    change: { type: "string", description: "Change id", alias: "c" },
  },
  async run({ args }) {
    await withProject(async ({ root, config }) => {
      const id = await resolveChangeId(root, config, args.change);
      const ctx = await buildContext(root, config, id);
      ctx.meta = await refreshTwinGitState(root, ctx.meta);
      await saveChangeMeta(root, config, ctx.meta);

      const lines: string[] = [];
      let exitCode = 0;

      const { needsBackport } = await parseTasksBackportHints(ctx.path);
      const missingTasks = tasksMissingTwinPr(ctx.meta, needsBackport);
      if (missingTasks.length) {
        exitCode = 1;
        lines.push(...(await formatBackportPlanningLines(ctx)));
      }

      const completion = backportCompletionErrors(ctx.meta);
      if (completion.length) {
        exitCode = 1;
        if (lines.length) lines.push("");
        lines.push("Incomplete backport twins:");
        for (const err of completion) lines.push(`  ${err}`);
      }

      if (!lines.length) {
        emit({ exitCode: 0, stdout: "Backport checks passed." });
        return;
      }
      emit({ exitCode, stdout: lines.join("\n") });
    });
  },
});
