import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import {
  advanceStage,
  createChange,
  initProject,
  loadConfig,
  refreshActiveAgentContext,
} from "../index.js";
import { createRole } from "../role/profile.js";

const temps: string[] = [];
const previousHome = process.env.SDD_HOME;

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

afterEach(async () => {
  if (previousHome === undefined) process.env.SDD_HOME = undefined;
  else process.env.SDD_HOME = previousHome;
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

describe("protocol refresh", () => {
  it("does not rewrite an existing protocol.md from sdd new or sdd next", async () => {
    process.env.SDD_HOME = await tempDir("sdd-protocol-home-");
    const root = await tempDir("sdd-protocol-");
    await initProject({ projectRoot: root, agents: false });
    await refreshActiveAgentContext(root);
    const protocolPath = join(root, ".sdd/protocol.md");
    const before = await readFile(protocolPath, "utf8");
    expect(before).not.toContain("## Product team");

    await createRole(root, {
      name: "qa",
      label: "QA",
      job: "Check the change",
      approvers: ["human"],
    });
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Leave the playbook",
      workflowName: "hotfix",
    });
    expect(await readFile(protocolPath, "utf8")).toBe(before);

    await writeFile(
      join(ctx.path, "intent.md"),
      "# Intent\n\nThe heading is wrong. Change that heading and leave the rest of the page alone.\n",
    );
    await advanceStage(root, config, ctx.id);
    expect(await readFile(protocolPath, "utf8")).toBe(before);

    await refreshActiveAgentContext(root, { rewriteGenerated: true });
    const rewritten = await readFile(protocolPath, "utf8");
    expect(rewritten).not.toBe(before);
    expect(rewritten).toContain("`qa` — Check the change");
  });
});
