import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import {
  assessTaskProgress,
  buildContext,
  checkboxLines,
  createChange,
  describeProgress,
  formatStatus,
  initProject,
  loadConfig,
  saveChangeMeta,
  taskProgressRecord,
} from "../index.js";
import { nowIso } from "../slug.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

describe("task progress", () => {
  it("counts checkbox lines and ignores blanks", () => {
    const lines = checkboxLines(
      "- [ ] One\r\n- [x] Two\n- [X] Three\n- [ ]\n* [ ] Four\n  + [x]  Five   six  \n",
    );
    expect(lines).toEqual([
      { checked: false, text: "One" },
      { checked: true, text: "Two" },
      { checked: true, text: "Three" },
      { checked: false, text: "Four" },
      { checked: true, text: "Five six" },
    ]);
    expect(checkboxLines(`* [ ] ${" ".repeat(20_000)}`)).toEqual([]);
  });

  it("blocks leaving tasks or implement while boxes are open, then clears when they are ticked", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-task-progress-"));
    temps.push(root);
    await initProject({ projectRoot: root, agents: false });
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Count tasks",
      workflowName: "feature",
    });
    await writeFile(
      join(ctx.path, "tasks.md"),
      "- [ ] Write the note field\n- [ ] Save the note\n- [x] Show the note\n",
    );
    await writeFile(
      join(ctx.path, "local-test-results.md"),
      "- [ ] Happy path verified locally\n- [x] Key edge cases covered or waived with notes\n",
    );
    const open = await assessTaskProgress(await buildContext(root, config, ctx.id), root);
    expect(open.tasksUnchecked).toBe(2);
    expect(open.tasksChecked).toBe(1);
    expect(open.checklistUnticked).toBe(1);
    expect(open.checklistTicked).toBe(1);
    expect(open.git).toBe("not-a-repo");

    const leavingTasks = describeProgress({ action: "next", stageId: "tasks", progress: open });
    expect(leavingTasks.blocking.join("\n")).toContain("2 of 3 tasks are unchecked");
    expect(leavingTasks.blocking.join("\n")).toContain("Write the note field");
    expect(leavingTasks.warnings).toEqual([]);

    const leavingDesign = describeProgress({ action: "next", stageId: "design", progress: open });
    expect(leavingDesign.blocking).toEqual([]);

    const finishing = describeProgress({
      action: "complete",
      stageId: "local_verify",
      progress: open,
    });
    expect(finishing.blocking.join("\n")).toContain("2 of 3 tasks are unchecked");
    expect(finishing.blocking.join("\n")).toContain("1 verify checklist item is still unticked");
    expect(finishing.blocking.join("\n")).toContain("Happy path verified locally");

    await writeFile(
      join(ctx.path, "tasks.md"),
      "- [x] Write the note field\n- [x] Save the note\n- [x] Show the note\n",
    );
    await writeFile(
      join(ctx.path, "local-test-results.md"),
      "- [x] Happy path verified locally\n- [x] Key edge cases covered or waived with notes\n",
    );
    const done = await assessTaskProgress(await buildContext(root, config, ctx.id), root);
    expect(
      describeProgress({ action: "next", stageId: "implement", progress: done }).blocking,
    ).toEqual([]);
    expect(
      describeProgress({ action: "complete", stageId: "local_verify", progress: done }).blocking,
    ).toEqual([]);

    const current = await buildContext(root, config, ctx.id);
    current.meta.task_progress = taskProgressRecord(done, nowIso());
    await saveChangeMeta(root, config, current.meta);
    const status = formatStatus(await buildContext(root, config, ctx.id));
    expect(status).toContain("Tasks: 3 checked, 0 unchecked");
    expect(status).toContain("Verify checklist: 2 ticked, 0 unticked");
  });

  it("warns when git status is clean while leaving implement", () => {
    const progress = {
      tasksChecked: 1,
      tasksUnchecked: 0,
      uncheckedTasks: [],
      checklistTicked: 0,
      checklistUnticked: 0,
      untickedChecklist: [],
      git: "clean" as const,
    };
    const report = describeProgress({ action: "next", stageId: "implement", progress });
    expect(report.blocking).toEqual([]);
    expect(report.warnings.join("\n")).toContain("worktree is clean");
    expect(describeProgress({ action: "next", stageId: "tasks", progress }).warnings).toEqual([]);
  });
});
