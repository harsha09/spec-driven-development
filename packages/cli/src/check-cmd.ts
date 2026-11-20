import { runDecisionCheck } from "@structured-vibe-coding/core";
import { defineCommand } from "citty";
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
    description: "Warn on unknown decision-ref ids; note decisions not yet cited in tests",
  },
  async run() {
    await withProject(async ({ root, config }) => {
      emit(await runDecisionCheck(root, config));
    });
  },
});
