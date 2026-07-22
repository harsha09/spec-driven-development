/**
 * Stage-scoped refine plan: focus/prior resolution, constitution RO, brief write.
 */
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildRefinePlan,
  createChange,
  initProject,
  loadConfig,
  writeRefineBrief,
} from "../index.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const d = temps.pop();
    if (d) await rm(d, { recursive: true, force: true });
  }
});

describe("refine plan", () => {
  it("defaults focus to current stage and lists prior artifacts", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-refine-"));
    temps.push(root);
    await initProject({ projectRoot: root, agents: false });
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Refine plan feature",
      workflowName: "feature",
    });
    // Advance pointer to design without full gates (meta only) by writing meat + skip optionals
    await writeFile(
      join(ctx.path, "feature.md"),
      "# Feature\n\nUsers need export of reports as CSV only. Non-goals: PDF. Success: 10k rows download works.\n",
      "utf8",
    );

    // Stay on intent: prior empty, focus feature.md
    const planIntent = await buildRefinePlan({
      projectRoot: root,
      config,
      changeId: ctx.id,
    });
    expect(planIntent.focusStageId).toBe("intent");
    expect(planIntent.focusArtifacts.some((a) => a.path === "feature.md")).toBe(
      true,
    );
    expect(planIntent.priorArtifacts.length).toBe(0);
    expect(planIntent.briefMarkdown).toMatch(/Never edit/i);
    expect(planIntent.briefMarkdown).toMatch(/constitution/i);
    expect(planIntent.kickoff).toMatch(/refine stage/);

    // Named stage design even if not current
    const planDesign = await buildRefinePlan({
      projectRoot: root,
      config,
      changeId: ctx.id,
      stageId: "design",
    });
    expect(planDesign.focusStageId).toBe("design");
    expect(planDesign.focusArtifacts.some((a) => a.path === "design.md")).toBe(
      true,
    );
    expect(planDesign.priorArtifacts.some((a) => a.path === "feature.md")).toBe(
      true,
    );
    expect(planDesign.briefMarkdown).toMatch(/Prior stage artifacts/i);
    expect(planDesign.briefMarkdown).toMatch(/rg|grep|search/i);

    const path = await writeRefineBrief(planDesign, root);
    expect(path).toBe(planDesign.briefPath);
    const body = await readFile(path, "utf8");
    expect(body).toContain("design");
    expect(body).toMatch(/READ-ONLY|read only/i);
  });

  it("analyze mode and focusOnly appear in brief", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-refine-a-"));
    temps.push(root);
    await initProject({ projectRoot: root, agents: false });
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Analyze only",
      workflowName: "hotfix",
    });
    const plan = await buildRefinePlan({
      projectRoot: root,
      config,
      changeId: ctx.id,
      mode: "analyze",
      focusOnly: true,
    });
    expect(plan.mode).toBe("analyze");
    expect(plan.focusOnly).toBe(true);
    expect(plan.briefMarkdown).toMatch(/### analyze/i);
    expect(plan.briefMarkdown).toMatch(/focusOnly/i);
    expect(plan.kickoff).toMatch(/ANALYZE|analyze/);
  });

  it("rejects unknown stage id", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-refine-bad-"));
    temps.push(root);
    await initProject({ projectRoot: root, agents: false });
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Bad stage",
      workflowName: "hotfix",
    });
    await expect(
      buildRefinePlan({
        projectRoot: root,
        config,
        changeId: ctx.id,
        stageId: "not_a_stage",
      }),
    ).rejects.toThrow(/Unknown stage/);
  });
});
