import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import {
  activePointerPath,
  changesPathRel,
  createChange,
  displayArchivePath,
  getActiveChangeId,
  initProject,
  loadConfig,
  memoryPathRel,
  resolveChangeId,
} from "../index.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const root = temps.pop();
    if (root) await rm(root, { recursive: true, force: true });
  }
});

describe("active change pointer", () => {
  it("does not adopt an in-progress pack when .active is blank", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-active-"));
    temps.push(root);
    await initProject({ projectRoot: root, agents: false });
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Fixture still in progress",
      workflowName: "hotfix",
    });

    await writeFile(activePointerPath(root, config), " \n");
    await expect(getActiveChangeId(root, config)).resolves.toBeNull();
    await expect(resolveChangeId(root, config, ctx.id)).resolves.toBe(ctx.id);

    await rm(activePointerPath(root, config));
    await expect(getActiveChangeId(root, config)).resolves.toBeNull();
  });
});

describe("repo-relative path display", () => {
  it("strips trailing slashes without a polynomial regex", () => {
    expect(memoryPathRel({ memory_path: "memory///" })).toBe("memory");
    expect(changesPathRel({ changes_path: "changes/" })).toBe("changes");
    expect(changesPathRel({ changes_path: "" })).toBe("changes");
    expect(displayArchivePath({ archive_path: "archive/" }, "id")).toBe("archive/id");
    expect(displayArchivePath({ archive_path: "" }, "id")).toBe("archive/id");
  });
});
