import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createRole, initProject, loadBrain, readTeamConfig, runLoop } from "../index.js";
import type { RoleModel } from "../role/types.js";
import {
  INVALID_STEP_EXAMPLE,
  LoopStepSchema,
  VALID_STEP_EXAMPLE,
  renderLoopContract,
} from "../team/loop-contract.js";
import { TOOL_SPECS, runTool } from "../team/tools.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sdd-contract-"));
  temps.push(root);
  await initProject({ projectRoot: root, agents: false });
  await createRole(root, { name: "builder", label: "Builder", job: "Implement" });
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
      "",
    ].join("\n"),
    "utf8",
  );
  return root;
}

const stepNames = LoopStepSchema.options.map((option) => option.shape.step.value);

describe("loop contract", () => {
  it("states every step in the schema and every registered tool", () => {
    const text = renderLoopContract({ tools: TOOL_SPECS });
    for (const step of stepNames) expect(text).toContain(`"step": "${step}"`);
    for (const tool of TOOL_SPECS) expect(text).toContain(`- ${tool.name}: ${tool.description}`);
    expect(text).toContain('"items": string[]');
    expect(text).toContain('"claim": string');
    expect(text).toContain('"evidence"?: string[]');
    expect(text).toContain('"args"?: any');
  });

  it("changes when the schema changes", () => {
    const before = renderLoopContract({ tools: TOOL_SPECS });
    const extended = z.discriminatedUnion("step", [
      ...LoopStepSchema.options,
      z.strictObject({ step: z.literal("pause"), reason: z.string() }),
    ]);
    const after = renderLoopContract({ steps: extended, tools: TOOL_SPECS });
    expect(before).not.toContain("pause");
    expect(after).toContain('{"step": "pause", "reason": string}');
    const fewer = z.discriminatedUnion("step", [
      LoopStepSchema.options[0],
      LoopStepSchema.options[4],
    ]);
    expect(renderLoopContract({ steps: fewer, tools: TOOL_SPECS })).not.toContain('"step": "ask"');
  });

  it("changes when a tool is added or its arguments change", () => {
    const extra = {
      name: "lint",
      description: "Lint one file.",
      args: z.strictObject({ file: z.string(), fix: z.boolean().optional() }),
    };
    const text = renderLoopContract({ tools: [...TOOL_SPECS, extra], checks: ["pnpm test"] });
    expect(text).toContain("- lint: Lint one file.");
    expect(text).toContain("file: string.");
    expect(text).toContain("fix?: boolean.");
    expect(text).toContain("run_check accepts only these exact commands:\n    pnpm test");
    expect(renderLoopContract({ tools: TOOL_SPECS })).not.toContain("lint");
  });

  it("ships a valid example the parser accepts and an invalid one it refuses", () => {
    expect(LoopStepSchema.safeParse(VALID_STEP_EXAMPLE).success).toBe(true);
    expect(LoopStepSchema.safeParse(JSON.parse(INVALID_STEP_EXAMPLE)).success).toBe(false);
  });

  it("dispatches every tool it lists", async () => {
    const root = await project();
    const loaded = await readTeamConfig(root);
    if (!("team" in loaded)) throw new Error(loaded.error);
    for (const tool of TOOL_SPECS) {
      const ran = await runTool(root, loaded.team, "builder", {
        name: tool.name,
        args: tool.name === "context" ? { path: "missing.ts" } : {},
      });
      expect(ran.text).not.toBe("That tool is not available.");
    }
  });

  it("keeps the contract section stable", async () => {
    const text = renderLoopContract({ tools: TOOL_SPECS, checks: ["pnpm test", "pnpm lint"] });
    await expect(`${text}\n`).toMatchFileSnapshot("./__snapshots__/loop-contract.txt");
  });
});

describe("loop contract in the prompt", () => {
  it("loadBrain puts the contract and the project's checks in the prompt", async () => {
    const root = await project();
    await writeFile(join(root, ".sdd", "tools.yaml"), "allow:\n  - run: pnpm test:unit\n", "utf8");
    const loaded = await readTeamConfig(root);
    if (!("team" in loaded)) throw new Error(loaded.error);
    const brain = await loadBrain(root, loaded.team, "builder", { text: "add a todo" }, 8000);
    if ("error" in brain) throw new Error(brain.error);
    const contract = renderLoopContract({ tools: TOOL_SPECS, checks: ["pnpm test:unit"] });
    expect(brain.prompt).toContain(contract);
    expect(brain.prompt.indexOf("Item:\nadd a todo")).toBeLessThan(
      brain.prompt.indexOf("Reply format:"),
    );
  });

  it("keeps the contract when the budget is tiny", async () => {
    const root = await project();
    const loaded = await readTeamConfig(root);
    if (!("team" in loaded)) throw new Error(loaded.error);
    const brain = await loadBrain(root, loaded.team, "builder", { text: "x" }, 1);
    if ("error" in brain) throw new Error(brain.error);
    expect(brain.prompt).toContain("Reply format:");
    expect(brain.prompt).toContain("Tool list:");
  });

  it("sends the contract to the model on the first loop turn", async () => {
    const root = await project();
    const loaded = await readTeamConfig(root);
    if (!("team" in loaded)) throw new Error(loaded.error);
    const brain = await loadBrain(root, loaded.team, "builder", { text: "add a todo" }, 8000);
    if ("error" in brain) throw new Error(brain.error);
    const prompts: string[] = [];
    const model: RoleModel = {
      async complete(input) {
        prompts.push(input.prompt);
        return JSON.stringify({ step: "ask", question: "Which list?", options: ["a", "b"] });
      },
    };
    await mkdir(join(root, ".sdd/role-runs/conversation/builder"), { recursive: true });
    const file = join(root, ".sdd/role-runs/conversation/builder/001.jsonl");
    await runLoop({
      root,
      cfg: loaded.team,
      brain,
      model,
      file,
      roleName: "builder",
      logName: "builder",
    });
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("Reply format:");
    for (const tool of TOOL_SPECS) expect(prompts[0]).toContain(`- ${tool.name}:`);
  });
});
