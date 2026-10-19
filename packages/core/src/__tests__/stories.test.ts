import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { saveChangeMeta } from "../change-context.js";
import {
  type StoryNode,
  createChange,
  formatEpicGraph,
  initProject,
  loadConfig,
  loadEpicStories,
  parseStoryDraft,
  storyIdTaken,
} from "../index.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

function node(
  story: string,
  title: string,
  depends: string[] = [],
  status = "in_progress",
): StoryNode {
  return { changeId: story, title, story, epic: "issue-37", depends, status };
}

describe("epic stories", () => {
  it("rejects a story without an epic and a duplicate id", () => {
    expect(parseStoryDraft({ story: "S-001" })).toEqual({
      ok: false,
      stdout: "A story needs an epic.",
    });
    expect(parseStoryDraft({ epic: "issue-37", story: "nope" }).ok).toBe(false);
    expect(parseStoryDraft({ epic: "Bad Key", story: "S-001" }).ok).toBe(false);
  });

  it("prints waves and keeps a completed archived dependency", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-stories-"));
    temps.push(root);
    await initProject({ projectRoot: root, agents: false });
    const config = await loadConfig(root);
    const first = await createChange({
      projectRoot: root,
      config,
      title: "Role handoff",
      workflowName: "hotfix",
      epic: "issue-37",
      story: "S-001",
    });
    first.meta.status = "completed";
    await saveChangeMeta(root, config, first.meta);
    const archive = join(root, config.archive_path);
    await mkdir(archive, { recursive: true });
    await rename(join(root, config.changes_path, first.id), join(archive, first.id));

    await createChange({
      projectRoot: root,
      config,
      title: "Connectors",
      workflowName: "hotfix",
      epic: "issue-37",
      story: "S-002",
      depends: ["S-001"],
    });
    await createChange({
      projectRoot: root,
      config,
      title: "Docs",
      workflowName: "hotfix",
      epic: "issue-37",
      story: "S-003",
    });

    const nodes = await loadEpicStories(root, config, "issue-37");
    expect(formatEpicGraph(nodes)).toEqual({
      exitCode: 0,
      stdout: [
        "Wave 1",
        "S-001 Role handoff",
        "S-003 Docs",
        "Wave 2",
        "S-002 Connectors after S-001",
        "Parallel: S-001, S-003",
        "Serial: S-002 after S-001",
      ].join("\n"),
    });
    expect(await storyIdTaken(root, config, "issue-37", "S-001")).toBe(true);
  });

  it("reports a cycle and an unknown dependency", () => {
    const cycle = formatEpicGraph([
      node("S-001", "One", ["S-002"]),
      node("S-002", "Two", ["S-001"]),
    ]);
    expect(cycle).toEqual({ exitCode: 1, stdout: "Story cycle: S-001 -> S-002 -> S-001" });
    const missing = formatEpicGraph([node("S-002", "Two", ["S-009"])]);
    expect(missing).toEqual({
      exitCode: 1,
      stdout: "S-002 depends on S-009, which is not in this epic.",
    });
  });
});
