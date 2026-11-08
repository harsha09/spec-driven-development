/**
 * One sandbox record and its git worktree. Opening also leases a port range
 * and a build slot. This slice does not run a command in the worktree.
 */
import { spawn } from "node:child_process";
import { constants, type Stats } from "node:fs";
import { lstat, mkdir, open, readdir, realpath, rename, rm, unlink } from "node:fs/promises";
import { isAbsolute, join, relative } from "pathe";
import { z } from "zod";
import { loadChangeMeta } from "../change-context.js";
import { loadConfig } from "../config.js";
import { type SandboxLease, allocateLease, releaseLease } from "./lease.js";

const RECORD_FILE = "record.json";
const WORKTREE_DIR = "worktree";
const IGNORE_LINE = "sandboxes/";
const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,120}$/;
const LEAVE = "A sandbox path cannot leave the repository.\n";

const STATUSES = ["opening", "ready", "running", "needs-input", "failed", "closed"] as const;

export type SandboxStatus = (typeof STATUSES)[number];

export interface SandboxRecord {
  id: string;
  path: string;
  baseSha: string;
  branch: string;
  status: SandboxStatus;
  port: number;
  portEnd: number;
  buildSlot: number;
  buildDir: string;
  leasePid: number;
  env: SandboxLease["env"];
}

export interface SandboxCommandResult {
  exitCode: number;
  stdout: string;
}

const SandboxRecordSchema = z
  .object({
    id: z.string(),
    path: z.string(),
    baseSha: z.string().regex(SHA),
    branch: z.string().min(1),
    status: z.enum(STATUSES),
    port: z.number().int(),
    portEnd: z.number().int(),
    buildSlot: z.number().int(),
    buildDir: z.string(),
    leasePid: z.number().int(),
    env: z
      .object({
        PORT: z.string(),
        CARGO_TARGET_DIR: z.string(),
      })
      .strict(),
  })
  .strict();

type Anchored =
  | { ok: true; path: string }
  | { ok: false; missing: true }
  | { ok: false; error: string };

type WorktreeKind = "absent" | "partial" | "ours" | "escape";

function ok(stdout: string): SandboxCommandResult {
  return { exitCode: 0, stdout };
}

function fail(stdout: string): SandboxCommandResult {
  return { exitCode: 1, stdout };
}

function isEnoent(err: unknown): boolean {
  return !!err && typeof err === "object" && "code" in err && err.code === "ENOENT";
}

function inside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return (
    rel !== "" &&
    rel !== ".." &&
    !rel.startsWith("../") &&
    !rel.startsWith("..\\") &&
    !isAbsolute(rel)
  );
}

function sandboxIdError(id: string): string | null {
  if (
    id === "." ||
    id === ".." ||
    id.includes("..") ||
    id.includes("/") ||
    id.includes("\\") ||
    id.includes("\0")
  ) {
    return "A sandbox id cannot contain a path separator.\n";
  }
  if (!ID_RE.test(id)) return "A sandbox id is not valid.\n";
  return null;
}

function worktreeRel(id: string): string {
  return `.sdd/sandboxes/${id}/${WORKTREE_DIR}`;
}

function stale(id: string): string {
  return `Sandbox ${id} is stale. Close it with sdd sandbox close ${id}.\n`;
}

function git(
  cwd: string,
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key === "GIT_DIR" || key === "GIT_WORK_TREE" || value === undefined) continue;
    env[key] = value;
  }
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function readNoFollow(file: string): Promise<string | null> {
  try {
    const st = await lstat(file);
    if (st.isSymbolicLink() || !st.isFile()) return null;
    const fh = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      return await fh.readFile({ encoding: "utf8" });
    } finally {
      await fh.close();
    }
  } catch {
    return null;
  }
}

const LOCK_WAIT_MS = 30_000;
const LOCK_POLL_MS = 20;
const LOCK_FRESH_MS = 1_000;

function processAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
    return code !== "ESRCH";
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function errnoCode(err: unknown): string {
  return err && typeof err === "object" && "code" in err ? String(err.code) : "";
}

