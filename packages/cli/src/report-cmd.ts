import {
  loadPrices,
  reportAllChanges,
  reportChange,
  resolveChangeId,
} from "@structured-vibe-coding/core";
import { defineCommand } from "citty";
import { withProject } from "./project.js";

async function runCostReport(args: { change?: string; all?: boolean }): Promise<void> {
  await withProject(async ({ root, config }) => {
    if (!config.metrics.enabled) {
      console.log("Metrics are disabled");
      return;
    }
    if (args.all && args.change) {
      throw new Error("Use either --change or --all, not both.");
    }
    const now = new Date();
    if (args.all) {
      const prices = await loadPrices(root);
      console.log(await reportAllChanges(root, config, prices, now));
      return;
    }
    const changeId = await resolveChangeId(root, config, args.change);
    const prices = await loadPrices(root);
    console.log(await reportChange({ projectRoot: root, config, changeId, prices, now }));
  });
}

export const reportCmd = defineCommand({
  meta: {
    name: "report",
    description: "Print phase time, measured tokens, and cost for a change",
  },
  args: {
    change: { type: "string", description: "Change id (default: active change)" },
    all: {
      type: "boolean",
      description: "Report every change that has metrics.json",
      default: false,
    },
  },
  async run({ args }) {
    await runCostReport({ change: args.change, all: args.all });
  },
});

export const costCmd = defineCommand({
  meta: {
    name: "cost",
    description: "Print the same one-change report as sdd report",
  },
  args: {
    change: { type: "string", description: "Change id (default: active change)" },
  },
  async run({ args }) {
    await runCostReport({ change: args.change, all: false });
  },
});
