import { closeSandbox, listSandboxes, openSandbox } from "@structured-vibe-coding/core";
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

const open = defineCommand({
  meta: {
    name: "open",
    description:
      "Create a git worktree and record for one change. The profile is read from .sdd/sandbox.yaml. A missing file defaults to devbox with PATH.",
  },
  args: {
    change: {
      type: "string",
      description: "Change id",
      required: true,
    },
  },
  async run({ args }) {
    await withProject(async ({ root }) => {
      emit(await openSandbox(root, textArg(args.change)));
    });
  },
});

const list = defineCommand({
  meta: {
    name: "list",
    description: "Print each sandbox id, status, and profile",
  },
  async run() {
    await withProject(async ({ root }) => {
      emit(await listSandboxes(root));
    });
  },
});

const close = defineCommand({
  meta: {
    name: "close",
    description: "Remove that sandbox worktree and its record",
  },
  args: {
    id: {
      type: "positional",
      description: "Sandbox id",
      required: false,
    },
    change: {
      type: "string",
      description: "Change id",
      required: false,
    },
    force: {
      type: "boolean",
      description: "Discard uncommitted changes in the worktree",
      default: false,
    },
  },
  async run({ args }) {
    const positional = textArg(args.id);
    const flagged = textArg(args.change);
    if (positional && flagged && positional !== flagged) {
      process.stdout.write("A sandbox id is not valid.\n");
      process.exit(1);
    }
    const id = flagged || positional;
    if (!id) {
      process.stdout.write("A sandbox id is not valid.\n");
      process.exit(1);
    }
    const force = args.force === true;
    await withProject(async ({ root }) => {
      emit(await closeSandbox(root, id, { force }));
    });
  },
});

export const sandboxCmd = defineCommand({
  meta: {
    name: "sandbox",
    description: "Open, list, and close a git worktree for one change",
  },
  subCommands: {
    open,
    list,
    close,
  },
});
