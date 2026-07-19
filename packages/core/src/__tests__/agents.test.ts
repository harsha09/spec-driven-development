import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import {
  initProject,
  installAgentIntegration,
  createChange,
  loadConfig,
  parseAgentTargets,
  parseIntegration,
  DEFAULT_INIT_INTEGRATION,
  AGENT_INTEGRATIONS,
  getIntegration,
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

describe("agent integrations (registry)", () => {
  it("installs protocol + thin agents for one host only", async () => {
    const root = await tempProject();
    await installAgentIntegration({
      projectRoot: root,
      target: "claude-code",
      force: true,
    });

    expect(await pathExists(join(root, ".sdd/protocol.md"))).toBe(true);
    const protocol = await readFile(join(root, ".sdd/protocol.md"), "utf8");
    expect(protocol).toContain("SDD protocol");
    expect(protocol.length).toBeGreaterThan(PROTOCOL_MD.length - 50);

    for (const role of SDD_AGENT_ROLES) {
      expect(await pathExists(join(root, `.claude/agents/${role.id}.md`))).toBe(true);
    }
    // Single-agent: no other hosts
    expect(await pathExists(join(root, ".github/agents/sdd.agent.md"))).toBe(false);
    expect(await pathExists(join(root, ".grok/rules/sdd.md"))).toBe(false);
    expect(await pathExists(join(root, ".claude/skills/sdd/SKILL.md"))).toBe(false);

    const impl = await readFile(join(root, ".claude/agents/sdd-implementer.md"), "utf8");
    expect(impl.length).toBeLessThan(1200);
    expect(impl).toMatch(/\.sdd\/protocol\.md/);

    // Same body generator for copilot vs claude when each installed alone
    await installAgentIntegration({ projectRoot: root, target: "copilot", force: true });
    expect(await pathExists(join(root, ".claude/agents/sdd.md"))).toBe(false);
    const copilot = await readFile(join(root, ".github/agents/sdd.agent.md"), "utf8");
    expect(copilot).toMatch(/protocol\.md/);

    expect(await pathExists(join(root, "AGENTS.md"))).toBe(true);
    expect(await pathExists(join(root, ".sdd/agents.json"))).toBe(true);
    expect(await pathExists(join(root, ".sdd/init-options.json"))).toBe(false);
    const snap = JSON.parse(await readFile(join(root, ".sdd/agents.json"), "utf8"));
    expect(snap.version).toBe(3);
    expect(snap.ai).toBe("copilot");
  });

  it("switching to grok removes other agent host dirs", async () => {
    const root = await tempProject();
    await installAgentIntegration({ projectRoot: root, target: "copilot", force: true });
    await installAgentIntegration({ projectRoot: root, target: "claude-code", force: true });
    // last install was claude — copilot already removed
    expect(await pathExists(join(root, ".claude/agents/sdd.md"))).toBe(true);

    await installAgentIntegration({ projectRoot: root, target: "grok", force: true });
    expect(await pathExists(join(root, ".grok/rules/sdd.md"))).toBe(true);
    expect(await pathExists(join(root, ".github/agents"))).toBe(false);
    expect(await pathExists(join(root, ".claude/agents"))).toBe(false);
    expect(await pathExists(join(root, ".idea/sdd-agent-notes.md"))).toBe(false);
  });

  it("registry drives role paths and public keys", () => {
    expect(AGENT_INTEGRATIONS.length).toBeGreaterThanOrEqual(3);
    const copilot = getIntegration("copilot");
    expect(copilot.rolePath("sdd")).toBe(".github/agents/sdd.agent.md");
    expect(copilot.key).toBe("copilot");
    const claude = getIntegration("claude-code");
    expect(claude.rolePath("sdd")).toBe(".claude/agents/sdd.md");
    expect(claude.key).toBe("claude");
    expect(claude.cliBinary).toBe("claude");
    const grok = getIntegration("grok");
    expect(grok.key).toBe("grok");
    expect(grok.rolePath("sdd")).toBe(".grok/rules/sdd.md");
    expect(grok.rolesToInstall).toEqual(["sdd"]);
  });

  it("installs Grok Build rules (single .grok/rules/sdd.md)", async () => {
    const root = await tempProject();
    const result = await installAgentIntegration({
      projectRoot: root,
      target: "grok",
      force: true,
    });
    expect(result.target).toBe("grok");
    expect(await pathExists(join(root, ".grok/rules/sdd.md"))).toBe(true);
    // Only router role — not separate planner/implementer (Grok loads all rules/*.md)
    expect(await pathExists(join(root, ".grok/rules/sdd-implementer.md"))).toBe(false);
    expect(await pathExists(join(root, ".github/agents/sdd.agent.md"))).toBe(false);
    expect(await pathExists(join(root, "AGENTS.md"))).toBe(true);
    const rule = await readFile(join(root, ".grok/rules/sdd.md"), "utf8");
    expect(rule).toMatch(/protocol\.md/);
    expect(rule).toMatch(/active-context\.md/);
    const agentsMd = await readFile(join(root, "AGENTS.md"), "utf8");
    expect(agentsMd).toMatch(/Grok Build/i);
    const snap = JSON.parse(await readFile(join(root, ".sdd/agents.json"), "utf8"));
    expect(snap.ai).toBe("grok");
  });

  it("rejects IDE names as agent targets", () => {
    expect(() => parseAgentTargets("intellij")).toThrow(/IDE/i);
    expect(() => parseIntegration("vscode")).toThrow(/IDE/i);
    expect(() => parseIntegration("cursor")).toThrow(/IDE/i);
  });

  it("accepts Speckit-style keys (claude → claude-code, grok, default copilot)", () => {
    expect(parseIntegration("claude")).toBe("claude-code");
    expect(parseIntegration("copilot")).toBe("copilot");
    expect(parseIntegration("grok")).toBe("grok");
    expect(parseIntegration("grok-build")).toBe("grok");
    expect(DEFAULT_INIT_INTEGRATION).toBe("copilot");
    expect(parseAgentTargets("claude")).toEqual(["claude-code"]);
  });

  it("init does not install agents unless AI agent is specified", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sdd-init-none-"));
    temps.push(dir);
    const res = await initProject({ projectRoot: dir });
    expect(res.agents).toBeUndefined();
    expect(await pathExists(join(dir, ".claude/agents/sdd.md"))).toBe(false);
    expect(await pathExists(join(dir, "memory/index.md"))).toBe(true);
    expect(await pathExists(join(dir, "memory/product.md"))).toBe(true);
  });

  it("init installs only the requested AI agent", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sdd-init-ag-"));
    temps.push(dir);
    const res = await initProject({
      projectRoot: dir,
      agents: "claude-code",
    });
    expect(res.agents?.created.length).toBeGreaterThan(0);
    expect(await pathExists(join(dir, ".sdd/protocol.md"))).toBe(true);
    expect(await pathExists(join(dir, ".claude/agents/sdd.md"))).toBe(true);
    expect(await pathExists(join(dir, ".github/agents/sdd.agent.md"))).toBe(false);
  });

  it("refreshActiveAgentContext writes active change and mentions protocol", async () => {
    const root = await tempProject();
    await installAgentIntegration({ projectRoot: root, target: "copilot", force: true });
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
      expect(body).not.toMatch(/Hard rules/);
      expect(body).toMatch(/protocol\.md/);
    }
  });
});
