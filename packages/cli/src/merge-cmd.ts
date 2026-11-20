import { mergeWithGateGuard, resolveChangeId } from "@structured-vibe-coding/core";
import { defineCommand } from "citty";
import { withProject } from "./project.js";

export const mergeCmd = defineCommand({
  meta: {
    name: "merge",
    description: "Merge a branch when required gates are fresh on the current HEAD",
  },
  args: {
    branch: {
      type: "positional",
      description: "Branch to merge into the current HEAD",
      required: true,
    },
    change: { type: "string", description: "Change id", alias: "c" },
  },
  async run({ args }) {
    await withProject(async ({ root, config }) => {
      const changeId = await resolveChangeId(root, config, args.change);
      const result = await mergeWithGateGuard({
        projectRoot: root,
        config,
        changeId,
        branch: args.branch,
      });
      if (result.stdout.length > 0) {
        process.stdout.write(result.stdout.endsWith("\n") ? result.stdout : `${result.stdout}\n`);
      }
      if (result.exitCode !== 0) process.exit(result.exitCode);
    });
  },
});
