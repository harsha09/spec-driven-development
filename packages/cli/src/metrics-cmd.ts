import { importSessionMetrics, resolveChangeId } from "@structured-vibe-coding/core";
import { defineCommand } from "citty";
import { consola } from "consola";
import pc from "picocolors";
import { withProject } from "./project.js";

const importUsage = defineCommand({
  meta: {
    name: "import",
    description: "Import measured token usage from a Claude Code or Codex session log",
  },
  args: {
    sessionLog: {
      type: "positional",
      description: "Claude Code or Codex JSONL session log",
      required: true,
    },
    change: { type: "string", description: "Change id (default: active change)", alias: "c" },
  },
  async run({ args }) {
    await withProject(async ({ root, config }) => {
      const changeId = await resolveChangeId(root, config, args.change);
      const result = await importSessionMetrics(root, config, changeId, args.sessionLog);
      if (!result.providers.length) {
        throw new Error("No Claude Code or Codex token usage records found in the session log.");
      }
      consola.success(`Imported ${result.imported} measured request(s) into ${pc.cyan(changeId)}.`);
      consola.log(
        `Duplicates: ${result.duplicates} · Unmatched phase: ${result.unmatched} · Ignored: ${result.ignored}`,
      );
      consola.log(`Providers: ${result.providers.join(", ")}`);
    });
  },
});

export const metricsCmd = defineCommand({
  meta: { name: "metrics", description: "Change timing and measured token usage" },
  subCommands: { import: importUsage },
});
