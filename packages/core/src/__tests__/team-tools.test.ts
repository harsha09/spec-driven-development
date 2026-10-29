import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import {
  createChange,
  createRole,
  initProject,
  loadConfig,
  pathExists,
  postRoom,
  runRole,
  showRoom,
} from "../index.js";
import type { RoleModel } from "../role/types.js";

const exec = promisify(execFile);
const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function git(cwd: string, args: string[]): Promise<string> {
  const result = await exec("git", args, { cwd });
  return result.stdout;
}

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sdd-tools-"));
  temps.push(root);
  await initProject({ projectRoot: root, agents: false });
  await createRole(root, { name: "builder", label: "Builder", job: "Implement" });
  await git(root, ["init", "-b", "main"]);
  await git(root, ["config", "user.email", "bot@example.com"]);
  await git(root, ["config", "user.name", "Bot"]);
  await mkdir(join(root, "notes"), { recursive: true });
  await writeFile(join(root, "notes", "read.txt"), "MARKER-READ-66\n", "utf8");
  await writeFile(
    join(root, "notes", "marker.ts"),
    'export function markerContext66() { return "body-66"; }\n',
    "utf8",
  );
  await writeFile(
    join(root, "mark.js"),
    [
      "const fs = require('fs');",
      "const { execSync } = require('child_process');",
      "console.log(fs.existsSync('dirty.txt') ? 'SEES_DIRTY' : 'CLEAN');",
      "console.log(execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim());",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(root, "evil.js"),
    "require('fs').writeFileSync('started.txt', 'no');\n",
    "utf8",
  );
  await git(root, ["add", "--", "notes", "mark.js", "evil.js"]);
  await git(root, ["commit", "-m", "start"]);
  return root;
}

async function team(root: string, steps = 8): Promise<void> {
  await writeFile(
    join(root, ".sdd", "team.yaml"),
    [
      "branch: bot/{bot}/{change}",
      "rooms:",
      "  commit: false",
      "bots:",
      "  - name: builder",
      "    role: builder",
      "    wip: 1",
      "humans: []",
      "limits:",
      `  loop_max_steps: ${steps}`,
      "",
    ].join("\n"),
    "utf8",
  );
}

async function workflow(root: string, command: string | null): Promise<void> {
  await mkdir(join(root, ".sdd", "workflows"), { recursive: true });
  const verify = command
    ? ["    verify:", "      commands:", "        - { name: mark, run: node mark.js }"]
    : [];
  await writeFile(
    join(root, ".sdd", "workflows", "checks.yaml"),
    [
      "name: checks",
      "version: 1",
      "stages:",
      "  - id: check",
      "    artifacts: []",
      ...verify,
      "",
    ].join("\n"),
    "utf8",
  );
}

function script(replies: unknown[]): { model: RoleModel; prompts: string[] } {
  const pending = replies.slice();
  const prompts: string[] = [];
  return {
    prompts,
    model: {
      async complete(input) {
        prompts.push(input.prompt);
        const next = pending.shift();
        if (next === undefined) throw new Error("unexpected model call");
        return typeof next === "string" ? next : JSON.stringify(next);
      },
    },
  };
}