/** Exclusive per-id lock. A dead holder's pid is stale and the file can be taken. */
async function createLock(lockPath: string): Promise<"ok" | "held" | "error"> {
  let st: Stats | null = null;
  try {
    st = await lstat(lockPath);
  } catch (err) {
    if (!isEnoent(err)) throw err;
  }
  if (st?.isSymbolicLink() || (st && !st.isFile())) return "error";
  if (st) {
    const raw = await readNoFollow(lockPath);
    if (raw === null) return "held";
    const pid = Number(raw.trim());
    const fresh = Date.now() - st.mtimeMs < LOCK_FRESH_MS;
    if ((raw.trim() === "" && fresh) || processAlive(pid)) return "held";
    try {
      await unlink(lockPath);
    } catch (err) {
      if (!isEnoent(err)) return "held";
    }
  }
  try {
    const fh = await open(
      lockPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o644,
    );
    try {
      await fh.writeFile(`${process.pid}\n`, "utf8");
    } finally {
      await fh.close();
    }
    return "ok";
  } catch (err) {
    if (isEnoent(err) || errnoCode(err) === "EEXIST") return "held";
    return "error";
  }
}

async function releaseLock(lockPath: string): Promise<void> {
  try {
    const st = await lstat(lockPath);
    if (st.isSymbolicLink() || !st.isFile()) return;
  } catch {
    return;
  }
  const raw = await readNoFollow(lockPath);
  if (raw?.trim() !== String(process.pid)) return;
  try {
    await unlink(lockPath);
  } catch {
    // The next open treats a dead pid as stale.
  }
}

async function withSandboxLock(
  repo: string,
  id: string,
  body: () => Promise<SandboxCommandResult>,
): Promise<SandboxCommandResult> {
  const sandboxes = await anchor(repo, [".sdd", "sandboxes"], true);
  if (!sandboxes.ok) return fail("error" in sandboxes ? sandboxes.error : LEAVE);
  const lockPath = join(sandboxes.path, `.lock-${id}`);
  const started = Date.now();
  let release: (() => Promise<void>) | null = null;
  while (Date.now() - started < LOCK_WAIT_MS) {
    const created = await createLock(lockPath);
    if (created === "error") return fail(LEAVE);
    if (created === "ok") {
      release = () => releaseLock(lockPath);
      break;
    }
    await delay(LOCK_POLL_MS);
  }
  if (!release) return fail(`Sandbox ${id} is busy. Try again.\n`);
  try {
    return await body();
  } finally {
    await release();
  }
}

async function writeNoFollow(file: string, body: string, create: boolean): Promise<boolean> {
  const flags = create
    ? constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW
    : constants.O_WRONLY | constants.O_TRUNC | constants.O_NOFOLLOW;
  try {
    const fh = await open(file, flags, 0o644);
    try {
      await fh.writeFile(body, "utf8");
    } finally {
      await fh.close();
    }
    return true;
  } catch {
    return false;
  }
}

async function anchor(repoReal: string, parts: string[], create: boolean): Promise<Anchored> {
  let current = repoReal;
  for (const part of parts) {
    const next = join(current, part);
    let st: Stats;
    try {
      st = await lstat(next);
    } catch (err) {
      if (!isEnoent(err)) throw err;
      if (!create) return { ok: false, missing: true };
      try {
        await mkdir(next, { recursive: true });
      } catch (mkdirErr) {
        if (errnoCode(mkdirErr) !== "EEXIST") throw mkdirErr;
      }
      st = await lstat(next);
    }
    if (st.isSymbolicLink() || !st.isDirectory()) return { ok: false, error: LEAVE };
    const real = await realpath(next);
    const parentReal = await realpath(current);
    if (real !== join(parentReal, part) || !inside(repoReal, real))
      return { ok: false, error: LEAVE };
    current = real;
  }
  return { ok: true, path: current };
}

async function ensureSandboxIgnore(sddReal: string): Promise<string | null> {
  const file = join(sddReal, ".gitignore");
  let exists = false;
  try {
    const st = await lstat(file);
    if (st.isSymbolicLink() || !st.isFile()) return LEAVE;
    exists = true;
  } catch (err) {
    if (!isEnoent(err)) throw err;
  }
  const original = exists ? await readNoFollow(file) : "";
  if (original === null) return LEAVE;
  const present = new Set(
    original
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#")),
  );
  if (present.has(IGNORE_LINE)) return null;
  let next = original;
  if (next.length > 0 && !next.endsWith("\n")) next += "\n";
  next += `${IGNORE_LINE}\n`;
  if (!(await writeNoFollow(file, next, !exists))) return LEAVE;
  return null;
}

