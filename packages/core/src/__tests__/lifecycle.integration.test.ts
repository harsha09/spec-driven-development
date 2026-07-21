/**
 * Integration: full happy path through core (init → change → stages → verify → complete).
 * No live LLM; filesystem + engine only.
 */
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
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
  refreshActiveAgentContext,
  runLocalVerify,
} from "../index.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const d = temps.pop();
    if (d) await rm(d, { recursive: true, force: true });
  }
});

describe("lifecycle integration", () => {
  it("init(grok) → new → next → refresh → verify → complete", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-life-"));
    temps.push(root);

    // Setup is init alone (agent included) — no separate agents install
    await initProject({ projectRoot: root, agents: "grok" });
    expect(await pathExists(join(root, ".grok/rules/sdd.md"))).toBe(true);
    expect(await pathExists(join(root, ".sdd/protocol.md"))).toBe(true);
    expect(await pathExists(join(root, "AGENTS.md"))).toBe(true);

    const config = await loadConfig(root);
    const created = await createChange({
      projectRoot: root,
      config,
      title: "Lifecycle integration fix",
      workflowName: "hotfix",
    });
    expect(created.meta.stage).toBe("intent");

    await writeFile(
      join(created.path, "intent.md"),
      "# Intent\n\nMinimal fix for integration test: stop crash on empty list and show empty state instead.\n",
      "utf8",
    );

    // intent → implement
    const toImplement = await advanceStage(root, config, created.id);
    expect(toImplement.to).toBe("implement");

    const active = await refreshActiveAgentContext(root);
    expect(active).toBeTruthy();
    const activeBody = await readFile(active!, "utf8");
    expect(activeBody).toMatch(/Lifecycle integration fix/);
    expect(activeBody).toMatch(/protocol\.md/);

    // implement → local_verify
    const toVerify = await advanceStage(root, config, created.id);
    expect(toVerify.to).toBe("local_verify");

    await writeFile(
      join(created.path, "local-test-plan.md"),
      "# Plan\n\nOpen expenses with zero rows; expect empty state UI, no exception.\n",
      "utf8",
    );
    await writeFile(
      join(created.path, "local-test-results.md"),
      "# Results\n\nManually verified empty state on laptop; no crash. Edge case of slow network not tested.\n",
      "utf8",
    );

    const verify = await runLocalVerify(root, config, created.id, {
      runCommands: false,
    });
    expect(verify.stageId).toBe("local_verify");
    expect(verify.ok).toBe(true);
    expect(verify.evidencePath).toBeNull();
    expect(await pathExists(join(created.path, "evidence"))).toBe(false);
    expect(await pathExists(join(created.path, "local-test-results.md"))).toBe(true);

    // On last stage → complete in place (no archive by default)
    const { archivedTo, ctx } = await completeChange(root, config, created.id);
    expect(ctx.meta.status).toBe("completed");
    expect(archivedTo).toBeNull();
    expect(await pathExists(join(root, "changes", created.id))).toBe(true);
    expect(await pathExists(join(root, "archive", created.id))).toBe(false);
  });

  it("init(copilot) alone creates full agent setup without agents install", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-one-shot-"));
    temps.push(root);
    await initProject({ projectRoot: root, agents: "copilot" });

    expect(await pathExists(join(root, ".sdd/protocol.md"))).toBe(true);
    expect(await pathExists(join(root, ".github/agents/sdd.agent.md"))).toBe(true);
    expect(await pathExists(join(root, "AGENTS.md"))).toBe(true);
    expect(await pathExists(join(root, ".sdd/agents.json"))).toBe(true);
    expect(await pathExists(join(root, "memory/index.md"))).toBe(true);
    expect(await pathExists(join(root, ".sdd/workflows/hotfix.yaml"))).toBe(true);

    // Live coding loop still works
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "One shot after init",
      workflowName: "hotfix",
    });
    const built = await buildContext(root, config, ctx.id);
    expect(built.meta.stage).toBe("intent");
  });
});
