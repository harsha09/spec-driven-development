import { syncChangeHead } from "@structured-vibe-coding/core";
import { defineCommand } from "citty";
import { consola } from "consola";
import pc from "picocolors";
import { withProject } from "./project.js";

export const syncCmd = defineCommand({
  meta: {
    name: "sync",
    description: "Synchronize recorded verification references to the local Git HEAD",
  },
  args: {
    change: { type: "positional", description: "Change id", required: true },
  },
  async run({ args }) {
    await withProject(async ({ root, config }) => {
      const result = await syncChangeHead(root, config, args.change);
      consola.success(`Synchronized ${pc.cyan(result.changeId)} to local HEAD.`);
      consola.log(`Head SHA: ${result.headSha}`);
      consola.log(`Updated verification records: ${result.updatedResults}`);
      if (result.reportUpdated) consola.log("Updated the SDD marker in local-test-results.md.");
      if (result.reportPreserved) {
        consola.warn("Preserved unmarked local-test-results.md; it is not SDD-managed.");
      }
      if (!result.updatedResults && !result.reportUpdated) {
        consola.info("No recorded verification references needed updating.");
      }
      consola.info("Hosted PR bodies are not changed; update them separately if needed.");
    });
  },
});
