import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import {
  initProject,
  installAgentIntegrations,
  createChange,
  loadConfig,
  refreshActiveAgentContext,
  pathExists,
} from "../index.js";

const temps: string[] = [];

async function tempProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "sdd-agents-"));
  temps.push(dir);
  await initProject({ projectRoot: dir, agents: false });
  return dir;
}

afterEach(async () => {
  while (temps.length) {
    const d = temps.pop();
    if (d) await rm(d, { recursive: true, force: true });
  }
});

describe("agent integrations", () => {
  it("installs copilot + claude-code + intellij files", async () => {
    const root = await tempProject();
    const result = await installAgentIntegrations({
      projectRoot: root,
      targets: ["copilot", "claude-code", "intellij"],
    });
    expect(result.created.length).toBeGreaterThan(3);
    expect(await pathExists(join(root, ".github/copilot-instructions.md"))).toBe(true);
    expect(await pathExists(join(root, ".github/agents/sdd.agent.md"))).toBe(true);
    expect(await pathExists(join(root, ".claude/skills/sdd/SKILL.md"))).toBe(true);
    expect(await pathExists(join(root, "AGENTS.md"))).toBe(true);
    expect(await pathExists(join(root, ".idea/sdd-agent-notes.md"))).toBe(true);

    const skill = await readFile(join(root, ".claude/skills/sdd/SKILL.md"), "utf8");
    expect(skill).toMatch(/sdd status|active-context/);
    const copilot = await readFile(join(root, ".github/copilot-instructions.md"), "utf8");
    expect(copilot).toMatch(/Spec-Driven|active-context/);
  });

  it("init installs agents by default", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sdd-init-ag-"));
    temps.push(dir);
    const res = await initProject({ projectRoot: dir });
    expect(res.agents?.created.length).toBeGreaterThan(0);
    expect(await pathExists(join(dir, ".github/copilot-instructions.md"))).toBe(true);
    expect(await pathExists(join(dir, ".claude/skills/sdd/SKILL.md"))).toBe(true);
  });

  it("refreshActiveAgentContext writes active change", async () => {
    const root = await tempProject();
    await installAgentIntegrations({ projectRoot: root, targets: ["copilot"] });
    const config = await loadConfig(root);
    await createChange({
      projectRoot: root,
      config,
      title: "Agent context feature",
      workflowName: "hotfix",
    });
    const path = await refreshActiveAgentContext(root);
    expect(path).toBeTruthy();
    const body = await readFile(path!, "utf8");
    expect(body).toMatch(/Agent context feature/);
    expect(body).toMatch(/hotfix|intent|implement/);
  });
});
