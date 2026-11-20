import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type BackportParityResult,
  type GitRunner,
  allowedDifferencePaths,
  assertSafeGitRemote,
  compareTwinPatches,
  findTwin,
  resolveBackportTargets,
  safeGitRef,
  safeGitRevRange,
  twinBranchName,
} from "./backport.js";
import type { ChangeMeta } from "./schemas.js";
import { nowIso } from "./slug.js";

type GitExit = { exitCode: number; stdout: string; stderr: string; missing: boolean };

function runGit(cwd: string, argv: readonly string[]): Promise<GitExit> {
  return new Promise((resolve) => {
    const child = spawn("git", argv as string[], { cwd, stdio: ["ignore", "pipe", "pipe"] });
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

export const defaultGitRunner: GitRunner = (cwd, args) => runGit(cwd, args);

async function mergeBase(
  cwd: string,
  left: string,
  right: string,
  run: GitRunner,
): Promise<string | null> {
  const result = await run(cwd, [
    "merge-base",
    "--end-of-options",
    safeGitRef(left),
    safeGitRef(right),
  ]);
  if (result.exitCode !== 0) return null;
  const sha = result.stdout.trim();
  return sha.length ? sha : null;
}

async function diffRange(cwd: string, base: string, head: string, run: GitRunner): Promise<string> {
  const range = safeGitRevRange(`${safeGitRef(base)}..${safeGitRef(head)}`);
  const result = await run(cwd, ["diff", "--end-of-options", range]);
  if (result.exitCode !== 0) return "";
  return result.stdout;
}

async function branchMergedInto(
  cwd: string,
  branch: string,
  target: string,
  run: GitRunner,
): Promise<boolean> {
  const result = await run(cwd, ["branch", "--merged", "--end-of-options", safeGitRef(target)]);
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
  run: GitRunner = defaultGitRunner,
): Promise<ChangeMeta> {
  if (!meta.branch) return meta;
  for (const record of meta.backports ?? []) {
    const head = await run(projectRoot, [
      "rev-parse",
      "--verify",
      "--end-of-options",
      safeGitRef(record.branch),
    ]);
    if (head.exitCode === 0) {
      record.head_sha = head.stdout.trim();
    }
    record.merged = await branchMergedInto(projectRoot, record.branch, record.target, run);
  }
  return meta;
}

export async function checkTwinParity(
  projectRoot: string,
  meta: ChangeMeta,
  target: string,
  run: GitRunner = defaultGitRunner,
): Promise<{ result: BackportParityResult; mainDiff: string; twinDiff: string }> {
  const twin = findTwin(meta, target);
  if (!meta.branch || !twin) {
    throw new Error("Main branch and a twin record are required for parity check.");
  }
  const mainBase = await mergeBase(projectRoot, meta.branch, twin.target, run);
  const twinBase = await mergeBase(projectRoot, twin.branch, twin.target, run);
  if (!mainBase || !twinBase) {
    throw new Error(`Could not find merge-base for ${target}.`);
  }
  const mainDiff = await diffRange(projectRoot, mainBase, meta.branch, run);
  const twinDiff = await diffRange(projectRoot, twinBase, twin.branch, run);
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
  run?: GitRunner;
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
  const run = opts.run ?? defaultGitRunner;
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

  const verifyTarget = await run(projectRoot, [
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
  const existing = await run(projectRoot, [
    "show-ref",
    "--verify",
    "--quiet",
    "--end-of-options",
    `refs/heads/${safeTwin}`,
  ]);
  if (existing.exitCode === 0) {
    throw new Error(`Branch ${twinName} already exists.`);
  }

  const created = await run(projectRoot, [
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
  const list = await run(projectRoot, ["rev-list", "--reverse", "--end-of-options", range]);
  const commits = list.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const sha of commits) {
    const safeSha = safeGitRef(sha);
    const picked = await run(projectRoot, ["cherry-pick", "--", safeSha]);
    if (picked.exitCode !== 0) {
      await run(projectRoot, ["cherry-pick", "--abort"]);
      await run(projectRoot, ["switch", "--end-of-options", safeMain]);
      throw new Error(picked.stderr.trim() || `Cherry-pick failed at ${sha}.`);
    }
  }

  const head = await run(projectRoot, ["rev-parse", "--end-of-options", "HEAD"]);
  const base = await mergeBase(projectRoot, twinName, target, run);
  const back = await run(projectRoot, ["switch", "--end-of-options", safeMain]);
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
    const pushed = await run(projectRoot, ["push", "-u", "origin", "--end-of-options", safeTwin]);
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
  record.merged = await branchMergedInto(projectRoot, twinName, target, run);

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
