import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import {
  initProject,
  loadConfig,
  createChange,
  advanceStage,
  skipStage,
  completeChange,
  getActiveChangeId,
  buildContext,
  switchWorkflow,
  approveGate,
  recommendWorkflow,
  runLocalVerify,
  nextStageId,
  loadWorkflow,
  listChanges,
  activePointerPath,
  pathExists,
  readText,
  type ChangeMeta,
} from "../index.js";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const meat = (t: string) =>
  `# ${t}\n\nSubstantive stage content for tests so empty templates do not pass completeness checks. Includes constraints and expected outcomes for the change.\n`;

const temps: string[] = [];

async function tempProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "sdd-bug-"));
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

describe("dynamic analysis / edge cases", () => {
  it("skip current stage advances forward (not back to first)", async () => {
    const root = await tempProject();
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Skip current test",
      workflowName: "feature",
    });
    await writeFile(join(ctx.path, "feature.md"), meat("Feature"), "utf8");
    await skipStage(root, config, ctx.id, "clarify_intent", "n/a");
    await skipStage(root, config, ctx.id, "brainstorm", "n/a");
    await advanceStage(root, config, ctx.id);
    let c = await buildContext(root, config, ctx.id);
    expect(c.meta.stage).toBe("design");
    // design is required (not skippable) — fill and advance; skip optional clarify_design
    await writeFile(
      join(ctx.path, "design.md"),
      meat("Design") + "\nUse existing export pipeline with streaming CSV writer.\n",
      "utf8",
    );
    c = await skipStage(root, config, ctx.id, "clarify_design", "n/a");
    // still on design until we next
    const advanced = await advanceStage(root, config, ctx.id);
    expect(advanced.to).toBe("tasks");
    // skip current tasks stage advances forward (not back)
    c = await skipStage(root, config, ctx.id, "tasks", "n/a");
    expect(["clarify_tasks", "implement"]).toContain(c.meta.stage);
    expect(c.meta.stage).not.toBe("intent");
  });

  it("clears active pointer after complete", async () => {
    const root = await tempProject();
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Complete pointer",
      workflowName: "hotfix",
    });
    await writeFile(join(ctx.path, "intent.md"), meat("Intent"), "utf8");
    await advanceStage(root, config, ctx.id);
    await advanceStage(root, config, ctx.id);
    await writeFile(join(ctx.path, "local-test-results.md"), meat("Results"), "utf8");
    const done = await completeChange(root, config, ctx.id);
    expect(done.archivedTo).toBeNull();
    expect(await pathExists(ctx.path)).toBe(true);
    const raw = (await readText(activePointerPath(root, config))).trim();
    const active = await getActiveChangeId(root, config);
    expect(active).not.toBe(ctx.id);
    expect(raw === "" || raw !== ctx.id).toBe(true);
  });

  it("preferred workflow respects allowlist", async () => {
    const root = await tempProject();
    const cfgPath = join(root, ".sdd/config.yaml");
    const cfg = parseYaml(await readFile(cfgPath, "utf8")) as Record<string, unknown>;
    cfg.allowed_workflows = ["hotfix", "patch"];
    await writeFile(cfgPath, stringifyYaml(cfg));
    const config = await loadConfig(root);
    await expect(
      recommendWorkflow(root, "x", config, { preferred: "enterprise-feature" }),
    ).rejects.toThrow(/not available|allowed/i);
  });

  it("createChange lands past auto-skipped first stage", async () => {
    const root = await tempProject();
    await writeFile(
      join(root, ".sdd/workflows/skipfirst.yaml"),
      `name: skipfirst
description: test
version: 1
stages:
  - id: optional_research
    skippable: true
    skip_when:
      flags: [no_research]
    artifacts:
      - id: research
        path: research.md
        required: true
    gate:
      type: soft
  - id: implement
    skippable: false
    artifacts: []
    gate:
      type: soft
`,
    );
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Skip first stage",
      workflowName: "skipfirst",
      flags: { no_research: true },
    });
    expect(ctx.meta.stage).toBe("implement");
  });

  it("duplicate titles get unique change ids", async () => {
    const root = await tempProject();
    const config = await loadConfig(root);
    const a = await createChange({
      projectRoot: root,
      config,
      title: "Dup Title XYZ",
      workflowName: "hotfix",
    });
    const b = await createChange({
      projectRoot: root,
      config,
      title: "Dup Title XYZ",
      workflowName: "hotfix",
    });
    expect(b.id).not.toBe(a.id);
  });

  it("complete mid-workflow fails", async () => {
    const root = await tempProject();
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Mid complete",
      workflowName: "feature",
    });
    await expect(completeChange(root, config, ctx.id)).rejects.toThrow(/Cannot complete/);
  });

  it("hard gate blocks then approve advances", async () => {
    const root = await tempProject();
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Hard gate",
      workflowName: "enterprise-feature",
    });
    await writeFile(join(ctx.path, "feature.md"), meat("Feature"), "utf8");
    await advanceStage(root, config, ctx.id);
    await writeFile(join(ctx.path, "hl-design.md"), meat("HL design"), "utf8");
    await writeFile(join(ctx.path, "arb-packet.md"), meat("ARB packet"), "utf8");
    await writeFile(join(ctx.path, "arb-decision.md"), meat("ARB decision"), "utf8");
    await expect(advanceStage(root, config, ctx.id)).rejects.toThrow(/Hard gate/);
    await approveGate(root, config, ctx.id, "hl_arb");
    const r = await advanceStage(root, config, ctx.id);
    expect(r.to).toBe("lld");
  });

  it("advance skips auto-skipped middle stage", async () => {
    const root = await tempProject();
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Auto skip middle",
      workflowName: "enterprise-feature",
      flags: { no_db: true },
    });
    await writeFile(join(ctx.path, "feature.md"), meat("Feature"), "utf8");
    await advanceStage(root, config, ctx.id);
    await writeFile(join(ctx.path, "hl-design.md"), meat("HL design"), "utf8");
    await writeFile(join(ctx.path, "arb-packet.md"), meat("ARB packet"), "utf8");
    await writeFile(join(ctx.path, "arb-decision.md"), meat("ARB decision"), "utf8");
    await approveGate(root, config, ctx.id, "hl_arb");
    await advanceStage(root, config, ctx.id);
    await writeFile(join(ctx.path, "lld.md"), meat("LLD"), "utf8");
    const r = await advanceStage(root, config, ctx.id);
    expect(r.to).toBe("code_research");
  });

  it("nextStageId from skipped current goes forward", async () => {
    const root = await tempProject();
    const wf = await loadWorkflow(root, "feature");
    const meta = {
      id: "x",
      title: "x",
      workflow: "feature",
      created: new Date().toISOString(),
      status: "in_progress" as const,
      stage: "design",
      flags: {},
      overrides: {
        skip_stages: ["design", "clarify_design"],
        gates: {},
        extra_stages: [],
      },
      skipped: [
        { stage: "design", reason: "x", at: new Date().toISOString() },
        { stage: "clarify_design", reason: "x", at: new Date().toISOString() },
      ],
      gates: {},
      verify_results: {},
    } satisfies ChangeMeta;
    expect(nextStageId(wf, meta)).toBe("tasks");
  });

  it("switch workflow keeps shared stage name", async () => {
    const root = await tempProject();
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Switch wf",
      workflowName: "hotfix",
    });
    const sw = await switchWorkflow(root, config, ctx.id, "feature", "grew");
    expect(sw.meta.workflow).toBe("feature");
    expect(sw.meta.stage).toBe("intent");
  });

  it("listChanges finds concurrent changes", async () => {
    const root = await tempProject();
    const config = await loadConfig(root);
    await createChange({ projectRoot: root, config, title: "Multi A", workflowName: "hotfix" });
    await createChange({ projectRoot: root, config, title: "Multi B", workflowName: "hotfix" });
    const list = await listChanges(root, config);
    expect(list.length).toBeGreaterThanOrEqual(2);
  });

  it("required verify command failure blocks complete without approve", async () => {
    const root = await tempProject();
    await writeFile(
      join(root, ".sdd/workflows/verifyreq.yaml"),
      `name: verifyreq
description: test
version: 1
stages:
  - id: implement
    artifacts: []
    gate: { type: soft }
  - id: local_verify
    artifacts: []
    gate:
      type: hard
      checklist: ["ok"]
    verify:
      commands:
        - name: failme
          run: "exit 1"
          required: true
      evidence_dir: evidence/local
`,
    );
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Verify req",
      workflowName: "verifyreq",
    });
    await advanceStage(root, config, ctx.id);
    const v = await runLocalVerify(root, config, ctx.id, { runCommands: true });
    expect(v.ok).toBe(false);
    expect(v.results.some((r) => r.exitCode !== 0)).toBe(true);
    // Hard gate + failed required verify → complete must fail
    await expect(completeChange(root, config, ctx.id)).rejects.toThrow();
  });

  it("uniqueChangeDirName helper is stable", async () => {
    const { uniqueChangeDirName } = await import("../slug.js");
    const taken = new Set(["2026-01-01-foo"]);
    expect(uniqueChangeDirName("2026-01-01-foo", taken)).toBe("2026-01-01-foo-2");
    taken.add("2026-01-01-foo-2");
    expect(uniqueChangeDirName("2026-01-01-foo", taken)).toBe("2026-01-01-foo-3");
  });
});
