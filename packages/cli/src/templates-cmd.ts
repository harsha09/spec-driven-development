import { collectTemplateStatus } from "@structured-vibe-coding/core";
import { defineCommand } from "citty";
import { consola } from "consola";
import pc from "picocolors";
import { withProject } from "./project.js";

const status = defineCommand({
  meta: {
    name: "status",
    description:
      "List workflow, template, and role files as stock, customized, outdated, or unknown",
  },
  args: {
    json: {
      type: "boolean",
      description: "Print machine-readable JSON",
      default: false,
    },
  },
  async run({ args }) {
    await withProject(async ({ root }) => {
      const report = await collectTemplateStatus(root);
      if (args.json) {
        process.stdout.write(`${JSON.stringify(report)}\n`);
        return;
      }
      for (const file of report.files) {
        consola.log(`${pc.cyan(file.path)}  ${file.state}`);
      }
      if (report.files.length === 0) {
        consola.log(pc.dim("No workflow, template, or role files found."));
      }
    });
  },
});

export const templatesCmd = defineCommand({
  meta: {
    name: "templates",
    description: "Inspect shipped workflow, template, and role files against the manifest",
  },
  subCommands: { status },
});
