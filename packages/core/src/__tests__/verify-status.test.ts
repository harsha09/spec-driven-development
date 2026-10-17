import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import {
  advanceStage,
  buildContext,
  completeChange,
  createChange,
  initProject,
  loadConfig,
  pathExists,
  runLocalVerify,
  saveChangeMeta,
  syncChangeHead,
} from "../index.js";

/** Issue #12: `sdd verify` must never report PASS when nothing ran or a command failed. */

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const d = temps.pop();
    if (d) await rm(d, { recursive: true, force: true });
  }
});

type Cmd = { name: string; run: string; required?: boolean };

async function projectWithVerify(commands: Cmd[]) {
  const root = await mkdtemp(join(tmpdir(), "sdd-verify-status-"));
  temps.push(root);
  await initProject({ projectRoot: root });
  const cmdYaml = commands.length
    ? commands
        .map(
          (c) =>
            `        - name: ${c.name}\n          run: ${JSON.stringify(c.run)}\n          required: ${c.required ? "true" : "false"}`,
        )
        .join("\n")
    : "";
  await writeFile(
    join(root, ".sdd/workflows/vt.yaml"),
    `name: vt
description: verify status test
version: 1
stages:
  - id: build
    artifacts: []
    gate: { type: soft }
  - id: local_verify
    artifacts: []
    gate: { type: soft }
    verify:
      commands:${commands.length ? `\n${cmdYaml}` : " []"}
`,
    "utf8",
  );
  const config = await loadConfig(root);
  const ctx = await createChange({
    projectRoot: root,
    config,
    title: "Verify status",
    workflowName: "vt",
  });
  return { root, config, ctx };
}