async function resolveBase(
  repo: string,
  branch: string | undefined,
): Promise<{ sha: string; branch: string } | { error: string }> {
  const named = branch?.trim();
  if (named) {
    if (
      named.startsWith("-") ||
      named.includes("\n") ||
      named.includes("\0") ||
      named.includes("..")
    ) {
      return { error: `Change branch ${named} is not in this repository.\n` };
    }
    const found = await git(repo, [
      "rev-parse",
      "--verify",
      "--end-of-options",
      `${named}^{commit}`,
    ]);
    if (found.code !== 0) return { error: `Change branch ${named} is not in this repository.\n` };
    const sha = found.stdout.trim().toLowerCase();
    if (!SHA.test(sha)) return { error: "Git HEAD is unavailable.\n" };
    return { sha, branch: named };
  }
  const head = await git(repo, ["rev-parse", "--verify", "HEAD"]);
  if (head.code !== 0) return { error: "Git HEAD is unavailable.\n" };
  const sha = head.stdout.trim().toLowerCase();
  if (!SHA.test(sha)) return { error: "Git HEAD is unavailable.\n" };
  const current = await git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const name = current.code === 0 ? current.stdout.trim() : "HEAD";
  if (!name || name.includes("\n") || name.includes("\0"))
    return { error: "Git HEAD is unavailable.\n" };
  return { sha, branch: name };
}

async function commitExists(repo: string, sha: string): Promise<boolean> {
  if (!SHA.test(sha)) return false;
  const found = await git(repo, ["cat-file", "-e", `${sha}^{commit}`]);
  return found.code === 0;
}

async function registeredWorktree(repo: string, worktreeReal: string): Promise<boolean> {
  const listed = await git(repo, ["worktree", "list", "--porcelain"]);
  if (listed.code !== 0) return false;
  for (const line of listed.stdout.split("\n")) {
    if (!line.startsWith("worktree ")) continue;
    const path = line.slice("worktree ".length).trim();
    try {
      if ((await realpath(path)) === worktreeReal) return true;
    } catch {
      if (path === worktreeReal) return true;
    }
  }
  return false;
}

async function classifyWorktree(repo: string, recordReal: string): Promise<WorktreeKind> {
  const expected = join(recordReal, WORKTREE_DIR);
  let st: Stats;
  try {
    st = await lstat(expected);
  } catch (err) {
    if (isEnoent(err)) return "absent";
    throw err;
  }
  if (st.isSymbolicLink() || !st.isDirectory()) return "escape";
  const real = await realpath(expected);
  if (real !== expected || !inside(recordReal, real) || real === repo) return "escape";
  const top = await git(real, ["rev-parse", "--show-toplevel"]);
  if (top.code !== 0) return "partial";
  let topReal: string;
  try {
    topReal = await realpath(top.stdout.trim());
  } catch {
    return "partial";
  }
  if (topReal === real && (await registeredWorktree(repo, real))) return "ours";
  if (topReal === repo && inside(recordReal, real)) return "partial";
  return "escape";
}

function deletable(
  repo: string,
  sandboxesReal: string,
  recordReal: string,
  target: string,
): boolean {
  if (
    target === repo ||
    target === sandboxesReal ||
    target === recordReal ||
    target === join(repo, ".git")
  ) {
    return false;
  }
  return inside(repo, target) && inside(sandboxesReal, target) && inside(recordReal, target);
}

async function removeWorktree(
  repo: string,
  recordReal: string,
  discard: boolean,
): Promise<string | null> {
  const sandboxes = await anchor(repo, [".sdd", "sandboxes"], false);
  if (!sandboxes.ok) return "error" in sandboxes ? sandboxes.error : LEAVE;
  const expected = join(recordReal, WORKTREE_DIR);
  let st: Stats;
  try {
    st = await lstat(expected);
  } catch (err) {
    if (isEnoent(err)) {
      await git(repo, ["worktree", "prune"]);
      return null;
    }
    throw err;
  }
  if (st.isSymbolicLink()) {
    await unlink(expected);
    await git(repo, ["worktree", "prune"]);
    return null;
  }
  if (!st.isDirectory()) {
    await unlink(expected);
    return null;
  }
  const real = await realpath(expected);
  if (!deletable(repo, sandboxes.path, recordReal, real) || real !== expected) return LEAVE;
  const top = await git(real, ["rev-parse", "--show-toplevel"]);
  let topReal = "";
  if (top.code === 0) {
    try {
      topReal = await realpath(top.stdout.trim());
    } catch {
      topReal = "";
    }
    if (topReal !== real && topReal !== repo) return LEAVE;
  }
  if (topReal === real && (await registeredWorktree(repo, real))) {
    const args = discard ? ["worktree", "remove", "--force", real] : ["worktree", "remove", real];
    const removed = await git(repo, args);
    if (removed.code !== 0) return "The sandbox worktree could not be removed.\n";
    try {
      await lstat(expected);
      return "The sandbox worktree could not be removed.\n";
    } catch (err) {
      if (!isEnoent(err)) throw err;
    }
    await git(repo, ["worktree", "prune"]);
    return null;
  }
  if (topReal === repo || top.code !== 0) {
    await rm(real, { recursive: true, force: true });
    await git(repo, ["worktree", "prune"]);
    return null;
  }
  return LEAVE;
}

