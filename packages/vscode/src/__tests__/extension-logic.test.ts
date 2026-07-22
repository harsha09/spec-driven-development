/**
 * Unit tests for VS Code extension wiring (no Electron).
 * Proves commands map to core and agent files exist after init.
 */
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  initProject,
  createChange,
  loadConfig,
  advanceStage,
  installAgentIntegration,
  refreshActiveAgentContext,
  pathExists,
} from "@structured-vibe-coding/core";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const d = temps.pop();
    if (d) await rm(d, { recursive: true, force: true });
  }
});

describe("VS Code extension use-cases (core path)", () => {
  it("SDD init + new + next matches what extension commands call", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-vsc-"));
    temps.push(root);

    // structuredVibe.init with explicit AI agent (picker in UI)
    await initProject({ projectRoot: root, agents: "copilot" });
    expect(await pathExists(join(root, ".sdd/config.yaml"))).toBe(true);
    // Agents only for selected platform (no skills / fat instructions)
    expect(await pathExists(join(root, ".sdd/protocol.md"))).toBe(true);
    expect(await pathExists(join(root, ".github/agents/sdd.agent.md"))).toBe(true);
    expect(await pathExists(join(root, ".claude/agents/sdd.md"))).toBe(false);
    expect(await pathExists(join(root, ".claude/skills/sdd/SKILL.md"))).toBe(false);

    // structuredVibe.new
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "VS Code feature",
      workflowName: "feature",
    });
    expect(ctx.meta.stage).toBe("intent");

    // Stage leave requires substantive artifacts (not empty templates)
    await writeFile(
      join(ctx.path, "feature.md"),
      [
        "# Feature",
        "",
        "Users need a VS Code command to advance SDD stages from the command palette.",
        "Non-goals: reimplement the CLI. Success: next advances after intent is filled.",
        "",
      ].join("\n"),
      "utf8",
    );

    // structuredVibe.next — feature workflow goes to optional clarify_intent first
    const next = await advanceStage(root, config, ctx.id);
    expect(next.to).toBe("clarify_intent");

    // structuredVibe agent context refresh
    const active = await refreshActiveAgentContext(root);
    const md = await readFile(active!, "utf8");
    expect(md).toContain("VS Code feature");
  });

  it("installs only copilot agents when requested", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-vsc-cop-"));
    temps.push(root);
    await initProject({ projectRoot: root, agents: false });
    await installAgentIntegration({
      projectRoot: root,
      target: "copilot",
      force: true,
    });
    expect(await pathExists(join(root, ".github/agents/sdd.agent.md"))).toBe(true);
    expect(await pathExists(join(root, ".claude/agents/sdd.md"))).toBe(false);
    expect(await pathExists(join(root, ".sdd/protocol.md"))).toBe(true);
  });

  it("init with grok alone is enough (no separate install)", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-vsc-grok-"));
    temps.push(root);
    await initProject({ projectRoot: root, agents: "grok" });
    expect(await pathExists(join(root, ".grok/rules/sdd.md"))).toBe(true);
    expect(await pathExists(join(root, "AGENTS.md"))).toBe(true);
    expect(await pathExists(join(root, ".claude/agents/sdd.md"))).toBe(false);
    expect(await pathExists(join(root, "memory/index.md"))).toBe(true);
  });
});
