import { spawn } from "node:child_process";
import { join } from "pathe";
import type { ChangeContext } from "./change-context.js";
import { listFiles, pathExists, readText } from "./fs.js";
import type { ChangeMeta } from "./schemas.js";

const CHECKBOX = /^\s*[-*+]\s+\[([ xX])\]\s+(.*?)\s*$/;

export interface CheckboxLine {
  checked: boolean;
  text: string;
}

export interface TaskProgress {
  tasksChecked: number;
  tasksUnchecked: number;
  uncheckedTasks: string[];
  checklistTicked: number;
  checklistUnticked: number;
  untickedChecklist: string[];
  git: "clean" | "dirty" | "not-a-repo";
}

export interface ProgressReport {
  blocking: string[];
  warnings: string[];
}

/** Checkbox lines in a markdown body. Blank labels are ignored. */
export function checkboxLines(markdown: string): CheckboxLine[] {
  const lines: CheckboxLine[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const match = CHECKBOX.exec(line);
    if (!match) continue;
    const text = (match[2] ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    lines.push({ checked: match[1] !== " ", text });
  }
  return lines;
}

function gitOutput(
  projectRoot: string,
  args: string[],
): Promise<{ code: number | null; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn("git", args, {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.on("error", () => resolve({ code: null, stdout: "" }));
    child.on("close", (code) => resolve({ code, stdout }));
  });
}

/** `not-a-repo` when git cannot see a work tree, so callers skip the clean-tree warning. */
export async function gitWorkTreeState(projectRoot: string): Promise<TaskProgress["git"]> {
  const inside = await gitOutput(projectRoot, ["rev-parse", "--is-inside-work-tree"]);
  if (inside.code !== 0 || inside.stdout.trim() !== "true") return "not-a-repo";
  const status = await gitOutput(projectRoot, ["status", "--porcelain"]);
  if (status.code !== 0) return "not-a-repo";
  return status.stdout.trim() ? "dirty" : "clean";
}

/**
 * Count unchecked tasks in tasks.md and unticked verify-checklist items.
 * A checklist item is ticked when some change file has `- [x]` with the same text.
 * Other unticked boxes in those files are listed too. tasks.md is not a checklist.
 */
export async function assessTaskProgress(
  ctx: ChangeContext,
  projectRoot: string,
): Promise<TaskProgress> {
  const tasksPath = join(ctx.path, "tasks.md");
  let tasksChecked = 0;
  let tasksUnchecked = 0;
  const uncheckedTasks: string[] = [];
  if (await pathExists(tasksPath)) {
    for (const box of checkboxLines(await readText(tasksPath))) {
      if (box.checked) tasksChecked += 1;
      else {
        tasksUnchecked += 1;
        uncheckedTasks.push(box.text);
      }
    }
  }

  const declared: string[] = [];
  const seenDeclared = new Set<string>();
  for (const stage of ctx.workflow.stages) {
    if (!stage.verify) continue;
    for (const item of stage.gate?.checklist ?? []) {
      const text = item.trim();
      if (!text || seenDeclared.has(text)) continue;
      seenDeclared.add(text);
      declared.push(text);
    }
  }

  const ticked = new Set<string>();
  const untickedInFiles: string[] = [];
  const seenUnticked = new Set<string>();
  for (const name of await listFiles(ctx.path)) {
    if (!name.endsWith(".md") || name === "tasks.md") continue;
    for (const box of checkboxLines(await readText(join(ctx.path, name)))) {
      if (box.checked) ticked.add(box.text);
      else if (!seenUnticked.has(box.text)) {
        seenUnticked.add(box.text);
        untickedInFiles.push(box.text);
      }
    }
  }

  const untickedChecklist: string[] = [];
  const listed = new Set<string>();
  for (const item of declared) {
    if (ticked.has(item) || listed.has(item)) continue;
    listed.add(item);
    untickedChecklist.push(item);
  }
  for (const item of untickedInFiles) {
    if (ticked.has(item) || listed.has(item)) continue;
    listed.add(item);
    untickedChecklist.push(item);
  }

  return {
    tasksChecked,
    tasksUnchecked,
    uncheckedTasks,
    checklistTicked: declared.filter((item) => ticked.has(item)).length,
    checklistUnticked: untickedChecklist.length,
    untickedChecklist,
    git: await gitWorkTreeState(projectRoot),
  };
}

export function taskProgressRecord(
  progress: TaskProgress,
  recordedAt: string,
): NonNullable<ChangeMeta["task_progress"]> {
  return {
    tasks_checked: progress.tasksChecked,
    tasks_unchecked: progress.tasksUnchecked,
    checklist_ticked: progress.checklistTicked,
    checklist_unticked: progress.checklistUnticked,
    recorded_at: recordedAt,
  };
}

export function formatTaskProgressLines(
  progress: NonNullable<ChangeMeta["task_progress"]>,
): string[] {
  return [
    `Tasks: ${progress.tasks_checked} checked, ${progress.tasks_unchecked} unchecked`,
    `Verify checklist: ${progress.checklist_ticked} ticked, ${progress.checklist_unticked} unticked`,
  ];
}

function taskBlock(progress: TaskProgress): string {
  const total = progress.tasksChecked + progress.tasksUnchecked;
  const lines = [
    `${progress.tasksUnchecked} of ${total} tasks are unchecked in tasks.md.`,
    ...progress.uncheckedTasks.slice(0, 20).map((item) => `  - ${item}`),
  ];
  if (progress.uncheckedTasks.length > 20) lines.push("  - …");
  lines.push("Tick the tasks, or re-run with --allow-unchecked.");
  return lines.join("\n");
}

function checklistBlock(progress: TaskProgress): string {
  const lines = [
    `${progress.checklistUnticked} verify checklist item${progress.checklistUnticked === 1 ? " is" : "s are"} still unticked.`,
    ...progress.untickedChecklist.slice(0, 20).map((item) => `  - ${item}`),
  ];
  if (progress.untickedChecklist.length > 20) lines.push("  - …");
  lines.push("Tick them in the verify results, or re-run with --allow-unchecked.");
  return lines.join("\n");
}

/**
 * `sdd next` out of tasks or implement blocks on unchecked tasks.
 * `sdd complete` blocks on unchecked tasks and an unticked verify checklist.
 * A clean worktree while leaving implement is a warning, including outside strict mode.
 */
export function describeProgress(input: {
  action: "next" | "complete";
  stageId: string;
  progress: TaskProgress;
}): ProgressReport {
  const blocking: string[] = [];
  const warnings: string[] = [];
  const leavingWork =
    input.action === "next" && (input.stageId === "tasks" || input.stageId === "implement");
  const checkTasks = leavingWork || input.action === "complete";
  if (checkTasks && input.progress.tasksUnchecked > 0) blocking.push(taskBlock(input.progress));
  if (input.action === "complete" && input.progress.checklistUnticked > 0) {
    blocking.push(checklistBlock(input.progress));
  }
  if (input.action === "next" && input.stageId === "implement" && input.progress.git === "clean") {
    warnings.push("No file changes in git status. The worktree is clean while leaving implement.");
  }
  return { blocking, warnings };
}
