import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import { writeText } from "../fs.js";
import {
  advanceStage,
  buildContext,
  completeChange,
  createChange,
  formatChangeList,
  getActiveChangeId,
  initProject,
  listChangeRecords,
  loadConfig,
  resolveStatusChange,
} from "../index.js";
import { activePointerPath } from "../paths.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

describe("change list and status fallback", () => {
  it("lists ids, titles, and status, and status falls back to the last completed change", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-change-list-"));
    temps.push(root);
    await initProject({ projectRoot: root, agents: false });
    const config = await loadConfig(root);
    const first = await createChange({
      projectRoot: root,
      config,
      title: "First note",
      workflowName: "hotfix",
    });
    await writeFile(
      join(first.path, "intent.md"),
      "# Intent\n\nFix the heading and leave the rest of the page alone.\n",
    );
    await advanceStage(root, config, first.id);
    await advanceStage(root, config, first.id);
    await writeFile(
      join(first.path, "local-test-results.md"),
      "# Results\n\nThe heading reads correctly after reload.\n",
    );
    await completeChange(root, config, first.id);

    const second = await createChange({
      projectRoot: root,
      config,
      title: "Second note",
      workflowName: "hotfix",
    });
    await writeText(activePointerPath(root, config), "\n");
    expect(await getActiveChangeId(root, config)).toBeNull();

    const resolved = await resolveStatusChange(root, config);
    expect(resolved.id).toBe(first.id);
    expect(resolved.note).toContain(`Showing last completed change ${first.id}`);
    expect(resolved.note).toContain("sdd list");
    expect((await buildContext(root, config, resolved.id)).meta.status).toBe("completed");

    const rows = await listChangeRecords(root, config);
    expect(formatChangeList(rows)).toContain(`${first.id}  completed  First note`);
    expect(formatChangeList(rows)).toContain(`${second.id}  in_progress  Second note`);
    const openOnly = await listChangeRecords(root, config, "in_progress");
    expect(openOnly.map((row) => row.id)).toEqual([second.id]);
    await expect(listChangeRecords(root, config, "nope")).rejects.toThrow(
      /--status must be one of/,
    );
  });

  it("does not adopt an in-progress change when nothing is completed", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-change-list-open-"));
    temps.push(root);
    await initProject({ projectRoot: root, agents: false });
    const config = await loadConfig(root);
    await createChange({
      projectRoot: root,
      config,
      title: "Still open",
      workflowName: "hotfix",
    });
    await writeText(activePointerPath(root, config), "\n");
    await expect(resolveStatusChange(root, config)).rejects.toThrow(
      "No active change. Pass --change <id> or run `sdd new`. Run `sdd list` to see changes.",
    );
  });

  it("prints an empty list sentence", () => {
    expect(formatChangeList([])).toBe("No changes. Run `sdd new` to start one.\n");
  });
});
