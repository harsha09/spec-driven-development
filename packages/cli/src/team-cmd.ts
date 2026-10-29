import {
  checkTeam,
  gitUserName,
  initTeam,
  recordSignoff,
  showTeam,
} from "@structured-vibe-coding/core";
import { defineCommand } from "citty";
import { withProject } from "./project.js";

function emit(result: { exitCode: number; stdout: string }): void {
  if (result.stdout.length > 0) {
    process.stdout.write(result.stdout.endsWith("\n") ? result.stdout : `${result.stdout}\n`);
  }
  if (result.exitCode !== 0) process.exit(result.exitCode);
}

function textArg(value: unknown): string {
  return typeof value === "string" ? value : "";
}

const init = defineCommand({
  meta: { name: "init", description: "Write .sdd/team.yaml and the template's role files" },
  args: {
    template: { type: "string", description: "software, solo, or research", required: true },
  },
  async run({ args }) {
    await withProject(async ({ root }) => {
      emit(await initTeam(root, textArg(args.template), gitUserName(root)));
    });
  },
});

const check = defineCommand({
  meta: { name: "check", description: "Check team.yaml and reject a secret in models.yaml" },
  async run() {
    await withProject(async ({ root }) => {
      emit(await checkTeam(root));
    });
  },
});

const show = defineCommand({
  meta: { name: "show", description: "Print the team config" },
  async run() {
    await withProject(async ({ root }) => {
      emit(await showTeam(root, gitUserName(root)));
    });
  },
});

const signoff = defineCommand({
  meta: { name: "signoff", description: "Record a human sign-off for this commit" },
  args: {
    note: { type: "string", description: "The person's words", required: true },
    stage: { type: "string", description: "Stage id. Default is the current stage" },
    change: { type: "string", description: "Change id" },
  },
  async run({ args }) {
    await withProject(async ({ root }) => {
      emit(
        await recordSignoff(root, {
          note: textArg(args.note),
          stage: textArg(args.stage),
          change: textArg(args.change),
        }),
      );
    });
  },
});

export const teamCmd = defineCommand({
  meta: {
    name: "team",
    description: "Install a role team from a template and show it",
  },
  subCommands: { init, show, check, signoff },
});