async function worktreeHead(recordReal: string): Promise<string | null> {
  const path = join(recordReal, WORKTREE_DIR);
  const found = await git(path, ["rev-parse", "HEAD"]);
  if (found.code !== 0) return null;
  const sha = found.stdout.trim().toLowerCase();
  return SHA.test(sha) ? sha : null;
}

async function addWorktree(
  repo: string,
  recordReal: string,
  sha: string,
): Promise<"ready" | "fail"> {
  const path = join(recordReal, WORKTREE_DIR);
  if (
    (await classifyWorktree(repo, recordReal)) === "ours" &&
    (await worktreeHead(recordReal)) === sha
  ) {
    return "ready";
  }
  await git(repo, ["worktree", "prune"]);
  const added = await git(repo, ["worktree", "add", "--detach", path, sha]);
  const present =
    (await classifyWorktree(repo, recordReal)) === "ours" &&
    (await worktreeHead(recordReal)) === sha;
  if (added.code !== 0) return present ? "ready" : "fail";
  return present ? "ready" : "fail";
}

async function readRecord(recordReal: string): Promise<SandboxRecord | null | "bad"> {
  const raw = await readNoFollow(join(recordReal, RECORD_FILE));
  if (raw === null) {
    try {
      await lstat(join(recordReal, RECORD_FILE));
      return "bad";
    } catch (err) {
      if (isEnoent(err)) return null;
      throw err;
    }
  }
  try {
    const parsed = SandboxRecordSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : "bad";
  } catch {
    return "bad";
  }
}

async function writeRecord(recordReal: string, record: SandboxRecord): Promise<boolean> {
  const file = join(recordReal, RECORD_FILE);
  try {
    const st = await lstat(file);
    if (st.isSymbolicLink() || !st.isFile()) return false;
  } catch (err) {
    if (!isEnoent(err)) throw err;
  }
  const tmp = join(recordReal, `.${RECORD_FILE}.${process.pid}.tmp`);
  try {
    const st = await lstat(tmp);
    if (st.isSymbolicLink() || st.isFile()) await unlink(tmp);
    else return false;
  } catch (err) {
    if (!isEnoent(err)) throw err;
  }
  const body = `${JSON.stringify(record, null, 2)}\n`;
  if (!(await writeNoFollow(tmp, body, true))) return false;
  await rename(tmp, file);
  return true;
}

async function withLease(
  repo: string,
  record: SandboxRecord,
): Promise<SandboxRecord | { error: string }> {
  const lease = await allocateLease(repo, record.id);
  if ("error" in lease) return lease;
  return { ...record, ...lease };
}

async function resume(
  repo: string,
  recordReal: string,
  record: SandboxRecord,
): Promise<SandboxCommandResult> {
  const id = record.id;
  if (record.path !== worktreeRel(id) || !(await commitExists(repo, record.baseSha)))
    return fail(stale(id));
  if (record.status === "failed" || record.status === "closed") {
    return fail(`Sandbox ${id} is ${record.status}. Close it with sdd sandbox close ${id}.\n`);
  }
  const leased = await withLease(repo, record);
  if ("error" in leased) return fail(leased.error);
  record = leased;
  const kind = await classifyWorktree(repo, recordReal);
  if (record.status === "opening") {
    if (kind === "escape") return fail(LEAVE);
    if (kind === "partial") {
      const removed = await removeWorktree(repo, recordReal, false);
      if (removed) return fail(removed);
    }
    if (kind !== "ours") {
      if ((await addWorktree(repo, recordReal, record.baseSha)) === "fail") {
        return fail("The sandbox worktree could not be created.\n");
      }
    } else if ((await worktreeHead(recordReal)) !== record.baseSha) {
      return fail(stale(id));
    }
    const ready: SandboxRecord = { ...record, status: "ready" };
    if (!(await writeRecord(recordReal, ready))) return fail(LEAVE);
    return ok(`Sandbox ${id} is ready.\n`);
  }
  if (kind !== "ours") return fail(stale(id));
  if (!(await writeRecord(recordReal, record))) return fail(LEAVE);
  return ok(`Sandbox ${id} is ${record.status}.\n`);
}