describe("sdd verify status (no silent PASS)", () => {
  it("wrong stage: NOT RUN, records nothing", async () => {
    const { root, config, ctx } = await projectWithVerify([
      { name: "ok", run: "true", required: true },
    ]);
    const r = await runLocalVerify(root, config, ctx.id);
    expect(r.status).toBe("not_run");
    expect(r.ok).toBe(false);
    expect(r.results).toHaveLength(0);
    expect(r.reason).toContain('run sdd verify on "local_verify"');
    expect(r.resultsPath).toBeNull();
    expect(await pathExists(join(ctx.path, "local-test-results.md"))).toBe(false);
    const after = await buildContext(root, config, ctx.id);
    expect(after.meta.verify_results.build).toBeUndefined();
  });

  it("zero commands configured: NOT RUN", async () => {
    const { root, config, ctx } = await projectWithVerify([]);
    await advanceStage(root, config, ctx.id);
    const r = await runLocalVerify(root, config, ctx.id);
    expect(r.status).toBe("not_run");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("no verify commands configured");
    const md = await readFile(join(ctx.path, "local-test-results.md"), "utf8");
    expect(md).toContain("Overall: NOT RUN");
    expect(md).not.toContain("Overall: PASS");
    const after = await buildContext(root, config, ctx.id);
    expect(after.meta.verify_results.local_verify?.status).toBe("not_run");
    expect(after.meta.verify_results.local_verify?.ok).toBe(false);
  });

  it("--no-run with commands configured: NOT RUN and required gate still blocks", async () => {
    const { root, config, ctx } = await projectWithVerify([
      { name: "ok", run: "true", required: true },
    ]);
    await advanceStage(root, config, ctx.id);
    const r = await runLocalVerify(root, config, ctx.id, { runCommands: false });
    expect(r.status).toBe("not_run");
    expect(r.reason).toContain("--no-run");
    await expect(completeChange(root, config, ctx.id)).rejects.toThrow(/Required local verify/);
  });

  it("--no-run does not execute a command that would create a marker (#19)", async () => {
    const marker = join(tmpdir(), `sdd-norun-${Date.now()}.flag`);
    const { root, config, ctx } = await projectWithVerify([
      { name: "marker", run: `touch ${JSON.stringify(marker)}`, required: true },
    ]);
    await advanceStage(root, config, ctx.id);
    const r = await runLocalVerify(root, config, ctx.id, { runCommands: false });
    expect(r.status).toBe("not_run");
    expect(r.reason).toContain("--no-run");
    expect(r.results).toHaveLength(0);
    expect(await pathExists(marker)).toBe(false);
  });

  it("all commands pass: PASS and the stage can complete", async () => {
    const { root, config, ctx } = await projectWithVerify([
      { name: "unit", run: "true", required: true },
      { name: "lint", run: "true" },
    ]);
    await advanceStage(root, config, ctx.id);
    const r = await runLocalVerify(root, config, ctx.id);
    expect(r.status).toBe("pass");
    expect(r.ok).toBe(true);
    expect(r.reason).toBeUndefined();
    const md = await readFile(join(ctx.path, "local-test-results.md"), "utf8");
    expect(md).toContain("Overall: PASS");
    const { ctx: done } = await completeChange(root, config, ctx.id);
    expect(done.meta.status).toBe("completed");
  });

  it("stale SHA and result-count references fail before verification can pass", async () => {
    const { root, config, ctx } = await projectWithVerify([
      { name: "unit", run: "true", required: true },
      { name: "lint", run: "true" },
    ]);
    await advanceStage(root, config, ctx.id);
    const originalSha = "a".repeat(40);
    const currentSha = "b".repeat(40);

    const first = await runLocalVerify(root, config, ctx.id, { headSha: originalSha });
    expect(first.status).toBe("pass");
    await expect(runLocalVerify(root, config, ctx.id, { headSha: null })).rejects.toThrow(
      /Git HEAD is unavailable/i,
    );
    await expect(runLocalVerify(root, config, ctx.id, { headSha: currentSha })).rejects.toThrow(
      /stale sha.*meta\.yaml/i,
    );

    const synced = await syncChangeHead(root, config, ctx.id, { headSha: currentSha });
    expect(synced.updatedResults).toBe(1);
    await expect(
      runLocalVerify(root, config, ctx.id, { headSha: currentSha }),
    ).resolves.toMatchObject({ status: "pass" });

    const resultsPath = join(ctx.path, "local-test-results.md");
    const report = await readFile(resultsPath, "utf8");
    await writeFile(resultsPath, report.replace('result_count="2"', 'result_count="3"'));
    await expect(runLocalVerify(root, config, ctx.id, { headSha: currentSha })).rejects.toThrow(
      /result count mismatch.*local-test-results\.md/i,
    );
  });

  it("preserves human-authored verification notes across repeated runs", async () => {
    const { root, config, ctx } = await projectWithVerify([{ name: "unit", run: "true" }]);
    await advanceStage(root, config, ctx.id);
    const resultsPath = join(ctx.path, "local-test-results.md");
    await writeFile(resultsPath, "# Human notes\n\nKeep this context.\n");

    await runLocalVerify(root, config, ctx.id, { headSha: "c".repeat(40) });
    await runLocalVerify(root, config, ctx.id, { headSha: "c".repeat(40) });

    const report = await readFile(resultsPath, "utf8");
    expect(report).toContain("# Human notes\n\nKeep this context.");
    expect(report.match(/Keep this context\./g)).toHaveLength(1);
    expect(report.match(/Latest run \(/g)).toHaveLength(2);
  });

  it("fails when an SDD report marker has no matching metadata record", async () => {
    const { root, config, ctx } = await projectWithVerify([{ name: "unit", run: "true" }]);
    await advanceStage(root, config, ctx.id);
    const headSha = "d".repeat(40);
    await runLocalVerify(root, config, ctx.id, { headSha });
    const changed = await buildContext(root, config, ctx.id);
    changed.meta.verify_results = {};
    await saveChangeMeta(root, config, changed.meta);

    await expect(runLocalVerify(root, config, ctx.id, { headSha })).rejects.toThrow(
      /missing verification metadata.*local-test-results\.md/i,
    );
  });

  it("required command fails: FAIL and the gate blocks completion", async () => {
    const { root, config, ctx } = await projectWithVerify([
      { name: "unit", run: "exit 3", required: true },
      { name: "lint", run: "true" },
    ]);
    await advanceStage(root, config, ctx.id);
    const r = await runLocalVerify(root, config, ctx.id);
    expect(r.status).toBe("fail");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("failed: unit");
    const md = await readFile(join(ctx.path, "local-test-results.md"), "utf8");
    expect(md).toContain("Overall: FAIL");
    expect(md).toContain("(FAILED)");
    await expect(completeChange(root, config, ctx.id)).rejects.toThrow(/Required local verify/);
  });

  it("optional command fails: verify FAILs, but gate passes when required commands passed", async () => {
    const { root, config, ctx } = await projectWithVerify([
      { name: "unit", run: "true", required: true },
      { name: "lint", run: "exit 1" },
    ]);
    await advanceStage(root, config, ctx.id);
    const r = await runLocalVerify(root, config, ctx.id);
    expect(r.status).toBe("fail");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("failed: lint");
    const { ctx: done } = await completeChange(root, config, ctx.id);
    expect(done.meta.status).toBe("completed");
  });
});
