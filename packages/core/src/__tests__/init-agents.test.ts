/**
 * Unit tests: init alone is enough to install agents (no separate agents install).
 */
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import {
  AGENT_INTEGRATIONS,
  initProject,
  pathExists,
  type AgentTarget,
} from "../index.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const d = temps.pop();
    if (d) await rm(d, { recursive: true, force: true });
  }
});

async function freshRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "sdd-init-ag-"));
  temps.push(dir);
  return dir;
}

describe("init installs agents without separate agents install", () => {
  it.each([
    {
      target: "copilot" as AgentTarget,
      present: ".github/agents/sdd.agent.md",
      absent: [".claude/agents/sdd.md", ".grok/rules/sdd.md"],
      aiKey: "copilot",
    },
    {
      target: "claude-code" as AgentTarget,
      present: ".claude/agents/sdd.md",
      absent: [".github/agents/sdd.agent.md", ".grok/rules/sdd.md"],
      aiKey: "claude",
    },
    {
      target: "grok" as AgentTarget,
      present: ".grok/rules/sdd.md",
      absent: [".github/agents/sdd.agent.md", ".claude/agents/sdd.md"],
      aiKey: "grok",
    },
  ])("init with agents=$target installs only that host", async ({ target, present, absent, aiKey }) => {
    const root = await freshRoot();
    const res = await initProject({ projectRoot: root, agents: target });

    expect(res.agents?.created.length).toBeGreaterThan(0);
    expect(await pathExists(join(root, present))).toBe(true);
    expect(await pathExists(join(root, ".sdd/protocol.md"))).toBe(true);
    expect(await pathExists(join(root, "AGENTS.md"))).toBe(true);
    expect(await pathExists(join(root, ".sdd/agents.json"))).toBe(true);
    expect(await pathExists(join(root, "memory/index.md"))).toBe(true);
    expect(await pathExists(join(root, "memory/constitution.md"))).toBe(true);
    const index = await readFile(join(root, "memory/index.md"), "utf8");
    expect(index).toMatch(/constitution/i);

    for (const p of absent) {
      expect(await pathExists(join(root, p))).toBe(false);
    }

    const snap = JSON.parse(await readFile(join(root, ".sdd/agents.json"), "utf8"));
    expect(snap.ai).toBe(aiKey);
    expect(snap.version).toBe(3);
  });

  it("init without agents does not create host agent files", async () => {
    const root = await freshRoot();
    await initProject({ projectRoot: root, agents: false });
    expect(await pathExists(join(root, ".github/agents/sdd.agent.md"))).toBe(false);
    expect(await pathExists(join(root, ".claude/agents/sdd.md"))).toBe(false);
    expect(await pathExists(join(root, ".grok/rules/sdd.md"))).toBe(false);
    expect(await pathExists(join(root, ".sdd/config.yaml"))).toBe(true);
  });

  it("registry covers public keys including ollama", () => {
    const keys = AGENT_INTEGRATIONS.map((i) => i.key).sort();
    expect(keys).toEqual(["claude", "copilot", "grok", "ollama"]);
  });
});
