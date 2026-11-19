import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createRole, initProject, loadBrain, readTeamConfig, runLoop } from "../index.js";
import type { RoleModel } from "../role/types.js";
import {
  LOOP_STEP_EXAMPLES,
  LoopStepSchema,
  renderLoopContract,
  renderToolList,
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
const tools = { tools: TOOL_SPECS };

describe("loop contract", () => {
  it("states every step in the schema and every registered tool", () => {
    const text = renderLoopContract();
    for (const step of stepNames) expect(text).toContain(`"step": "${step}"`);
    expect(text).toContain('"items": string[]');
    expect(text).toContain('"claim": string');
    expect(text).toContain('"evidence"?: string[]');
    expect(text).toContain('"args"?: any');
    expect(text).toContain("Start with { and end with }.");
    const list = renderToolList(tools).join("\n");
    for (const tool of TOOL_SPECS) expect(list).toContain(`- ${tool.name}: ${tool.description}`);
  });

  it("changes when the schema changes", () => {
    const before = renderLoopContract();
    const extended = z.discriminatedUnion("step", [
      ...LoopStepSchema.options,
      z.strictObject({ step: z.literal("pause"), reason: z.string() }),
    ]);
    const after = renderLoopContract({ steps: extended });
    expect(before).not.toContain("pause");
    expect(after).toContain('{"step": "pause", "reason": string}');
    const fewer = z.discriminatedUnion("step", [
      LoopStepSchema.options[0],
      LoopStepSchema.options[4],
    ]);
    expect(renderLoopContract({ steps: fewer }).split("Valid:")[0]).not.toContain('"step": "ask"');
  });

  it("changes when a tool is added or its arguments change", () => {
    const extra = {
      name: "lint",
      description: "Lint one file.",
      args: z.strictObject({ file: z.string(), fix: z.boolean().optional() }),
    };
    const text = renderToolList({ tools: [...TOOL_SPECS, extra], checks: ["pnpm test"] }).join(
      "\n",
    );
    expect(text).toContain("- lint: Lint one file.");
    expect(text).toContain("file: string.");
    expect(text).toContain("fix?: boolean.");
    expect(text).toContain("run_check accepts only these exact commands:\n    pnpm test");
    expect(renderToolList(tools).join("\n")).not.toContain("lint");
  });

  it("ships a valid example for every step and an invalid one the parser refuses", () => {
    const shown = LOOP_STEP_EXAMPLES.valid.map((value) => (value as { step: string }).step);
    expect(shown).toEqual(stepNames);
    for (const value of LOOP_STEP_EXAMPLES.valid) {
      expect(LoopStepSchema.safeParse(value).success).toBe(true);
    }
    expect(LoopStepSchema.safeParse(LOOP_STEP_EXAMPLES.invalid.value).success).toBe(false);
    expect(LOOP_STEP_EXAMPLES.invalid.why.length).toBeGreaterThan(0);
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
    const text = [
      renderToolList({ tools: TOOL_SPECS, checks: ["pnpm test", "pnpm lint"] }).join("\n"),
      "",
      renderLoopContract(),
    ].join("\n");
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
    expect(brain.prompt).toContain(renderLoopContract());
    expect(brain.prompt).toContain(
      renderToolList({ tools: TOOL_SPECS, checks: ["pnpm test:unit"] }).join("\n"),
    );
    const item = brain.prompt.indexOf("### Work item");
    expect(item).toBeGreaterThan(-1);
    expect(item).toBeLessThan(brain.prompt.indexOf("# Output contract"));
    expect(brain.prompt.indexOf("# Style")).toBeLessThan(brain.prompt.indexOf("# Output contract"));
  });

  it("keeps the contract when the budget is tiny", async () => {
    const root = await project();
    const loaded = await readTeamConfig(root);
    if (!("team" in loaded)) throw new Error(loaded.error);
    const brain = await loadBrain(root, loaded.team, "builder", { text: "x" }, 1);
    if ("error" in brain) throw new Error(brain.error);
    expect(brain.prompt).toContain("# Output contract");
    expect(brain.prompt).toContain("Tools you may call");
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
    expect(prompts[0]).toContain("# Output contract");
    for (const tool of TOOL_SPECS) expect(prompts[0]).toContain(`- ${tool.name}:`);
  });
});
