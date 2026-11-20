import { join } from "pathe";
import type { ChangeContext } from "./change-context.js";
import { readText } from "./fs.js";
import type { ChangeMeta } from "./schemas.js";
import { nowIso } from "./slug.js";
import { validBranchName } from "./stories.js";

const GIT_SHA = /^[0-9a-f]{40}$/i;
const GIT_SHA_EXTENDED = /^[0-9a-f]{64}$/i;

/** Reject refs that could be interpreted as git flags or remote commands. */
export function assertSafeGitRef(ref: string): void {
  if (!ref || ref.startsWith("-") || /[\0\r\n]/.test(ref)) {
    throw new Error(`Unsafe git ref: ${ref}`);
  }
  if (GIT_SHA.test(ref) || GIT_SHA_EXTENDED.test(ref)) return;
  if (!validBranchName(ref)) {
    throw new Error(`Unsafe git ref: ${ref}`);
  }
}

export function assertSafeGitRevRange(range: string): void {
  if (!range || range.startsWith("-")) {
    throw new Error(`Unsafe git rev range: ${range}`);
  }
  const parts = range.split("..");
  if (parts.length !== 2) {
    throw new Error(`Unsafe git rev range: ${range}`);
  }
  assertSafeGitRef(parts[0]!);
  assertSafeGitRef(parts[1]!);
}

export function assertSafeGitRemote(name: string): void {
  if (!name || name.startsWith("-") || /[\0\r\n/]/.test(name)) {
    throw new Error(`Unsafe git remote: ${name}`);
  }
  if (!/^[A-Za-z0-9._-]+$/.test(name)) {
    throw new Error(`Unsafe git remote: ${name}`);
  }
}

export type GitRunner = (
  cwd: string,
  args: string[],
) => Promise<{ exitCode: number; stdout: string; stderr: string; missing: boolean }>;

export interface BackportParityResult {
  ok: boolean;
  unlisted: string[];
  allowedDifferent: string[];
  onlyMain: string[];
  onlyTwin: string[];
}

export interface BackportPlanningTask {
  line: number;
  text: string;
  target: string;
}

