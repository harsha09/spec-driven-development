import {
  type WorkType,
  explainModel,
  formatModels,
  isWorkType,
  loadModels,
} from "@structured-vibe-coding/core";
import { defineCommand } from "citty";
import { withProject } from "./project.js";

function textArg(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function loadedConfig(root: string) {
  const loaded = await loadModels(root);
  if (loaded === null) {
    process.stdout.write("No models.yaml.\n");
    process.exit(1);
  }
  if ("error" in loaded) {
    process.stdout.write(`${loaded.error}\n`);
    process.exit(1);
  }
  return loaded.config;
}

const show = defineCommand({
  meta: { name: "show", description: "Print each model and the work-type defaults" },
  async run() {
    await withProject(async ({ root }) => {
      const config = await loadedConfig(root);
      process.stdout.write(`${formatModels(config)}\n`);
    });
  },
});

const which = defineCommand({
  meta: { name: "which", description: "Print the model for one work type" },
  args: {
    "work-type": {
      type: "string",
      description: "route, classify, check, draft, design, code, or review",
      required: true,
    },
    role: { type: "string", description: "Role override" },
    stage: { type: "string", description: "Stage override" },
    bot: { type: "string", description: "Bot override" },
  },
  async run({ args }) {
    const workType = textArg(args["work-type"]);
    if (!workType || !isWorkType(workType)) {
      process.stdout.write("Work type is invalid.\n");
      process.exit(1);
    }
    await withProject(async ({ root }) => {
      const config = await loadedConfig(root);
      const line = explainModel(config, workType as WorkType, {
        role: textArg(args.role),
        stage: textArg(args.stage),
        bot: textArg(args.bot),
      });
      process.stdout.write(`${line}\n`);
    });
  },
});

export const modelsCmd = defineCommand({
  meta: {
    name: "models",
    description: "Show which model a kind of work uses",
  },
  subCommands: { show, which },
});
