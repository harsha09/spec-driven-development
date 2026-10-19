import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  branchBlock,
  buildContext,
  formatEpicGraph,
  loadEpicStories,
  resolveChangeId,
  saveChangeMeta,
  validBranchName,
} from "@structured-vibe-coding/core";
import { defineCommand } from "citty";
import { withProject } from "./project.js";

function emit(result: { exitCode: number; stdout: string }): void {
  if (result.stdout.length > 0) {
    process.stdout.write(result.stdout.endsWith("\n") ? result.stdout : `${result.stdout}\n`);
  }
  if (result.exitCode !== 0) process.exit(result.exitCode);
}

function failed(stderr: string): string {
  const text = stderr.trim();
  return text.length > 0 ? text : "The pull request was not created.";
}

export const graphCmd = defineCommand({
  meta: {
    name: "graph",
    description: "Show which epic stories can run together and which must wait",
  },
  args: {
    epic: { type: "string", description: "Epic key, for example issue-37" },
  },
  async run({ args }) {
    await withProject(async ({ root, config }) => {
      const epic = args.epic?.trim() ?? "";
      if (!epic) {
        emit({ exitCode: 1, stdout: "An epic key is required." });
        return;
      }
      const nodes = await loadEpicStories(root, config, epic);
      if (nodes.length === 0) {
        emit({ exitCode: 0, stdout: "No stories in this epic." });
        return;
      }
      emit(formatEpicGraph(nodes));
    });
  },
});

export const branchCmd = defineCommand({
  meta: {
    name: "branch",
    description: "Create and check out the branch for the active story",
  },
  args: {
    name: { type: "positional", description: "Branch name", required: true },
    change: { type: "string", description: "Change id", alias: "c" },
    from: { type: "string", description: "Base ref", default: "main" },
  },
  async run({ args }) {
    await withProject(async ({ root, config }) => {
      const name = args.name.trim();
      if (!validBranchName(name)) {
        emit({ exitCode: 1, stdout: "A branch name is not valid." });
        return;
      }
      const id = await resolveChangeId(root, config, args.change);
      const ctx = await buildContext(root, config, id);
      if (ctx.meta.epic && ctx.meta.story) {
        const nodes = await loadEpicStories(root, config, ctx.meta.epic);
        const block = branchBlock(nodes, ctx.meta.story);
        if (block) {
          emit({ exitCode: 1, stdout: block });
          return;
        }
      } else if ((ctx.meta.depends ?? []).length > 0) {
        emit({ exitCode: 1, stdout: "A story needs an epic." });
        return;
      }
      if (ctx.meta.branch) {
        emit({ exitCode: 1, stdout: "Branch already exists." });
        return;
      }

      const inside = await runCommand(root, "git", ["rev-parse", "--is-inside-work-tree"]);
      if (inside.missing || inside.exitCode !== 0 || inside.stdout.trim() !== "true") {
        emit({ exitCode: 1, stdout: "This folder is not a git repository." });
        return;
      }
      const unstaged = await runCommand(root, "git", ["diff", "--quiet"]);
      const staged = await runCommand(root, "git", ["diff", "--cached", "--quiet"]);
      if (unstaged.exitCode !== 0 || staged.exitCode !== 0) {
        emit({ exitCode: 1, stdout: "Working tree has uncommitted changes." });
        return;
      }
      const base = args.from.trim() || "main";
      const ref = await runCommand(root, "git", ["rev-parse", "--verify", "--quiet", base]);
      if (ref.exitCode !== 0) {
        emit({ exitCode: 1, stdout: `Base ref ${base} was not found.` });
        return;
      }
      const existing = await runCommand(root, "git", [
        "show-ref",
        "--verify",
        "--quiet",
        `refs/heads/${name}`,
      ]);
      if (existing.exitCode === 0) {
        emit({ exitCode: 1, stdout: "Branch already exists." });
        return;
      }
      const created = await runCommand(root, "git", ["switch", "-c", name, base]);
      if (created.exitCode !== 0) {
        emit({ exitCode: 1, stdout: created.stderr.trim() || "The branch was not created." });
        return;
      }
      ctx.meta.branch = name;
      await saveChangeMeta(root, config, ctx.meta);
      emit({ exitCode: 0, stdout: name });
    });
  },
});

export const prCmd = defineCommand({
  meta: {
    name: "pr",
    description: "Push the change branch and open a pull request",
  },
  args: {
    change: { type: "string", description: "Change id", alias: "c" },
    closes: { type: "string", description: "Issue number to close in the pull request body" },
  },
  async run({ args }) {
    await withProject(async ({ root, config }) => {
      const id = await resolveChangeId(root, config, args.change);
      const ctx = await buildContext(root, config, id);
      if (!ctx.meta.branch) {
        emit({ exitCode: 1, stdout: "This change has no branch." });
        return;
      }
      let closes: number | undefined;
      if (args.closes !== undefined) {
        if (!/^[1-9]\d*$/.test(args.closes)) {
          emit({ exitCode: 1, stdout: "A pull request close id is not valid." });
          return;
        }
        closes = Number(args.closes);
      }
      const current = await runCommand(root, "git", ["branch", "--show-current"]);
      if (current.missing) {
        emit({ exitCode: 1, stdout: "This folder is not a git repository." });
        return;
      }
      const currentName = current.stdout.trim();
      if (currentName !== ctx.meta.branch) {
        emit({
          exitCode: 1,
          stdout: `Current branch is ${currentName || "(detached)"}, not ${ctx.meta.branch}.`,
        });
        return;
      }
      if (ctx.meta.pr?.url) {
        emit({ exitCode: 1, stdout: "This change already has a pull request." });
        return;
      }
      const pushed = await runCommand(root, "git", [
        "push",
        "--set-upstream",
        "origin",
        ctx.meta.branch,
      ]);
      if (pushed.missing) {
        emit({ exitCode: 1, stdout: "This folder is not a git repository." });
        return;
      }
      if (pushed.exitCode !== 0) {
        emit({ exitCode: 1, stdout: failed(pushed.stderr) });
        return;
      }
      const body = [ctx.meta.id, ctx.displayPath, closes ? `Closes #${closes}` : ""]
        .filter((line) => line.length > 0)
        .join("\n");
      const dir = await mkdtemp(join(tmpdir(), "sdd-pr-"));
      const bodyPath = join(dir, "body.md");
      try {
        await writeFile(bodyPath, `${body}\n`);
        const opened = await runCommand(root, "gh", [
          "pr",
          "create",
          "--title",
          ctx.meta.title,
          "--body-file",
          bodyPath,
        ]);
        if (opened.missing) {
          emit({ exitCode: 1, stdout: "GitHub CLI is not available." });
          return;
        }
        if (opened.exitCode !== 0) {
          emit({ exitCode: 1, stdout: failed(opened.stderr) });
          return;
        }
        const match = opened.stdout.match(/https?:\/\/\S+\/pull\/(\d+)/);
        if (!match?.[1]) {
          emit({ exitCode: 1, stdout: "The pull request was not created." });
          return;
        }
        const url = match[0];
        ctx.meta.pr = { number: Number(match[1]), url };
        await saveChangeMeta(root, config, ctx.meta);
        emit({ exitCode: 0, stdout: url });
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  },
});

function runCommand(
  cwd: string,
  command: string,
  args: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string; missing: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (err: NodeJS.ErrnoException) => {
      resolve({ exitCode: 127, stdout, stderr: err.message, missing: err.code === "ENOENT" });
    });
    child.on("close", (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr, missing: false });
    });
  });
}
