import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type BackportParityResult,
  type ChangeMeta,
  allowedDifferencePaths,
  assertSafeGitRemote,
  compareTwinPatches,
  findTwin,
  nowIso,
  resolveBackportTargets,
  safeGitRef,
  safeGitRevRange,
  twinBranchName,
} from "@structured-vibe-coding/core";

type GitExit = { exitCode: number; stdout: string; stderr: string; missing: boolean };

const GIT_VERBS = new Set([
  "merge-base",
  "rev-parse",
  "diff",
  "branch",
  "show-ref",
  "switch",
  "cherry-pick",
  "rev-list",
  "push",
  "HEAD",
  "origin",
]);

const SHA40 = /^[0-9a-f]{40}$/i;
const SHA64 = /^[0-9a-f]{64}$/i;
const REF_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,200}$/;

function allowGitSpawnArg(arg: string): boolean {
  if (arg.startsWith("-")) {
    return (
      arg === "--end-of-options" ||
      arg === "--" ||
      /^--[a-z-]+$/.test(arg) ||
      /^-[a-zA-Z]$/.test(arg)
    );
  }
  if (GIT_VERBS.has(arg)) return true;
  if (SHA40.test(arg) || SHA64.test(arg)) return true;
  if (arg.startsWith("refs/heads/")) {
    return REF_TOKEN.test(arg.slice("refs/heads/".length));
  }
  if (arg.includes("..")) {
    const [left, right] = arg.split("..");
    if (!left || !right || left.length > 64 || right.length > 64) return false;
    return (
      (SHA40.test(left) || REF_TOKEN.test(left)) && (SHA40.test(right) || REF_TOKEN.test(right))
    );
  }
  return REF_TOKEN.test(arg);
}

function assertArgvSafeForGit(argv: readonly string[]): void {
  for (const arg of argv) {
    if (!allowGitSpawnArg(arg)) {
      throw new Error("Unsafe git argument rejected.");
    }
  }
}

function runGit(cwd: string, argv: readonly string[]): Promise<GitExit> {
  assertArgvSafeForGit(argv);
  return new Promise((resolve) => {
    const child = spawn("git", [...argv], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (err: NodeJS.ErrnoException) => {
      resolve({ exitCode: 127, stdout, stderr: err.message, missing: err.code === "ENOENT" });
    });
    child.on("close", (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr, missing: false });
    });
  });
}

async function mergeBase(cwd: string, left: string, right: string): Promise<string | null> {
  const result = await runGit(cwd, [
    "merge-base",
    "--end-of-options",
    safeGitRef(left),
    safeGitRef(right),
  ]);
  if (result.exitCode !== 0) return null;
  const sha = result.stdout.trim();
  return sha.length ? sha : null;
}

async function diffRange(cwd: string, base: string, head: string): Promise<string> {
  const range = safeGitRevRange(`${safeGitRef(base)}..${safeGitRef(head)}`);
  const result = await runGit(cwd, ["diff", "--end-of-options", range]);
  if (result.exitCode !== 0) return "";
  return result.stdout;
}

async function branchMergedInto(cwd: string, branch: string, target: string): Promise<boolean> {
  const result = await runGit(cwd, ["branch", "--merged", "--end-of-options", safeGitRef(target)]);
  if (result.exitCode !== 0) return false;
  const names = result.stdout
    .split(/\r?\n/)
    .map((line) => line.replace(/^\*?\s*/, "").trim())
    .filter(Boolean);
  return names.includes(branch);
}

export async function refreshTwinGitState(
  projectRoot: string,
  meta: ChangeMeta,
): Promise<ChangeMeta> {
  if (!meta.branch) return meta;
  for (const record of meta.backports ?? []) {
    const head = await runGit(projectRoot, [
      "rev-parse",
      "--verify",
      "--end-of-options",
      safeGitRef(record.branch),
    ]);
    if (head.exitCode === 0) {
      record.head_sha = head.stdout.trim();
    }
    record.merged = await branchMergedInto(projectRoot, record.branch, record.target);
  }
  return meta;
}

export async function checkTwinParity(
  projectRoot: string,
  meta: ChangeMeta,
  target: string,
): Promise<{ result: BackportParityResult; mainDiff: string; twinDiff: string }> {
  const twin = findTwin(meta, target);
  if (!meta.branch || !twin) {
    throw new Error("Main branch and a twin record are required for parity check.");
  }
  const mainBase = await mergeBase(projectRoot, meta.branch, twin.target);
  const twinBase = await mergeBase(projectRoot, twin.branch, twin.target);
  if (!mainBase || !twinBase) {
    throw new Error(`Could not find merge-base for ${target}.`);
  }
  const mainDiff = await diffRange(projectRoot, mainBase, meta.branch);
  const twinDiff = await diffRange(projectRoot, twinBase, twin.branch);
  const allowed = allowedDifferencePaths(meta);
  const result = compareTwinPatches(mainDiff, twinDiff, allowed);
  twin.base_sha = twinBase;
  twin.parity_ok = result.ok;
  twin.parity_checked_at = nowIso();
  return { result, mainDiff, twinDiff };
}

