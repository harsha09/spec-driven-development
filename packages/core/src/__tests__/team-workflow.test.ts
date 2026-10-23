import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import { readYaml, writeYaml } from "../fs.js";
import {
  advanceStage,
  approveGate,
  buildAgentPrompt,
  createChange,
  initProject,
  loadConfig,
  loadWorkflow,
} from "../index.js";
import { WorkflowSchema } from "../schemas.js";
import { syncStageItems } from "../stage-items.js";

const meat = (title: string) =>
  `# ${title}\n\nThis change fixes a real user-facing issue with enough detail that the stage artifact is not an empty template stub. Constraints and success criteria are explicit.\n`;

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sdd-team-wf-"));
  temps.push(root);
  await initProject({ projectRoot: root });
  return root;
}

describe("team-software workflow", () => {
  it("names owners and approvers and still loads a pack that omits them", async () => {
    const root = await project();
    const team = await loadWorkflow(root, "team-software");
    expect(team.stages.map((stage) => stage.id)).toEqual([
      "requirements",
      "architecture",
      "stories",
      "plan",
      "tasks",
      "implement",
      "pr_review",
      "acceptance",
    ]);
    const requirements = team.stages[0]!;
    expect(requirements.owner).toBe("product-manager");
    expect(requirements.collaborates).toEqual(["architect"]);
    expect(requirements.gate.approvers).toEqual(["human"]);
    expect(requirements.gate.type).toBe("hard");
    expect(requirements.artifacts[0]?.path).toBe("requirements.md");
    const story = team.stages.find((stage) => stage.id === "stories");
    const tasks = team.stages.find((stage) => stage.id === "tasks");
    const review = team.stages.find((stage) => stage.id === "pr_review");
    expect(story?.artifacts[0]?.path).toBe("stories/S-001.md");
    expect(tasks?.artifacts[0]?.path).toBe("tasks/T-001.md");
    expect(review?.artifacts[0]?.path).toBe("reviews/R-001.md");
    const implement = team.stages.find((stage) => stage.id === "implement");
    expect(implement?.owner).toBe("developer");
    expect(implement?.items_from).toBe("tasks/T-*.md");
    expect(team.stages.find((stage) => stage.id === "acceptance")?.gate.type).toBe("hard");

    const feature = await loadWorkflow(root, "feature");
    const intent = feature.stages[0]!;
    expect(intent.owner).toBeUndefined();
    expect(intent.collaborates).toBeUndefined();
    expect(intent.gate.approvers).toBeUndefined();
    expect(intent.items_from).toBeUndefined();

    const bad = WorkflowSchema.safeParse({
      name: "bad",
      stages: [{ id: "implement", items_from: "../tasks/*.md" }],
    });
    expect(bad.success).toBe(false);
  });

  it("stops on the requirements gate until a person approves it", async () => {
    const root = await project();
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Team workflow slice",
      workflowName: "team-software",
    });
    expect(ctx.meta.stage).toBe("requirements");
    const body = await readFile(join(ctx.path, "requirements.md"), "utf8");
    expect(body).toContain("Team workflow slice");
    await writeFile(join(ctx.path, "requirements.md"), meat("Requirements"), "utf8");
    const handoff = await buildAgentPrompt(ctx, config, root);
    expect(handoff).toContain("Owner: product-manager");
    expect(handoff).toContain("Works with: architect");
    expect(handoff).toContain("Approvers: human");

    await expect(advanceStage(root, config, ctx.id)).rejects.toThrow(/Hard gate|gate/i);
    await approveGate(root, config, ctx.id, "requirements", "the person accepted the reading");
    const next = await advanceStage(root, config, ctx.id);
    expect(next.to).toBe("architecture");
  });

  it("writes one implement item per task file and keeps done", async () => {
    const root = await project();
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Task items",
      workflowName: "team-software",
    });
    let stage = ctx.meta.stage;
    for (let step = 0; stage !== "implement" && step < 8; step++) {
      const advanced = await advanceStage(root, config, ctx.id, { force: true });
      stage = advanced.ctx.meta.stage;
    }
    expect(stage).toBe("implement");

    const first = await readYaml<Array<{ id: string; status: string; source: string }>>(
      join(ctx.path, "items.yaml"),
    );
    expect(first).toEqual([
      { id: "T-001", stage: "implement", source: "tasks/T-001.md", status: "open" },
    ]);

    await mkdir(join(ctx.path, "tasks"), { recursive: true });
    await writeFile(
      join(ctx.path, "tasks", "T-002.md"),
      "# T-002\n\nAdd the second task.\n",
      "utf8",
    );
    await writeYaml(join(ctx.path, "items.yaml"), [
      { id: "T-001", stage: "implement", source: "tasks/T-001.md", status: "done" },
    ]);
    const implement = (await loadWorkflow(root, "team-software")).stages.find(
      (item) => item.id === "implement",
    );
    expect(implement).toBeTruthy();
    await syncStageItems(ctx.path, implement!);
    const second = await readYaml(join(ctx.path, "items.yaml"));
    expect(second).toEqual([
      { id: "T-001", stage: "implement", source: "tasks/T-001.md", status: "done" },
      { id: "T-002", stage: "implement", source: "tasks/T-002.md", status: "open" },
    ]);

    await writeFile(join(ctx.path, "items.yaml"), "nope\n", "utf8");
    await expect(syncStageItems(ctx.path, implement!)).rejects.toThrow("items.yaml is invalid");
  });
});
