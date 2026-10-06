/**
 * #5: a no-agent setup (init without an AI host) is a complete, valid sdd project.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import {
  AGENT_INTEGRATIONS,
  agentHostPaths,
  createChange,
  initProject,
  loadConfig,
  loadInstalledAgent,
  pathExists,
  refreshActiveAgentContext,
} from "../index.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const d = temps.pop();
    if (d) await rm(d, { recursive: true, force: true });
  }
});

async function freshRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "sdd-init-noagent-"));
  temps.push(dir);
  return dir;
}

describe("init with no AI host (#5)", () => {
  it("writes shared setup only: no host files, no AGENTS.md, no agents.json", async () => {
    const root = await freshRoot();
    await initProject({ projectRoot: root, agents: false });
    await refreshActiveAgentContext(root);

    expect(await pathExists(join(root, ".sdd/config.yaml"))).toBe(true);
    expect(await pathExists(join(root, ".sdd/protocol.md"))).toBe(true);
    expect(await pathExists(join(root, ".sdd/active-context.md"))).toBe(true);
    expect(await pathExists(join(root, "memory/index.md"))).toBe(true);
    expect(await pathExists(join(root, "AGENTS.md"))).toBe(false);
    expect(await pathExists(join(root, ".sdd/agents.json"))).toBe(false);
    for (const integ of AGENT_INTEGRATIONS) {
      for (const rel of agentHostPaths(integ.id)) {
        expect(await pathExists(join(root, rel)), rel).toBe(false);
      }
    }
    expect(await loadInstalledAgent(root)).toBeNull();
  });

  it("supports the change lifecycle without a host", async () => {
    const root = await freshRoot();
    await initProject({ projectRoot: root, agents: false });
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "No host change",
      workflowName: "hotfix",
    });
    await refreshActiveAgentContext(root);
    const active = await readFile(join(root, ".sdd/active-context.md"), "utf8");
    expect(active).toContain(ctx.id);
    expect(await pathExists(join(root, "AGENTS.md"))).toBe(false);
  });
});
