import { spawnSync } from "node:child_process";
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
  recordSignoff,
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

function git(root: string, args: string[]): string {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "git failed");
  return result.stdout.trim();
}

async function teamRepo(root: string, human = "Ada Lovelace"): Promise<void> {
  await writeFile(
    join(root, ".sdd", "team.yaml"),
    [
      "branch: bot/{bot}/{change}",
      "rooms:",
      "  commit: false",
      "bots:",
      "  - name: product-manager",
      "    role: product-manager",
      "    wip: 1",
      "humans:",
      `  - name: ${human}`,
      "",
    ].join("\n"),
    "utf8",
  );
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "ada@example.com"]);
  git(root, ["config", "user.name", human]);
  git(root, ["config", "commit.gpgsign", "false"]);
  await writeFile(join(root, "README.md"), "team\n", "utf8");
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-m", "init"]);
}

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
      "clarifications",
      "hld",
      "lld",
      "plan",
      "test_plan",
      "implement",
      "pr_review",
      "qa_testing",
      "qa_signoff",
      "po_review",
      "po_signoff",
    ]);
    const requirements = team.stages[0]!;
    expect(requirements.owner).toBe("product-manager");
    expect(requirements.collaborates).toEqual(["architect", "research-assistant"]);
    expect(requirements.gate.approvers).toEqual(["human"]);
    expect(requirements.gate.type).toBe("hard");
    expect(requirements.artifacts[0]?.path).toBe("requirements.md");
    const plan = team.stages.find((stage) => stage.id === "plan");
    const review = team.stages.find((stage) => stage.id === "pr_review");
    expect(plan?.artifacts.map((artifact) => artifact.path)).toEqual(["plan.md", "tasks/T-001.md"]);
    expect(review?.artifacts[0]?.path).toBe("reviews/R-001.md");
    expect(team.stages.find((stage) => stage.id === "test_plan")?.owner).toBe("qa");
    expect(team.stages.find((stage) => stage.id === "qa_signoff")?.owner).toBe("qa");
    expect(team.stages.find((stage) => stage.id === "po_signoff")?.owner).toBe("product-owner");
    for (const stage of team.stages) {
      expect(stage.gate.type).toBe("hard");
      expect(stage.gate.approvers).toEqual(["human"]);
    }
    const implement = team.stages.find((stage) => stage.id === "implement");
    expect(implement?.owner).toBe("developer");
    expect(implement?.items_from).toBe("tasks/T-*.md");

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

  it("stops on the requirements gate until a person signs this commit", async () => {
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

    await expect(advanceStage(root, config, ctx.id)).rejects.toThrow(/team config|sign-off/i);
    await approveGate(root, config, ctx.id, "requirements", "the person accepted the reading");
    await expect(advanceStage(root, config, ctx.id)).rejects.toThrow(/team config|sign-off/i);

    await teamRepo(root);
    await expect(advanceStage(root, config, ctx.id)).rejects.toThrow(/sign-off/i);
    expect((await recordSignoff(root, { note: "the person accepted the reading" })).exitCode).toBe(
      0,
    );
    git(root, ["commit", "--allow-empty", "-m", "later"]);
    await expect(advanceStage(root, config, ctx.id)).rejects.toThrow(/sign-off/i);
    expect((await recordSignoff(root, { note: "the person accepted the reading" })).exitCode).toBe(
      0,
    );
    const next = await advanceStage(root, config, ctx.id);
    expect(next.to).toBe("clarifications");
  });

  it("leaves a human gate when the person waives it", async () => {
    const root = await project();
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Waived reading",
      workflowName: "team-software",
    });
    await writeFile(join(ctx.path, "requirements.md"), meat("Requirements"), "utf8");
    await approveGate(root, config, ctx.id, "requirements", "waived for this try", "waived");
    const next = await advanceStage(root, config, ctx.id);
    expect(next.to).toBe("clarifications");
  });

  it("stays on a human gate when the gate is failed", async () => {
    const root = await project();
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Failed reading",
      workflowName: "team-software",
    });
    await teamRepo(root);
    await writeFile(join(ctx.path, "requirements.md"), meat("Requirements"), "utf8");
    expect((await recordSignoff(root, { note: "the person accepted the reading" })).exitCode).toBe(
      0,
    );
    await approveGate(root, config, ctx.id, "requirements", "the person stopped this", "failed");
    await expect(advanceStage(root, config, ctx.id)).rejects.toThrow(/not approved|gate/i);
  });

  it("stops on every stage until the person signs this commit", async () => {
    const root = await project();
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Sign each stage",
      workflowName: "team-software",
    });
    await teamRepo(root);
    const steps: Array<{ id: string; files: string[] }> = [
      { id: "requirements", files: ["requirements.md"] },
      { id: "clarifications", files: ["clarifications.md"] },
      { id: "hld", files: ["hld.md"] },
      { id: "lld", files: ["lld.md"] },
      { id: "plan", files: ["plan.md", "tasks/T-001.md"] },
      { id: "test_plan", files: ["test-plan.md"] },
      { id: "implement", files: [] },
      { id: "pr_review", files: ["reviews/R-001.md"] },
      { id: "qa_testing", files: ["qa-testing.md"] },
      { id: "qa_signoff", files: ["qa-signoff.md"] },
      { id: "po_review", files: ["po-review.md"] },
      { id: "po_signoff", files: ["po-signoff.md"] },
    ];
    const reviewPath = join(ctx.path, "reviews", "R-001.md");
    const distinctive = meat("Pull request review");
    await writeFile(join(ctx.path, "requirements.md"), meat("requirements"), "utf8");
    for (let index = 0; index < steps.length; index++) {
      const step = steps[index]!;
      if (index > 0) {
        const moved = await advanceStage(root, config, ctx.id);
        expect(moved.to).toBe(step.id);
        for (const rel of step.files) {
          const target = join(ctx.path, rel);
          await mkdir(join(target, ".."), { recursive: true });
          await writeFile(target, rel.endsWith("R-001.md") ? distinctive : meat(step.id), "utf8");
        }
      }
      await expect(advanceStage(root, config, ctx.id)).rejects.toThrow(/sign-off/i);
      expect((await recordSignoff(root, { note: `the person signed ${step.id}` })).exitCode).toBe(
        0,
      );
    }
    const sha = git(root, ["rev-parse", "HEAD"]);
    const qaSignoff = await readFile(join(ctx.path, "reviews", `qa_signoff-${sha}.md`), "utf8");
    expect(qaSignoff).toContain("reviewer: Ada Lovelace");
    expect(qaSignoff).toContain(`sha: ${sha}`);
    expect(qaSignoff).toContain("the person signed qa_signoff");
    const poSignoff = await readFile(join(ctx.path, "reviews", `po_signoff-${sha}.md`), "utf8");
    expect(poSignoff).toContain("the person signed po_signoff");
    expect(await readFile(reviewPath, "utf8")).toBe(distinctive);
    const done = await advanceStage(root, config, ctx.id);
    expect(done.to).toBeNull();
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
    for (let step = 0; stage !== "implement" && step < 12; step++) {
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
