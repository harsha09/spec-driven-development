import {
  type DiscoverResult,
  discoverAndImportMetrics,
  importSessionMetrics,
  loadPrices,
  reportAllChanges,
  reportChange,
  resolveChangeId,
} from "@structured-vibe-coding/core";
import { defineCommand } from "citty";
import { consola } from "consola";
import pc from "picocolors";
import { withProject } from "./project.js";

async function importLog(
  sessionLog: string | undefined,
  change: string | undefined,
): Promise<void> {
  if (!sessionLog) {
    throw new Error("Usage: sdd metrics import <session-log> [--change <id>]");
  }
  await withProject(async ({ root, config }) => {
    const changeId = await resolveChangeId(root, config, change);
    const result = await importSessionMetrics(root, config, changeId, sessionLog);
    if (!result.providers.length) {
      throw new Error(
        "No Claude Code, Codex, or Grok token usage records found in the session log.",
      );
    }
    if (result.incomplete) {
      consola.warn("Grok usage is incomplete; recorded tokens may under-count.");
    }
    consola.success(`Imported ${result.imported} measured request(s) into ${pc.cyan(changeId)}.`);
    consola.log(
      `Duplicates: ${result.duplicates} · Unmatched phase: ${result.unmatched} · Ignored: ${result.ignored}`,
    );
    consola.log(`Providers: ${result.providers.join(", ")}`);
  });
}

function printDiscovery(result: DiscoverResult): void {
  if (result.sessionsFound === 0) {
    consola.warn("No agent session logs found for this project. Searched:");
    for (const place of result.searched) consola.log(`  ${place}`);
    consola.log(
      `Import a log by hand: ${pc.cyan("sdd metrics import <path>")} (Claude Code or Codex JSONL, Grok usage.json or session folder).`,
    );
    return;
  }
  const found = `${result.sessionsFound} session log(s)`;
  if (result.imported === 0) {
    consola.info(`Checked ${found}: no new usage.`);
  } else {
    consola.success(
      `Imported ${result.imported} new request(s) from ${found} (${result.hosts.join(", ")}).`,
    );
  }
  if (result.incomplete) consola.warn("Grok usage is incomplete; recorded tokens may under-count.");
  if (result.excluded) {
    consola.info(`Skipped ${result.excluded} log(s) under metrics.exclude.`);
  }
}

async function discover(change: string | undefined, all: boolean): Promise<void> {
  await withProject(async ({ root, config }) => {
    if (!config.metrics.enabled) {
      console.log("Metrics are disabled");
      return;
    }
    if (all && change) throw new Error("Use either --change or --all, not both.");
    const now = new Date();
    if (all) {
      printDiscovery(await discoverAndImportMetrics(root, config));
      console.log(await reportAllChanges(root, config, await loadPrices(root), now));
      return;
    }
    const changeId = await resolveChangeId(root, config, change);
    printDiscovery(await discoverAndImportMetrics(root, config, { scope: [changeId] }));
    const prices = await loadPrices(root);
    console.log(await reportChange({ projectRoot: root, config, changeId, prices, now }));
  });
}

/**
 * `sdd metrics` finds the session logs itself. `sdd metrics import <log>` stays as the manual
 * fallback. The import form is read here, not as a citty subcommand, because citty takes the
 * value of `--change <id>` for a subcommand name.
 */
export const metricsCmd = defineCommand({
  meta: {
    name: "metrics",
    description:
      "Find agent session logs, import new token usage, and print the report (no arguments needed). `import <log>` adds one log by hand.",
  },
  args: {
    action: { type: "positional", description: "import", required: false },
    sessionLog: {
      type: "positional",
      description:
        "With import: a Claude Code or Codex JSONL, a Grok usage.json, or a session folder",
      required: false,
    },
    change: { type: "string", description: "Limit to one change id", alias: "c" },
    all: { type: "boolean", description: "Cover every change", default: false },
  },
  async run({ args }) {
    if (args.action === "import") return importLog(args.sessionLog, args.change);
    if (args.action) {
      throw new Error(`Unknown metrics command "${args.action}". Use: sdd metrics [import <log>]`);
    }
    return discover(args.change, args.all);
  },
});
