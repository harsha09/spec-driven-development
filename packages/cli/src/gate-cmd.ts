import {
  approveGate,
  formatGateStatusReport,
  formatStatus,
  gateStatusReport,
  resolveChangeId,
} from "@structured-vibe-coding/core";
import { defineCommand } from "citty";
import { consola } from "consola";
import { launchConfiguredAgent, reportAgentLaunch } from "./launch-agent.js";
import { withProject } from "./project.js";
import { noAgentArg, noAgentRequested } from "./shared.js";

function gateActionCommand(
  name: "approve" | "waive" | "fail",
  status: "approved" | "waived" | "failed",
) {
  return defineCommand({
    meta: {
      name,
      description: `${name} the gate on a stage, then launch the AI agent`,
    },
    args: {
      stage: { type: "string", description: "Stage id (default: current)", alias: "s" },
      note: { type: "string", description: "Note", alias: "n" },
      change: { type: "string", description: "Change id", alias: "c" },
      "no-agent": noAgentArg,
    },
    async run({ args }) {
      await withProject(async ({ root, config }) => {
        const id = await resolveChangeId(root, config, args.change);
        const ctx = await approveGate(root, config, id, args.stage, args.note, status);
        consola.success(`Gate ${name}d on ${args.stage ?? ctx.meta.stage}`);
        consola.log(formatStatus(ctx));
        consola.log("");
        const launch = await launchConfiguredAgent({
          projectRoot: root,
          config,
          ctx,
          noAgent: noAgentRequested(args),
          event: `gate ${name} on ${args.stage ?? ctx.meta.stage}`,
        });
        await reportAgentLaunch(launch);
      });
    },
  });
}

const status = defineCommand({
  meta: {
    name: "status",
    description: "List required merge gates and whether each is fresh on the current HEAD",
  },
  args: {
    change: { type: "positional", description: "Change id", required: true },
  },
  async run({ args }) {
    await withProject(async ({ root, config }) => {
      const report = await gateStatusReport(root, config, args.change);
      const text = formatGateStatusReport(report);
      process.stdout.write(text);
      if (report.gates.length && !report.mergeReady) process.exitCode = 1;
    });
  },
});

export const gateCmd = defineCommand({
  meta: {
    name: "gate",
    description: "Approve, waive, fail, or inspect merge gates",
  },
  subCommands: {
    approve: gateActionCommand("approve", "approved"),
    waive: gateActionCommand("waive", "waived"),
    fail: gateActionCommand("fail", "failed"),
    status,
  },
});
