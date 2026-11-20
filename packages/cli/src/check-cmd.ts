import {
  backportCompletionErrors,
  buildContext,
  formatBackportPlanningLines,
  getActiveChangeId,
  parseTasksBackportHints,
  resolveChangeId,
  runDecisionCheck,
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
    description:
      "Check decision references, and backport planning and twin merge state for the active change",
  },
  args: {
    change: { type: "string", description: "Change id", alias: "c" },
  },
  async run({ args }) {
    await withProject(async ({ root, config }) => {
      const sections: string[] = [];
      let exitCode = 0;

      const decisions = await runDecisionCheck(root, config);
      if (decisions.exitCode !== 0) exitCode = decisions.exitCode;
      if (decisions.stdout) sections.push(decisions.stdout);

      // Backport checks need a change. With no active change and no --change, skip them.
      const hasChange = Boolean(args.change) || Boolean(await getActiveChangeId(root, config));
      if (hasChange) {
        const id = await resolveChangeId(root, config, args.change);
        const ctx = await buildContext(root, config, id);
        // A check only reads. Write meta.yaml back only when a twin's recorded state changed,
        // so running it does not dirty the working tree.
        const before = JSON.stringify(ctx.meta.backports ?? []);
        ctx.meta = await refreshTwinGitState(root, ctx.meta);
        if (JSON.stringify(ctx.meta.backports ?? []) !== before) {
          await saveChangeMeta(root, config, ctx.meta);
        }

        const lines: string[] = [];
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

        sections.push(lines.length ? lines.join("\n") : "Backport checks passed.");
      }

      emit({ exitCode, stdout: sections.join("\n\n") });
    });
  },
});