export interface OpenTwinOptions {
  projectRoot: string;
  meta: ChangeMeta;
  target: string;
  /** When true, skip gh and only create the branch locally (for tests). */
  dryPr?: boolean;
}

export interface OpenTwinResult {
  meta: ChangeMeta;
  branch: string;
  commitsCherryPicked: number;
  prUrl?: string;
}

export async function openBackportTwin(opts: OpenTwinOptions): Promise<OpenTwinResult> {
  const { projectRoot, target } = opts;
  const meta = opts.meta;
  if (!meta.branch) {
    throw new Error("This change has no main branch. Run sdd branch first.");
  }
  if (findTwin(meta, target)) {
    throw new Error(`Twin for ${target} already exists.`);
  }
  const targets = resolveBackportTargets(meta);
  if (!targets.includes(target)) {
    throw new Error(
      `Target ${target} is not listed in backport_targets. Add it to meta.yaml first.`,
    );
  }

  const safeTarget = safeGitRef(target);
  const safeMain = safeGitRef(meta.branch);

  const verifyTarget = await runGit(projectRoot, [
    "rev-parse",
    "--verify",
    "--quiet",
    "--end-of-options",
    safeTarget,
  ]);
  if (verifyTarget.exitCode !== 0) {
    throw new Error(`Backport target ref ${target} was not found.`);
  }

  const twinName = twinBranchName(meta.branch, target);
  const safeTwin = safeGitRef(twinName);
  const existing = await runGit(projectRoot, [
    "show-ref",
    "--verify",
    "--quiet",
    "--end-of-options",
    `refs/heads/${safeTwin}`,
  ]);
  if (existing.exitCode === 0) {
    throw new Error(`Branch ${twinName} already exists.`);
  }

  const created = await runGit(projectRoot, [
    "switch",
    "-c",
    safeTwin,
    "--end-of-options",
    safeTarget,
  ]);
  if (created.exitCode !== 0) {
    throw new Error(created.stderr.trim() || "Twin branch was not created.");
  }

  const range = safeGitRevRange(`${safeTarget}..${safeMain}`);
  const list = await runGit(projectRoot, ["rev-list", "--reverse", "--end-of-options", range]);
  const commits = list.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const sha of commits) {
    const safeSha = safeGitRef(sha);
    const picked = await runGit(projectRoot, ["cherry-pick", "--", safeSha]);
    if (picked.exitCode !== 0) {
      await runGit(projectRoot, ["cherry-pick", "--abort"]);
      await runGit(projectRoot, ["switch", "--end-of-options", safeMain]);
      throw new Error(picked.stderr.trim() || `Cherry-pick failed at ${sha}.`);
    }
  }

  const head = await runGit(projectRoot, ["rev-parse", "--end-of-options", "HEAD"]);
  const base = await mergeBase(projectRoot, twinName, target);
  const back = await runGit(projectRoot, ["switch", "--end-of-options", safeMain]);
  if (back.exitCode !== 0) {
    throw new Error("Could not switch back to the main change branch.");
  }

  const record = {
    target,
    branch: twinName,
    base_sha: base ?? undefined,
    head_sha: head.exitCode === 0 ? head.stdout.trim() : undefined,
    merged: false,
    pr: undefined as { number?: number; url?: string } | undefined,
  };

  let prUrl: string | undefined;
  if (!opts.dryPr) {
    assertSafeGitRemote("origin");
    const pushed = await runGit(projectRoot, [
      "push",
      "-u",
      "origin",
      "--end-of-options",
      safeTwin,
    ]);
    if (pushed.exitCode === 0) {
      const bodyLines = [
        `Twin backport for change ${meta.id}`,
        meta.pr?.url ? `Main PR: ${meta.pr.url}` : `Main branch: ${meta.branch}`,
        `Target: ${target}`,
      ];
      const dir = await mkdtemp(join(tmpdir(), "sdd-backport-"));
      const bodyPath = join(dir, "body.md");
      try {
        await writeFile(bodyPath, `${bodyLines.join("\n")}\n`);
        const opened = await runGh(projectRoot, [
          "pr",
          "create",
          "--base",
          safeTarget,
          "--head",
          safeTwin,
          "--title",
          `[backport ${target}] ${meta.title}`,
          "--body-file",
          bodyPath,
        ]);
        if (opened.exitCode === 0) {
          const match = opened.stdout.match(/https?:\/\/\S+\/pull\/(\d+)/);
          if (match?.[0]) {
            prUrl = match[0];
            record.pr = { number: match[1] ? Number(match[1]) : undefined, url: prUrl };
          }
        }
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }
  }

  meta.backports = [...(meta.backports ?? []), record];
  record.merged = await branchMergedInto(projectRoot, twinName, target);

  return {
    meta,
    branch: twinName,
    commitsCherryPicked: commits.length,
    prUrl,
  };
}

function runGh(
  cwd: string,
  args: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string; missing: boolean }> {
  return new Promise((resolve) => {
    const child = spawn("gh", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (err: NodeJS.ErrnoException) => {
      resolve({ exitCode: 127, stdout, stderr: err.message, missing: err.code === "ENOENT" });
    });
    child.on("close", (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr, missing: false });
    });
  });
}
