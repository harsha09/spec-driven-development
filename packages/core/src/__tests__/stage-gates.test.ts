/**
 * Unit tests for stage leave gates.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import {
  approveGate,
  buildContext,
  canLeaveStage,
  createChange,
  initProject,
  loadConfig,
} from "../index.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const d = temps.pop();
    if (d) await rm(d, { recursive: true, force: true });
  }
});

describe("canLeaveStage", () => {
  it("blocks when required artifact is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-gate-"));
    temps.push(root);
    await initProject({ projectRoot: root, agents: false });
    const config = await loadConfig(root);
    const ctx0 = await createChange({
      projectRoot: root,
      config,
      title: "Missing artifact gate",
      workflowName: "hotfix",
    });
    // Remove intent if materialize created it — recreate empty change without content
    // createChange materializes intent from template; delete file to simulate missing
    const { rm: rmFile } = await import("node:fs/promises");
    await rmFile(join(ctx0.path, "intent.md"));

    const ctx = await buildContext(root, config, ctx0.id);
    const check = await canLeaveStage(ctx, config);
    expect(check.ok).toBe(false);
    expect(check.errors.some((e) => /intent\.md/i.test(e))).toBe(true);
  });

  it("allows leave when required artifact exists (soft gate)", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-gate-ok-"));
    temps.push(root);
    await initProject({ projectRoot: root, agents: false });
    const config = await loadConfig(root);
    const ctx0 = await createChange({
      projectRoot: root,
      config,
      title: "Soft gate ok",
      workflowName: "hotfix",
    });
    await writeFile(join(ctx0.path, "intent.md"), "# Intent\n\nok\n", "utf8");
    await approveGate(root, config, ctx0.id, "intent", "lgtm", "approved");

    const ctx = await buildContext(root, config, ctx0.id);
    const check = await canLeaveStage(ctx, config);
    expect(check.ok).toBe(true);
  });
});