async function createFresh(
  repo: string,
  recordReal: string,
  id: string,
  base: { sha: string; branch: string },
): Promise<SandboxCommandResult> {
  const kind = await classifyWorktree(repo, recordReal);
  if (kind === "escape") return fail(LEAVE);
  if (kind === "ours" && (await worktreeHead(recordReal)) !== base.sha) return fail(stale(id));
  const lease = await allocateLease(repo, id);
  if ("error" in lease) return fail(lease.error);
  if (kind === "ours") {
    const ready: SandboxRecord = {
      id,
      path: worktreeRel(id),
      baseSha: base.sha,
      branch: base.branch,
      status: "ready",
      ...lease,
    };
    if (!(await writeRecord(recordReal, ready))) return fail(LEAVE);
    return ok(`Sandbox ${id} is ready.\n`);
  }
  if (kind === "partial") {
    const removed = await removeWorktree(repo, recordReal, false);
    if (removed) return fail(removed);
  }
  const opening: SandboxRecord = {
    id,
    path: worktreeRel(id),
    baseSha: base.sha,
    branch: base.branch,
    status: "opening",
    ...lease,
  };
  if (!(await writeRecord(recordReal, opening))) return fail(LEAVE);
  if ((await addWorktree(repo, recordReal, base.sha)) === "fail") {
    return fail("The sandbox worktree could not be created.\n");
  }
  const ready: SandboxRecord = { ...opening, status: "ready" };
  if (!(await writeRecord(recordReal, ready))) return fail(LEAVE);
  return ok(`Sandbox ${id} is ready.\n`);
}

async function openLocked(
  repo: string,
  changeId: string,
  branch: string | undefined,
): Promise<SandboxCommandResult> {
  const existingDir = await anchor(repo, [".sdd", "sandboxes", changeId], false);
  if (existingDir.ok) {
    const existing = await readRecord(existingDir.path);
    if (existing === "bad" || (existing && existing.id !== changeId)) return fail(stale(changeId));
    if (existing) return resume(repo, existingDir.path, existing);
  } else if (!("missing" in existingDir)) {
    return fail(existingDir.error);
  }
  const base = await resolveBase(repo, branch);
  if ("error" in base) return fail(base.error);
  const recordDir = await anchor(repo, [".sdd", "sandboxes", changeId], true);
  if (!recordDir.ok) return fail("error" in recordDir ? recordDir.error : LEAVE);
  return createFresh(repo, recordDir.path, changeId, base);
}

