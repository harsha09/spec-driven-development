import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import {
  advanceStage,
  approveGate,
  completeChange,
  createChange,
  initProject,
  loadConfig,
  recommendWorkflow,
  skipStage,
  switchWorkflow,
} from "../index.js";

const temps: string[] = [];

async function tempProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "sdd-test-"));
  temps.push(dir);
  await initProject({ projectRoot: dir });
  return dir;
}

afterEach(async () => {
  while (temps.length) {
    const d = temps.pop();
    if (d) await rm(d, { recursive: true, force: true });
  }
});

describe("init + workflows", () => {
  it("initializes project with default workflows", async () => {
    const root = await tempProject();
    const config = await loadConfig(root);
    expect(config.version).toBe(1);
    const rec = await recommendWorkflow(root, "fix typo in readme", config);
    expect(rec.name).toBe("hotfix");
  });

  it("recommends feature for medium work", async () => {
    const root = await tempProject();
    const config = await loadConfig(root);
    const rec = await recommendWorkflow(root, "Add CSV export for reports", config);
    expect(["feature", "patch"]).toContain(rec.name);
  });
});

describe("change lifecycle", () => {
  it("creates change and advances stages", async () => {
    const root = await tempProject();
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Fix null crash",
      workflowName: "hotfix",
    });
    expect(ctx.meta.stage).toBe("intent");
    expect(ctx.meta.workflow).toBe("hotfix");

    const next = await advanceStage(root, config, ctx.id);
    expect(next.to).toBe("implement");

    const next2 = await advanceStage(root, config, ctx.id);
    expect(next2.to).toBe("local_verify");
  });

  it("skips stage per change", async () => {
    const root = await tempProject();
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Small patch",
      workflowName: "patch",
    });
    await advanceStage(root, config, ctx.id); // acceptance
    const skipped = await skipStage(root, config, ctx.id, "acceptance", "trivial");
    expect(skipped.meta.overrides.skip_stages).toContain("acceptance");
  });

  it("switches workflow per change", async () => {
    const root = await tempProject();
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Grew larger",
      workflowName: "patch",
    });
    const switched = await switchWorkflow(root, config, ctx.id, "feature", "scope grew");
    expect(switched.meta.workflow).toBe("feature");
  });

  it("requires hard gate approval on enterprise-feature", async () => {
    const root = await tempProject();
    const config = await loadConfig(root);
    // use hard gates as defined in workflow (policy soft may affect — check enterprise)
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Platform auth epic",
      workflowName: "enterprise-feature",
    });
    await advanceStage(root, config, ctx.id); // -> hl_arb

    await expect(advanceStage(root, config, ctx.id)).rejects.toThrow(/Hard gate|gate/i);

    await approveGate(root, config, ctx.id, "hl_arb", "approved in review");
    const after = await advanceStage(root, config, ctx.id);
    expect(after.to).toBe("lld");
  });

  it("completes and archives", async () => {
    const root = await tempProject();
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Tiny typo",
      workflowName: "hotfix",
    });
    await advanceStage(root, config, ctx.id); // implement
    await advanceStage(root, config, ctx.id); // local_verify
    const done = await completeChange(root, config, ctx.id);
    expect(done.ctx.meta.status).toBe("completed");
    expect(done.archivedTo).toBeTruthy();
  });
});
