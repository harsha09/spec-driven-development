import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import {
  addLesson,
  createChange,
  createRole,
  initProject,
  loadConfig,
  pathExists,
  runRole,
} from "../index.js";
import type { RoleModel } from "../role/types.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sdd-loop-"));
  temps.push(root);
  await initProject({ projectRoot: root, agents: false });
  await createRole(root, { name: "builder", label: "Builder", job: "Implement" });
  await createRole(root, { name: "critic", label: "Critic", job: "Review" });
  return root;
}

async function team(root: string, steps?: number): Promise<void> {
  const limits = steps ? `limits:\n  loop_max_steps: ${steps}\n` : "";
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
      limits,
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

function json(value: unknown): string {
  return JSON.stringify(value);
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

describe("team loop", () => {
  it("keeps a one-call reading when there is no team", async () => {
    const root = await project();
    const fake = script([{ text: "hello" }]);
    const result = await runRole(root, {
      name: "builder",
      task: "say hi",
      model: fake.model,
      now: () => new Date("2026-10-29T00:00:00.000Z"),
    });
    expect(result.stdout).toBe("hello");
    expect(fake.prompts).toHaveLength(1);
    expect(fake.prompts[0]).toContain("Job: Implement");
    const records = await log(root);
    expect(records.some((line) => line.type === "step")).toBe(false);
  });

  it("logs plan, tool, check, and done, and a tool writes nothing", async () => {
    const root = await project();
    await team(root);
    const fake = script([
      { step: "plan", items: ["plan-only sentence zeta"] },
      { step: "tool", name: "write_file", args: { path: "notes/draft.md" } },
      { step: "check", claim: "the file is absent", evidence: [] },
      { step: "done", summary: "stopped", outputs: [] },
    ]);
    const result = await runRole(root, {
      name: "builder",
      task: "inspect the build",
      model: fake.model,
      now: () => new Date("2026-10-29T00:00:01.000Z"),
    });
    expect(result.stdout).toBe("stopped");
    expect(fake.prompts).toHaveLength(4);
    expect(fake.prompts[2]).toContain("That file cannot be written.");
    const steps = (await log(root)).filter((line) => line.type === "step").map((line) => line.step);
    expect(steps).toEqual(["plan", "tool", "check", "done"]);
    expect(await pathExists(join(root, "notes/draft.md"))).toBe(false);
    expect(await pathExists(join(root, ".sdd/facts.jsonl"))).toBe(false);
    expect(await pathExists(join(root, ".sdd/agents/builder/lessons.jsonl"))).toBe(false);
  });

  it("asks without a gate and stops at max steps", async () => {
    const root = await project();
    await team(root, 2);
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Loop",
      workflowName: "feature",
    });
    const before = await readFile(join(ctx.path, "meta.yaml"), "utf8");
    const ask = script([{ step: "ask", question: "Which file?", options: ["a", "b"] }]);
    const asked = await runRole(root, {
      name: "builder",
      task: "inspect",
      model: ask.model,
      now: () => new Date("2026-10-29T00:00:02.000Z"),
    });
    expect(asked.stdout).toBe("Which file?");
    expect(await readFile(join(ctx.path, "meta.yaml"), "utf8")).toBe(before);
    expect(await pathExists(join(ctx.path, "reviews"))).toBe(false);
    const decisions = await readFile(join(ctx.path, "decisions.md"), "utf8");
    expect(decisions).toContain("decision-needed Which file?");

    const plans = script([
      { step: "plan", items: ["one"] },
      { step: "plan", items: ["two"] },
      { step: "plan", items: ["three"] },
    ]);
    const capped = await runRole(root, {
      name: "builder",
      task: "inspect",
      model: plans.model,
      now: () => new Date("2026-10-29T00:00:03.000Z"),
    });
    expect(capped.stdout).toBe("Stopped after 2 steps.");
    expect(plans.prompts).toHaveLength(2);
    const steps = (await log(root)).filter((line) => line.type === "step");
    expect(steps.at(-1)).toMatchObject({ step: "ask", question: "Stopped after 2 steps." });
  });

  it("puts a person's lesson in the next prompt and copies a reviewer cite", async () => {
    const root = await project();
    await team(root);
    await addLesson(root, "builder", "check Node engine range");
    await mkdir(join(root, ".sdd/role-runs/conversation/builder"), { recursive: true });
    await writeFile(
      join(root, ".sdd/role-runs/conversation/builder/20000101T000000Z.jsonl"),
      `${json({ type: "model", roleId: "critic", text: "Reviewed.", changed: ["CHK-001"] })}\n`,
      "utf8",
    );
    const fake = script([{ step: "done", summary: "ok", outputs: [] }]);
    await runRole(root, {
      name: "builder",
      task: "repair engine mounts",
      model: fake.model,
      now: () => new Date("2026-10-29T00:00:04.000Z"),
    });
    expect(fake.prompts[0]).toContain("check Node engine range");
    const lessons = await readFile(join(root, ".sdd/agents/builder/lessons.jsonl"), "utf8");
    expect(lessons).toContain("check Node engine range");
    expect(lessons).toContain("CHK-001");
    expect(lessons).not.toContain("plan-only sentence zeta");
  });

  it("leaves a role that is not a bot on the author prompt", async () => {
    const root = await project();
    await team(root);
    const fake = script([{ text: "hello" }]);
    const result = await runRole(root, {
      name: "critic",
      task: "say hi",
      model: fake.model,
      now: () => new Date("2026-10-29T00:00:05.000Z"),
    });
    expect(result.stdout).toBe("hello");
    expect(fake.prompts[0]).toContain("Job: Review");
    expect(fake.prompts[0]).not.toContain("Item:");
  });

  it("rejects a team file whose step limit is not a positive integer", async () => {
    const root = await project();
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
        "limits:",
        "  loop_max_steps: 0",
        "",
      ].join("\n"),
      "utf8",
    );
    const fake = script([{ text: "hello" }]);
    const result = await runRole(root, {
      name: "builder",
      task: "say hi",
      model: fake.model,
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("team.yaml is invalid");
    expect(result.stdout).toContain("loop_max_steps");
    expect(fake.prompts).toHaveLength(0);
  });
});
