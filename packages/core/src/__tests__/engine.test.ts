import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import {
  advanceStage,
  approveGate,
  buildContext,
  completeChange,
  createChange,
  initProject,
  loadConfig,
  loadWorkflow,
  pathExists,
  recommendWorkflow,
  runLocalVerify,
  skipStage,
  switchWorkflow,
} from "../index.js";

/** Enough prose to pass substantive artifact checks. */
const meat = (title: string) =>
  `# ${title}\n\nThis change fixes a real user-facing issue with enough detail that the stage artifact is not an empty template stub. Constraints and success criteria are explicit.\n`;

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
    await writeFile(join(ctx.path, "intent.md"), meat("Intent"), "utf8");

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
    await writeFile(join(ctx.path, "intent.md"), meat("Intent"), "utf8");
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
    await writeFile(join(ctx.path, "feature.md"), meat("Feature"), "utf8");
    await advanceStage(root, config, ctx.id); // -> hl_arb
    await writeFile(join(ctx.path, "hl-design.md"), meat("HL design"), "utf8");
    await writeFile(join(ctx.path, "arb-packet.md"), meat("ARB packet"), "utf8");
    await writeFile(join(ctx.path, "arb-decision.md"), meat("ARB decision"), "utf8");

    await expect(advanceStage(root, config, ctx.id)).rejects.toThrow(/Hard gate|gate/i);

    await approveGate(root, config, ctx.id, "hl_arb", "approved in review");
    const after = await advanceStage(root, config, ctx.id);
    expect(after.to).toBe("lld");
  });

  it("completes in place without archiving by default", async () => {
    const root = await tempProject();
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Tiny typo",
      workflowName: "hotfix",
    });
    await writeFile(join(ctx.path, "intent.md"), meat("Intent"), "utf8");
    await advanceStage(root, config, ctx.id); // implement
    await advanceStage(root, config, ctx.id); // local_verify
    await writeFile(
      join(ctx.path, "local-test-results.md"),
      meat("Local results") + "\nVerified empty state renders without crash.\n",
      "utf8",
    );
    const done = await completeChange(root, config, ctx.id);
    expect(done.ctx.meta.status).toBe("completed");
    expect(done.archivedTo).toBeNull();
    expect(done.ctx.path).toBe(ctx.path);
  });

  it("archives when config and workflow opt in", async () => {
    const root = await tempProject();
    const config = await loadConfig(root);
    config.persistence.archive_on_complete = true;
    await writeFile(
      join(root, ".sdd/workflows/archive-hotfix.yaml"),
      `name: archive-hotfix
description: hotfix with archive opt-in
version: 1
stages:
  - id: intent
    artifacts:
      - id: intent
        path: intent.md
        required: true
    gate: { type: soft }
  - id: implement
    artifacts: []
    gate: { type: soft }
  - id: local_verify
    artifacts:
      - id: local-test-results
        path: local-test-results.md
        required: false
    gate: { type: soft }
on_complete:
  archive: true
`,
      "utf8",
    );
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Archive me",
      workflowName: "archive-hotfix",
    });
    await writeFile(join(ctx.path, "intent.md"), meat("Intent"), "utf8");
    await advanceStage(root, config, ctx.id);
    await advanceStage(root, config, ctx.id);
    await writeFile(join(ctx.path, "local-test-results.md"), meat("Results"), "utf8");
    const done = await completeChange(root, config, ctx.id);
    expect(done.ctx.meta.status).toBe("completed");
    expect(done.archivedTo).toBeTruthy();
    expect(await pathExists(done.archivedTo!)).toBe(true);
    expect(await pathExists(ctx.path)).toBe(false);
  });

  it("fresh init does not create archive/", async () => {
    const root = await tempProject();
    expect(await pathExists(join(root, "archive"))).toBe(false);
    expect(await pathExists(join(root, "changes"))).toBe(true);
  });

  it("default feature workflow has no evidence paths", async () => {
    const root = await tempProject();
    const wf = await loadWorkflow(root, "feature");
    const verifyStage = wf.stages.find((s) => s.id === "local_verify");
    expect(verifyStage).toBeTruthy();
    expect(verifyStage!.verify?.evidence_dir).toBeUndefined();
    const evidenceArtifacts = (verifyStage!.artifacts ?? []).filter(
      (a) => a.id === "evidence" || a.path.includes("evidence"),
    );
    expect(evidenceArtifacts).toHaveLength(0);
    expect(wf.on_complete?.archive).toBe(false);
  });

  it("all shipped workflows have no evidence paths and do not archive by default", async () => {
    const root = await tempProject();
    for (const name of ["feature", "patch", "hotfix", "enterprise-feature", "spike"] as const) {
      const wf = await loadWorkflow(root, name);
      expect(wf.on_complete?.archive).toBe(false);
      for (const stage of wf.stages) {
        expect(stage.verify?.evidence_dir).toBeUndefined();
        for (const a of stage.artifacts ?? []) {
          expect(a.id).not.toBe("evidence");
          expect(a.path.includes("evidence")).toBe(false);
        }
      }
    }
  });

  it("verify without evidence_dir does not create evidence/", async () => {
    const root = await tempProject();
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "No evidence tree",
      workflowName: "hotfix",
    });
    await writeFile(join(ctx.path, "intent.md"), meat("Intent"), "utf8");
    await advanceStage(root, config, ctx.id);
    await advanceStage(root, config, ctx.id);
    const result = await runLocalVerify(root, config, ctx.id, { runCommands: false });
    expect(result.evidencePath).toBeNull();
    expect(await pathExists(join(ctx.path, "evidence"))).toBe(false);
    expect(await pathExists(join(ctx.path, "local-test-results.md"))).toBe(true);
    const after = await buildContext(root, config, ctx.id);
    expect(after.meta.verify_results.local_verify?.ok).toBe(true);
  });

  it("verify with evidence_dir creates evidence tree", async () => {
    const root = await tempProject();
    await writeFile(
      join(root, ".sdd/workflows/with-evidence.yaml"),
      `name: with-evidence
description: opt-in evidence
version: 1
stages:
  - id: local_verify
    artifacts: []
    gate: { type: soft }
    verify:
      commands: []
      evidence_dir: evidence/local
`,
      "utf8",
    );
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "With evidence",
      workflowName: "with-evidence",
    });
    const result = await runLocalVerify(root, config, ctx.id, { runCommands: false });
    expect(result.evidencePath).toBeTruthy();
    expect(await pathExists(join(ctx.path, "evidence", "local"))).toBe(true);
  });
});