export function resolveBackportTargets(meta: ChangeMeta): string[] {
  if (meta.backport_targets?.length) return [...meta.backport_targets];
  const raw = meta.flags?.backport;
  if (Array.isArray(raw)) {
    return raw.map((value) => String(value).trim()).filter(Boolean);
  }
  if (typeof raw === "string" && raw.trim()) {
    return raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [];
}

export function twinBranchName(mainBranch: string, target: string): string {
  const suffix = target.replace(/\//g, "-");
  return `${mainBranch}-twin-${suffix}`;
}

export function findTwin(meta: ChangeMeta, target: string) {
  return meta.backports?.find((record) => record.target === target);
}

export function allowedDifferencePaths(meta: ChangeMeta): Set<string> {
  return new Set((meta.backport_allowed_differences ?? []).map((entry) => entry.path));
}

function pathsFromDiffGitLine(line: string): { aPath: string; bPath: string } | null {
  const marker = "diff --git ";
  if (!line.startsWith(marker)) return null;
  const body = line.slice(marker.length);
  const splitAt = body.indexOf(" b/");
  if (splitAt < 0) return null;
  const aPart = body.slice(0, splitAt);
  const bPart = body.slice(splitAt + 1);
  if (!aPart.startsWith("a/") || !bPart.startsWith("b/")) return null;
  return { aPath: aPart.slice(2), bPath: bPart.slice(2) };
}

/** Split a unified diff into per-file patch bodies keyed by path (b-side). */
export function splitUnifiedDiff(diff: string): Map<string, string> {
  const map = new Map<string, string>();
  const lines = diff.split(/\r?\n/);
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;
    if (!line.startsWith("diff --git ")) {
      index += 1;
      continue;
    }
    const start = index;
    index += 1;
    while (index < lines.length && !lines[index]!.startsWith("diff --git ")) {
      index += 1;
    }
    const paths = pathsFromDiffGitLine(line);
    if (!paths) continue;
    const path = paths.bPath === "dev/null" ? paths.aPath : paths.bPath;
    map.set(path, lines.slice(start, index).join("\n"));
  }
  return map;
}

export function compareTwinPatches(
  mainDiff: string,
  twinDiff: string,
  allowed: Set<string>,
): BackportParityResult {
  const main = splitUnifiedDiff(mainDiff);
  const twin = splitUnifiedDiff(twinDiff);
  const paths = new Set([...main.keys(), ...twin.keys()]);
  const unlisted: string[] = [];
  const allowedDifferent: string[] = [];
  const onlyMain: string[] = [];
  const onlyTwin: string[] = [];

  for (const path of paths) {
    const inMain = main.has(path);
    const inTwin = twin.has(path);
    if (inMain && !inTwin) {
      onlyMain.push(path);
    } else if (!inMain && inTwin) {
      onlyTwin.push(path);
    } else if (inMain && inTwin && main.get(path) !== twin.get(path)) {
      if (allowed.has(path)) allowedDifferent.push(path);
      else unlisted.push(path);
    }
  }

  for (const path of [...onlyMain, ...onlyTwin]) {
    if (allowed.has(path)) allowedDifferent.push(path);
    else unlisted.push(path);
  }

  return {
    ok: unlisted.length === 0,
    unlisted: [...new Set(unlisted)].sort(),
    allowedDifferent: [...new Set(allowedDifferent)].sort(),
    onlyMain: onlyMain.sort(),
    onlyTwin: onlyTwin.sort(),
  };
}

const NEEDS_BACKPORT = /needs-backport:\s*(\S+)/i;
const MAIN_ONLY = /\bmain-only\b/i;

export async function parseTasksBackportHints(
  changePath: string,
): Promise<{ needsBackport: BackportPlanningTask[]; mainOnly: number[] }> {
  const tasksPath = join(changePath, "tasks.md");
  let body: string;
  try {
    body = await readText(tasksPath);
  } catch {
    return { needsBackport: [], mainOnly: [] };
  }
  const needsBackport: BackportPlanningTask[] = [];
  const mainOnly: number[] = [];
  const lines = body.split(/\r?\n/);
  lines.forEach((text, index) => {
    if (MAIN_ONLY.test(text)) mainOnly.push(index + 1);
    const match = NEEDS_BACKPORT.exec(text);
    if (match?.[1]) {
      needsBackport.push({ line: index + 1, text: text.trim(), target: match[1]! });
    }
  });
  return { needsBackport, mainOnly };
}

export function tasksMissingTwinPr(
  meta: ChangeMeta,
  tasks: BackportPlanningTask[],
): BackportPlanningTask[] {
  return tasks.filter((task) => {
    const twin = findTwin(meta, task.target);
    return !twin?.pr?.url;
  });
}

export function backportCompletionErrors(meta: ChangeMeta): string[] {
  const targets = resolveBackportTargets(meta);
  if (!targets.length) return [];
  const errors: string[] = [];
  for (const target of targets) {
    const twin = findTwin(meta, target);
    if (!twin) {
      errors.push(`Backport twin for ${target} was never opened. Run: sdd backport open`);
      continue;
    }
    if (twin.waived?.reason) continue;
    if (!twin.merged) {
      errors.push(
        `Backport twin for ${target} is not merged (branch ${twin.branch}). Merge it or: sdd backport waive ${target} -r "…"`,
      );
    }
  }
  return errors;
}

export function formatBackportStatusLines(meta: ChangeMeta): string[] {
  const targets = resolveBackportTargets(meta);
  if (!targets.length && !(meta.backports?.length ?? 0)) return [];
  const lines: string[] = ["", "Backport twins:"];
  if (meta.pr?.url) {
    lines.push(`  main PR: ${meta.pr.url}${meta.branch ? ` (${meta.branch})` : ""}`);
  } else if (meta.branch) {
    lines.push(`  main branch: ${meta.branch}`);
  }
  for (const target of targets) {
    const twin = findTwin(meta, target);
    if (!twin) {
      lines.push(`  [ ] ${target} — twin not opened`);
      continue;
    }
    const gateBits: string[] = [];
    if (twin.head_sha) gateBits.push(`head ${twin.head_sha.slice(0, 7)}`);
    if (twin.parity_ok === true) gateBits.push("parity ok");
    else if (twin.parity_ok === false) gateBits.push("parity drift");
    if (twin.waived?.reason) {
      lines.push(`  [~] ${target} — waived: ${twin.waived.reason}`);
    } else if (twin.merged) {
      lines.push(`  [✓] ${target} — merged (${twin.branch}) ${gateBits.join(", ")}`);
    } else {
      const pr = twin.pr?.url ? ` PR ${twin.pr.url}` : "";
      lines.push(`  [ ] ${target} — open (${twin.branch})${pr} ${gateBits.join(", ")}`.trim());
    }
  }
  return lines;
}

export async function formatBackportPlanningLines(ctx: ChangeContext): Promise<string[]> {
  const { needsBackport } = await parseTasksBackportHints(ctx.path);
  const missing = tasksMissingTwinPr(ctx.meta, needsBackport);
  if (!missing.length) return [];
  const lines = ["", "Tasks needing a twin PR:"];
  for (const task of missing) {
    lines.push(`  line ${task.line}: ${task.target} — ${task.text}`);
  }
  return lines;
}

export function waiveTwin(meta: ChangeMeta, target: string, reason: string): ChangeMeta {
  const twin = findTwin(meta, target);
  if (!twin) {
    throw new Error(`No backport twin recorded for ${target}. Run sdd backport open first.`);
  }
  twin.waived = { reason: reason.trim(), at: nowIso() };
  return meta;
}
