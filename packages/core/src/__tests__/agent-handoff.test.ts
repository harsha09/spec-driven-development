import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import {
  createChange,
  formatStatus,
  initProject,
  loadConfig,
  refreshActiveAgentContext,
  writeAgentHandoff,
} from "../index.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const root = temps.pop();
    if (root) await rm(root, { recursive: true, force: true });
  }
});

describe("handoff paths are repo-relative", () => {
  it("status, active-context, and handoff omit the machine path", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-handoff-"));
    temps.push(root);
    await initProject({ projectRoot: root, agents: false });
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Relative handoff",
      workflowName: "hotfix",
    });
    const relative = `${config.changes_path}/${ctx.id}`;

    const status = formatStatus(ctx);
    expect(status).toContain(`Path: ${relative}`);
    expect(status).not.toContain(root);

    await refreshActiveAgentContext(root);
    await writeAgentHandoff(root, config, ctx.id);
    const active = await readFile(join(root, ".sdd/active-context.md"), "utf8");
    const handoff = await readFile(join(root, ".sdd/handoff.md"), "utf8");
    expect(active).toContain(relative);
    expect(handoff).toContain(`Change path: ${relative}`);
    expect(active).not.toContain(root);
    expect(handoff).not.toContain(root);
  });
});