export async function openSandbox(
  projectRoot: string,
  changeId: string,
): Promise<SandboxCommandResult> {
  const idError = sandboxIdError(changeId);
  if (idError) return fail(idError);
  const config = await loadConfig(projectRoot);
  let meta: { branch?: string };
  try {
    meta = await loadChangeMeta(projectRoot, config, changeId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Change not found.";
    return fail(message.endsWith("\n") ? message : `${message}\n`);
  }
  const repo = await realpath(projectRoot);
  const sdd = await anchor(repo, [".sdd"], false);
  if (!sdd.ok) return fail("error" in sdd ? sdd.error : "SDD is not initialized here.\n");
  const ignored = await ensureSandboxIgnore(sdd.path);
  if (ignored) return fail(ignored);
  const placed = await anchor(repo, [".sdd", "sandboxes", changeId], false);
  if (!placed.ok && !("missing" in placed)) return fail(placed.error);
  if (!placed.ok) {
    const base = await resolveBase(repo, meta.branch);
    if ("error" in base) return fail(base.error);
  }
  return withSandboxLock(repo, changeId, () => openLocked(repo, changeId, meta.branch));
}

export async function listSandboxes(projectRoot: string): Promise<SandboxCommandResult> {
  const repo = await realpath(projectRoot);
  const sandboxes = await anchor(repo, [".sdd", "sandboxes"], false);
  if (!sandboxes.ok) {
    if ("missing" in sandboxes) return ok("No sandboxes.\n");
    return fail(sandboxes.error);
  }
  const names = (await readdir(sandboxes.path, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => entry.name)
    .sort();
  const lines: string[] = [];
  for (const id of names) {
    if (sandboxIdError(id)) continue;
    const dir = join(sandboxes.path, id);
    let real: string;
    try {
      real = await realpath(dir);
    } catch {
      continue;
    }
    if (real !== dir || !inside(sandboxes.path, real)) continue;
    const record = await readRecord(real);
    if (!record) lines.push(`${id} opening`);
    else if (record === "bad" || record.id !== id) lines.push(`${id} failed`);
    else lines.push(`${id} ${record.status}`);
  }
  if (lines.length === 0) return ok("No sandboxes.\n");
  return ok(`${lines.join("\n")}\n`);
}

async function hasLocalEdits(
  repo: string,
  recordReal: string,
): Promise<boolean | "absent" | "symlink"> {
  const expected = join(recordReal, WORKTREE_DIR);
  let st: Stats;
  try {
    st = await lstat(expected);
  } catch (err) {
    if (isEnoent(err)) return "absent";
    throw err;
  }
  if (st.isSymbolicLink()) return "symlink";
  if (!st.isDirectory()) return "absent";
  const real = await realpath(expected);
  if (real !== expected || !inside(recordReal, real) || real === repo) return "absent";
  const status = await git(real, ["status", "--porcelain"]);
  if (status.code !== 0) return "absent";
  return status.stdout.trim().length > 0;
}

async function removeRecord(
  repo: string,
  recordReal: string,
  discard: boolean,
): Promise<string | null> {
  const sandboxes = await anchor(repo, [".sdd", "sandboxes"], false);
  if (!sandboxes.ok) return "error" in sandboxes ? sandboxes.error : LEAVE;
  let st: Stats;
  try {
    st = await lstat(recordReal);
  } catch (err) {
    if (isEnoent(err)) return null;
    throw err;
  }
  if (st.isSymbolicLink() || !st.isDirectory()) return LEAVE;
  const real = await realpath(recordReal);
  if (
    real !== recordReal ||
    real === repo ||
    real === sandboxes.path ||
    !inside(sandboxes.path, real)
  ) {
    return LEAVE;
  }
  const removed = await removeWorktree(repo, real, discard);
  if (removed) return removed;
  let again: Stats;
  try {
    again = await lstat(real);
  } catch (err) {
    if (isEnoent(err)) return null;
    throw err;
  }
  if (again.isSymbolicLink() || !again.isDirectory()) return LEAVE;
  const againReal = await realpath(real);
  if (againReal !== real || againReal === repo || !inside(sandboxes.path, againReal)) return LEAVE;
  await rm(againReal, { recursive: true, force: true });
  return null;
}

export async function closeSandbox(
  projectRoot: string,
  sandboxId: string,
  options?: { force?: boolean },
): Promise<SandboxCommandResult> {
  const idError = sandboxIdError(sandboxId);
  if (idError) return fail(idError);
  const repo = await realpath(projectRoot);
  const recordDir = await anchor(repo, [".sdd", "sandboxes", sandboxId], false);
  if (!recordDir.ok) {
    if ("missing" in recordDir) return fail(`Sandbox ${sandboxId} is not open.\n`);
    return fail(recordDir.error);
  }
  return withSandboxLock(repo, sandboxId, async () => {
    const again = await anchor(repo, [".sdd", "sandboxes", sandboxId], false);
    if (!again.ok) {
      if ("missing" in again) return fail(`Sandbox ${sandboxId} is not open.\n`);
      return fail(again.error);
    }
    const edits = await hasLocalEdits(repo, again.path);
    if (edits === true && options?.force !== true) {
      return fail(`Sandbox ${sandboxId} has uncommitted changes. Pass --force to discard them.\n`);
    }
    const removed = await removeRecord(repo, again.path, options?.force === true);
    if (removed) return fail(removed);
    const released = await releaseLease(repo, sandboxId);
    if (released) return fail(released);
    if (edits === true) return ok(`Sandbox ${sandboxId} is closed. Local edits were discarded.\n`);
    return ok(`Sandbox ${sandboxId} is closed.\n`);
  });
}
