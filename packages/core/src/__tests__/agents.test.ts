import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import {
  initProject,
  installAgentIntegrations,
  createChange,
  loadConfig,
  parseAgentTargets,
  parseIntegration,
  DEFAULT_INIT_INTEGRATION,
  refreshActiveAgentContext,
  pathExists,
  renderThinAgent,
  SDD_AGENT_ROLES,
  PROTOCOL_MD,
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

describe("agent integrations (agents-only)", () => {
  it("installs protocol + thin agents for copilot and claude — no skills", async () => {
    const root = await tempProject();
    const result = await installAgentIntegrations({
      projectRoot: root,
      targets: ["copilot", "claude-code"],
      force: true,
    });
    expect(result.created.length).toBeGreaterThan(5);

    // Single playbook
    expect(await pathExists(join(root, ".sdd/protocol.md"))).toBe(true);
    const protocol = await readFile(join(root, ".sdd/protocol.md"), "utf8");
    expect(protocol).toContain("SDD protocol");
    expect(protocol.length).toBeGreaterThan(PROTOCOL_MD.length - 50);

    // Claude agents (not skills)
    for (const role of SDD_AGENT_ROLES) {
      expect(await pathExists(join(root, `.claude/agents/${role.id}.md`))).toBe(true);
      expect(await pathExists(join(root, `.github/agents/${role.id}.agent.md`))).toBe(true);
    }
    expect(await pathExists(join(root, ".claude/skills/sdd/SKILL.md"))).toBe(false);
    expect(await pathExists(join(root, ".github/copilot-instructions.md"))).toBe(false);
    expect(await pathExists(join(root, ".github/skills"))).toBe(false);

    // Thin: agent body is short and points at protocol
    const impl = await readFile(join(root, ".claude/agents/sdd-implementer.md"), "utf8");
    expect(impl.length).toBeLessThan(1200);
    expect(impl).toMatch(/\.sdd\/protocol\.md/);
    expect(impl).toMatch(/\.sdd\/active-context\.md/);
    expect(impl).toMatch(/Role: \*\*implementer\*\*|Implementer:/i);

    // Same body generator for both hosts
    const claude = await readFile(join(root, ".claude/agents/sdd.md"), "utf8");
    const copilot = await readFile(join(root, ".github/agents/sdd.agent.md"), "utf8");
    expect(claude).toBe(copilot);

    expect(await pathExists(join(root, "AGENTS.md"))).toBe(true);
    expect(await pathExists(join(root, ".idea/sdd-agent-notes.md"))).toBe(false);
  });

  it("rejects IDE names as agent targets", () => {
    expect(() => parseAgentTargets("intellij")).toThrow(/IDE/i);
    expect(() => parseAgentTargets("vscode")).toThrow(/IDE/i);
    expect(() => parseAgentTargets("cursor")).toThrow(/IDE/i);
  });

  it("accepts Speckit-style keys (claude → claude-code, default copilot)", () => {
    expect(parseIntegration("claude")).toBe("claude-code");
    expect(parseIntegration("copilot")).toBe("copilot");
    expect(DEFAULT_INIT_INTEGRATION).toBe("copilot");
    expect(parseAgentTargets("claude")).toEqual(["claude-code"]);
  });

  it("init does not install agents unless AI agents are specified", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sdd-init-none-"));
    temps.push(dir);
    const res = await initProject({ projectRoot: dir });
    expect(res.agents).toBeUndefined();
    expect(await pathExists(join(dir, ".claude/agents/sdd.md"))).toBe(false);
    expect(await pathExists(join(dir, ".github/agents/sdd.agent.md"))).toBe(false);
  });

  it("init installs only the requested AI agent (no skills)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sdd-init-ag-"));
    temps.push(dir);
    const res = await initProject({
      projectRoot: dir,
      agents: ["claude-code"],
    });
    expect(res.agents?.created.length).toBeGreaterThan(0);
    expect(await pathExists(join(dir, ".sdd/protocol.md"))).toBe(true);
    expect(await pathExists(join(dir, ".claude/agents/sdd.md"))).toBe(true);
    expect(await pathExists(join(dir, ".github/agents/sdd.agent.md"))).toBe(false);
    expect(await pathExists(join(dir, ".claude/skills/sdd/SKILL.md"))).toBe(false);
  });

  it("refreshActiveAgentContext writes active change and mentions protocol", async () => {
    const root = await tempProject();
    await installAgentIntegrations({ projectRoot: root, targets: ["copilot"], force: true });
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
    expect(body).toMatch(/protocol\.md/);
  });

  it("renderThinAgent stays concise", () => {
    for (const role of SDD_AGENT_ROLES) {
      const body = renderThinAgent(role);
      expect(body.length).toBeLessThan(1200);
      expect(body).not.toMatch(/Hard rules/); // full rules live in protocol only
      expect(body).toMatch(/protocol\.md/);
    }
  });
});
