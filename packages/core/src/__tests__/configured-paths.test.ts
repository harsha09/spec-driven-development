/**
 * Issue #7: generated guidance must name configured memory_path and changes_path.
 */
import { mkdir, mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import { getIntegration } from "../agents.js";
import {
  SDD_AGENT_ROLES,
  buildRefinePlan,
  createChange,
  initProject,
  loadConfig,
  pathExists,
  refreshActiveAgentContext,
  renderAgentsMd,
  renderProtocolMd,
  renderThinAgent,
  saveConfig,
  writeAgentHandoff,
} from "../index.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const d = temps.pop();
    if (d) await rm(d, { recursive: true, force: true });
  }
});

describe("configured memory and changes paths (#7)", () => {
  it("protocol, host guidance, README, memory index, handoff, and refine use config paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-paths-"));
    temps.push(root);
    await initProject({ projectRoot: root, agents: "copilot" });
    const config = await loadConfig(root);
    config.memory_path = ".sdd/memory";
    config.changes_path = ".sdd/changes";
    await saveConfig(root, config);

    await mkdir(join(root, ".sdd"), { recursive: true });
    if (await pathExists(join(root, "memory"))) {
      await rename(join(root, "memory"), join(root, ".sdd/memory"));
    }
    if (await pathExists(join(root, "changes"))) {
      await rename(join(root, "changes"), join(root, ".sdd/changes"));
    }

    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Path guidance",
      workflowName: "patch",
    });
    await refreshActiveAgentContext(root);
    const handoff = await writeAgentHandoff(root, config, ctx.id);
    const plan = await buildRefinePlan({ projectRoot: root, config, changeId: ctx.id });

    const protocol = await readFile(join(root, ".sdd/protocol.md"), "utf8");
    const agents = await readFile(join(root, "AGENTS.md"), "utf8");
    const readme = await readFile(join(root, ".sdd/README.md"), "utf8");
    const index = await readFile(join(root, ".sdd/memory/index.md"), "utf8");
    const role = await readFile(join(root, ".github/agents/sdd.agent.md"), "utf8");
    const handoffBody = await readFile(handoff, "utf8");

    for (const body of [protocol, agents, readme, index, role, handoffBody, plan.briefMarkdown]) {
      expect(body).toContain(".sdd/memory");
      expect(body).toContain(".sdd/changes");
      expect(body).not.toMatch(/(?<![\w./-])memory\/constitution\.md/);
      expect(body).not.toMatch(/(?<![\w./-])changes\/<id>/);
    }
    expect(protocol).toContain(".sdd/memory/constitution.md");
    expect(protocol).toContain(".sdd/changes/<id>/meta.yaml");
    expect(role).toContain(".sdd/changes/<id>/refine-brief.md");
    expect(plan.briefMarkdown).toContain(".sdd/changes/<id>/refine-brief.md");
    expect(handoffBody).toContain(".sdd/memory/constitution.md");
    expect(renderProtocolMd(config)).toContain(".sdd/changes/<id>/");
    expect(renderAgentsMd(getIntegration("copilot"), config)).toContain(".sdd/memory/index.md");
    expect(renderThinAgent(SDD_AGENT_ROLES[0]!, config)).toContain(".sdd/changes/<id>/");
  });
});