async function log(root: string): Promise<Array<Record<string, unknown>>> {
  const dir = join(root, ".sdd/role-runs/conversation/builder");
  const { readdir } = await import("node:fs/promises");
  const names = (await readdir(dir)).filter((name) => name.endsWith(".jsonl")).sort();
  const body = await readFile(join(dir, names[names.length - 1] ?? ""), "utf8");
  return body
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function openChange(root: string): Promise<{ id: string; path: string }> {
  const config = await loadConfig(root);
  const ctx = await createChange({
    projectRoot: root,
    config,
    title: "Tools",
    workflowName: "checks",
  });
  return { id: ctx.id, path: ctx.path };
}

describe("team tools", () => {
  it("reads, searches, and returns code context without a stub", async () => {
    const root = await project();
    await team(root, 4);
    await workflow(root, null);
    await openChange(root);
    const fake = script([
      { step: "tool", name: "read_file", args: { path: "notes/read.txt" } },
      { step: "tool", name: "search", args: { query: "MARKER-READ-66" } },
      {
        step: "tool",
        name: "context",
        args: { path: "notes/marker.ts", symbol: "markerContext66" },
      },
      { step: "done", summary: "stopped", outputs: [] },
    ]);
    const result = await runRole(root, { name: "builder", task: "look", model: fake.model });
    expect(result.stdout).toBe("stopped");
    expect(fake.prompts[1]).toContain("MARKER-READ-66");
    expect(fake.prompts[2]).not.toBe(fake.prompts[1]);
    expect(fake.prompts[3]).toContain("body-66");
    const tools = (await log(root)).filter((line) => line.step === "tool");
    expect(tools.map((line) => line.name)).toEqual(["read_file", "search", "context"]);
    expect(tools.some((line) => line.stub === true)).toBe(false);
    expect(await pathExists(join(root, "changes"))).toBe(true);
    const evidence = join(root, "changes");
    const { readdir } = await import("node:fs/promises");
    const ids = await readdir(evidence);
    for (const id of ids) {
      expect(await pathExists(join(evidence, id, "evidence"))).toBe(false);
    }
  });

  it("refuses an unknown tool and a write with no contents", async () => {
    const root = await project();
    await team(root, 3);
    await workflow(root, null);
    await openChange(root);
    const fake = script([
      { step: "tool", name: "write_file", args: { path: "notes/not-written.txt" } },
      { step: "tool", name: "browser", args: {} },
      { step: "done", summary: "stopped", outputs: [] },
    ]);
    const result = await runRole(root, { name: "builder", task: "look", model: fake.model });
    expect(result.stdout).toBe("stopped");
    expect(fake.prompts[1]).toContain("That file cannot be written.");
    expect(fake.prompts[2]).toContain("That tool is not available.");
    expect(await pathExists(join(root, "notes", "not-written.txt"))).toBe(false);
    const tools = (await log(root)).filter((line) => line.step === "tool");
    expect(tools.every((line) => line.ok === false && line.stub !== true)).toBe(true);
  });

  it("runs an allowlisted check in a worktree and refuses a pass without that file", async () => {
    const root = await project();
    await team(root, 5);
    await workflow(root, "node mark.js");
    const change = await openChange(root);
    await writeFile(join(root, "dirty.txt"), "dirty\n", "utf8");
    const sha = (await git(root, ["rev-parse", "HEAD"])).trim();
    const listed = await git(root, ["worktree", "list"]);
    const fake = script([
      { step: "tool", name: "run_check", args: { run: "node evil.js" } },
      { step: "tool", name: "run_check", args: { run: "node mark.js; node evil.js" } },
      { step: "tool", name: "run_check", args: { run: "node mark.js" } },
      { step: "check", claim: "tests pass", evidence: [] },
      { step: "done", summary: "stopped", outputs: [] },
    ]);
    const result = await runRole(root, { name: "builder", task: "check", model: fake.model });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toBe("tests pass");
    expect(await pathExists(join(root, "started.txt"))).toBe(false);
    expect(await pathExists(join(root, "dirty.txt"))).toBe(true);
    expect(await git(root, ["worktree", "list"])).toBe(listed);
    const evidence = join(change.path, "evidence", `${sha}.json`);
    const body = JSON.parse(await readFile(evidence, "utf8")) as {
      sha: string;
      runs: { command: string; exitCode: number; output: string }[];
    };
    expect(body.sha).toBe(sha);
    expect(body.runs).toHaveLength(1);
    expect(body.runs[0]?.command).toBe("node mark.js");
    expect(body.runs[0]?.exitCode).toBe(0);
    expect(body.runs[0]?.output).toContain("CLEAN");
    expect(body.runs[0]?.output).toContain(sha);
    const steps = (await log(root)).filter((line) => line.type === "step");
    expect(steps.some((line) => line.step === "check" && line.claim === "tests pass")).toBe(false);
    expect(steps.some((line) => line.step === "refused")).toBe(true);
    expect(fake.prompts.at(-1)).toContain("A pass claim needs evidence at this SHA.");

    const cite = `changes/${change.id}/evidence/${sha}.json`;
    const claimed = script([
      { step: "check", claim: "the file is absent", evidence: [] },
      { step: "done", summary: "tests pass", outputs: [], evidence: [cite] },
    ]);
    const passed = await runRole(root, { name: "builder", task: "check", model: claimed.model });
    expect(passed.stdout).toBe("tests pass");
    const bare = await postRoom(root, { stage: "check", type: "post", text: "it works" });
    expect(bare.stdout).toBe("A pass claim needs evidence at this SHA.");
    const wrong = await postRoom(root, {
      stage: "check",
      type: "objection",
      text: "it works",
      cite: "requirements.md#scope",
    });
    expect(wrong.stdout).toBe("A pass claim needs evidence at this SHA.");
    const agreed = await postRoom(root, {
      stage: "check",
      type: "agree",
      text: "Noted.",
      cite,
    });
    expect(agreed.stdout).toBe("Posted.");
    const shown = await showRoom(root, { stage: "check" });
    expect(shown.stdout).toContain(cite);
    expect(shown.stdout).not.toContain("it works");
  });

  it("allows a tools.yaml command and keeps a non-claim objection", async () => {
    const root = await project();
    await team(root, 2);
    await workflow(root, null);
    const change = await openChange(root);
    await writeFile(join(root, ".sdd", "tools.yaml"), "allow:\n  - run: node mark.js\n", "utf8");
    const sha = (await git(root, ["rev-parse", "HEAD"])).trim();
    const fake = script([
      { step: "tool", name: "run_check", args: { run: "node mark.js" } },
      { step: "done", summary: "stopped", outputs: [] },
    ]);
    const result = await runRole(root, { name: "builder", task: "check", model: fake.model });
    expect(result.stdout).toBe("stopped");
    const evidence = JSON.parse(
      await readFile(join(change.path, "evidence", `${sha}.json`), "utf8"),
    ) as { runs: { output: string }[] };
    expect(evidence.runs[0]?.output).toContain("CLEAN");
    const objection = await postRoom(root, {
      stage: "check",
      type: "objection",
      text: "The ignore seam is missing.",
      cite: "requirements.md#scope",
    });
    expect(objection.stdout).toBe("Posted.");
    expect((await showRoom(root, { stage: "check" })).stdout).toContain("requirements.md#scope");
  });

  it("commits only on the bot branch and does not push or merge", async () => {
    const root = await project();
    await team(root, 4);
    await workflow(root, null);
    const change = await openChange(root);
    const before = (await git(root, ["rev-parse", "HEAD"])).trim();
    const decisions = join(change.path, "decisions.md");
    const prior = (await pathExists(decisions)) ? await readFile(decisions, "utf8") : "";
    const refused = script([
      { step: "tool", name: "commit", args: { message: "note", paths: ["notes/read.txt"] } },
      { step: "done", summary: "stopped", outputs: [] },
    ]);
    const onMain = await runRole(root, { name: "builder", task: "commit", model: refused.model });
    expect(onMain.stdout).toBe("stopped");
    expect(refused.prompts[1]).toContain("A bot commits only on its own branch.");
    expect((await git(root, ["rev-parse", "HEAD"])).trim()).toBe(before);

    await git(root, ["checkout", "-b", `bot/builder/${change.id}`]);
    await writeFile(join(root, "notes", "extra.txt"), "extra\n", "utf8");
    const committed = script([
      {
        step: "tool",
        name: "commit",
        args: { message: "note", paths: ["notes/extra.txt"] },
      },
      { step: "tool", name: "push", args: {} },
      { step: "tool", name: "merge", args: {} },
      { step: "done", summary: "stopped", outputs: [] },
    ]);
    const onBranch = await runRole(root, {
      name: "builder",
      task: "commit",
      model: committed.model,
    });
    expect(onBranch.stdout).toBe("stopped");
    expect((await git(root, ["rev-parse", "--abbrev-ref", "HEAD"])).trim()).toBe(
      `bot/builder/${change.id}`,
    );
    expect((await git(root, ["rev-parse", "HEAD"])).trim()).not.toBe(before);
    expect(committed.prompts[2]).toContain("Push needs a person at");
    expect(committed.prompts[3]).toContain("A bot cannot merge.");
    const after = (await pathExists(decisions)) ? await readFile(decisions, "utf8") : "";
    expect(after).toBe(prior);
    const tools = (await log(root)).filter((line) => line.step === "tool");
    expect(tools.some((line) => line.stub === true)).toBe(false);
  });
});
