/**
 * Port range and build slot for one sandbox. The table lives under
 * `.sdd/sandboxes`. A dead holder pid is reclaimed. This slice does not
 * run a command in the worktree.
 */
import { spawn } from "node:child_process";
import { constants, type Stats } from "node:fs";
import { lstat, mkdir, open, readFile, realpath, rename, unlink } from "node:fs/promises";
import { isAbsolute, join, relative } from "pathe";
import { z } from "zod";

const PORT_BASE = 45_000;
const PORT_SPAN = 10;
const PORT_MAX = 45_999;
const LOCK_WAIT_MS = 30_000;
const LOCK_POLL_MS = 20;
const LOCK_FRESH_MS = 1_000;
const LEAVE = "A sandbox path cannot leave the repository.\n";
const TABLE_FILE = "leases.json";
const LOCK_FILE = ".lock-leases";
const BUILD_DIR = "build";

const LISTEN_SCRIPT = [
  'const net = require("net");',
  "const port = Number(process.argv[1]);",
  "if (!Number.isInteger(port) || port < 1024 || port > 65535) process.exit(1);",
  "const server = net.createServer();",
  'server.on("error", () => process.exit(1));',
  'server.listen({ port, host: "127.0.0.1", exclusive: true }, () => {',
  '  process.stdout.write("ok\\n");',
  "});",
].join("");

const LeaseRowSchema = z
  .object({
    id: z.string(),
    port: z.number().int(),
    portEnd: z.number().int(),
    buildSlot: z.number().int(),
    buildDir: z.string(),
    pid: z.number().int(),
  })
  .strict();

const TableSchema = z
  .object({
    leases: z.array(LeaseRowSchema),
  })
  .strict();

type LeaseRow = z.infer<typeof LeaseRowSchema>;

export interface SandboxLease {
  port: number;
  portEnd: number;
  buildSlot: number;
  buildDir: string;
  leasePid: number;
  env: {
    PORT: string;
    CARGO_TARGET_DIR: string;
  };
}

function errnoCode(err: unknown): string {
  return err && typeof err === "object" && "code" in err ? String(err.code) : "";
}

function isEnoent(err: unknown): boolean {
  return errnoCode(err) === "ENOENT";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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

function processAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return errnoCode(err) !== "ESRCH";
  }
}

function expectedBuildDir(id: string): string {
  return `.sdd/sandboxes/${id}/${BUILD_DIR}`;
}

function toLease(row: LeaseRow): SandboxLease {
  return {
    port: row.port,
    portEnd: row.portEnd,
    buildSlot: row.buildSlot,
    buildDir: row.buildDir,
    leasePid: row.pid,
    env: {
      PORT: String(row.port),
      CARGO_TARGET_DIR: row.buildDir,
    },
  };
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart <= bEnd && bStart <= aEnd;
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

async function isHolder(pid: number, port: number): Promise<boolean> {
  if (!processAlive(pid)) return false;
  try {
    const raw = await readFile(`/proc/${pid}/cmdline`);
    const args = raw
      .toString("utf8")
      .split("\0")
      .filter((arg) => arg.length > 0);
    return args.includes(String(port)) && args.some((arg) => arg.includes("127.0.0.1"));
  } catch {
    return false;
  }
}

async function stopHolder(pid: number, port: number): Promise<void> {
  if (!(await isHolder(pid, port))) return;
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }
  for (let i = 0; i < 50; i++) {
    if (!processAlive(pid)) return;
    await delay(10);
  }
  if (await isHolder(pid, port)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // already gone
    }
  }
}

async function sandboxesDir(repo: string): Promise<{ path: string } | { error: string }> {
  const dir = join(repo, ".sdd", "sandboxes");
  let st: Stats;
  try {
    st = await lstat(dir);
  } catch (err) {
    if (!isEnoent(err)) throw err;
    return { error: LEAVE };
  }
  if (st.isSymbolicLink() || !st.isDirectory()) return { error: LEAVE };
  const real = await realpath(dir);
  const parent = await realpath(join(repo, ".sdd"));
  if (real !== join(parent, "sandboxes") || !inside(repo, real)) return { error: LEAVE };
  return { path: real };
}

async function readTable(dir: string): Promise<LeaseRow[] | { error: string }> {
  const file = join(dir, TABLE_FILE);
  let st: Stats | null = null;
  try {
    st = await lstat(file);
  } catch (err) {
    if (isEnoent(err)) return [];
    throw err;
  }
  if (st.isSymbolicLink() || !st.isFile()) return { error: LEAVE };
  const raw = await readNoFollow(file);
  if (raw === null) return { error: LEAVE };
  try {
    const parsed = TableSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return { error: "The sandbox lease table cannot be read.\n" };
    return parsed.data.leases;
  } catch {
    return { error: "The sandbox lease table cannot be read.\n" };
  }
}

async function writeTable(dir: string, leases: LeaseRow[]): Promise<string | null> {
  const file = join(dir, TABLE_FILE);
  try {
    const st = await lstat(file);
    if (st.isSymbolicLink() || !st.isFile()) return LEAVE;
  } catch (err) {
    if (!isEnoent(err)) throw err;
  }
  const tmp = join(dir, `.${TABLE_FILE}.${process.pid}.tmp`);
  try {
    const st = await lstat(tmp);
    if (st.isSymbolicLink() || st.isFile()) await unlink(tmp);
    else return LEAVE;
  } catch (err) {
    if (!isEnoent(err)) throw err;
  }
  const body = `${JSON.stringify({ leases }, null, 2)}\n`;
  const fh = await open(
    tmp,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o644,
  );
  try {
    await fh.writeFile(body, "utf8");
  } finally {
    await fh.close();
  }
  await rename(tmp, file);
  return null;
}

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
    // A dead pid is stale on the next allocation.
  }
}

async function withAllocationLock<T>(
  dir: string,
  body: () => Promise<T>,
): Promise<T | { error: string }> {
  const lockPath = join(dir, LOCK_FILE);
  const started = Date.now();
  let release: (() => Promise<void>) | null = null;
  while (Date.now() - started < LOCK_WAIT_MS) {
    const created = await createLock(lockPath);
    if (created === "error") return { error: LEAVE };
    if (created === "ok") {
      release = () => releaseLock(lockPath);
      break;
    }
    await delay(LOCK_POLL_MS);
  }
  if (!release) return { error: "The sandbox lease table is busy. Try again.\n" };
  try {
    return await body();
  } finally {
    await release();
  }
}

async function ensureBuildDir(repo: string, id: string): Promise<string | { error: string }> {
  const parent = join(repo, ".sdd", "sandboxes", id);
  let parentStat: Stats;
  try {
    parentStat = await lstat(parent);
  } catch (err) {
    if (isEnoent(err)) return { error: LEAVE };
    throw err;
  }
  if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) return { error: LEAVE };
  const parentReal = await realpath(parent);
  const sandboxes = await realpath(join(repo, ".sdd", "sandboxes"));
  if (parentReal !== join(sandboxes, id) || !inside(sandboxes, parentReal)) return { error: LEAVE };
  const dir = join(parentReal, BUILD_DIR);
  try {
    await mkdir(dir, { recursive: true });
  } catch (err) {
    if (errnoCode(err) !== "EEXIST") throw err;
  }
  const st = await lstat(dir);
  if (st.isSymbolicLink() || !st.isDirectory()) return { error: LEAVE };
  const real = await realpath(dir);
  if (real !== dir || !inside(parentReal, real)) return { error: LEAVE };
  return expectedBuildDir(id);
}

async function startHolder(port: number): Promise<number | null> {
  const child = spawn(process.execPath, ["-e", LISTEN_SCRIPT, String(port)], {
    detached: true,
    stdio: ["ignore", "pipe", "ignore"],
  });
  const ready = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), 2_000);
    child.stdout?.once("data", () => {
      clearTimeout(timer);
      resolve(true);
    });
    child.once("exit", () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.once("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
  const pid = child.pid;
  const stdout = child.stdout as { unref?: () => void } | null;
  stdout?.unref?.();
  child.unref();
  if (!ready || !pid || !processAlive(pid)) {
    if (pid) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // already gone
      }
    }
    return null;
  }
  return pid;
}

function nextBuildSlot(leases: LeaseRow[]): number {
  const used = new Set(leases.map((row) => row.buildSlot));
  let slot = 0;
  while (used.has(slot)) slot += 1;
  return slot;
}

function nextPort(leases: LeaseRow[], skipped: Set<number>): number | null {
  for (let port = PORT_BASE; port + PORT_SPAN - 1 <= PORT_MAX; port += PORT_SPAN) {
    if (skipped.has(port)) continue;
    const end = port + PORT_SPAN - 1;
    const taken = leases.some((row) => rangesOverlap(row.port, row.portEnd, port, end));
    if (!taken) return port;
  }
  return null;
}

async function reclaimDead(leases: LeaseRow[]): Promise<LeaseRow[]> {
  const kept: LeaseRow[] = [];
  for (const row of leases) {
    if (processAlive(row.pid)) kept.push(row);
  }
  return kept;
}

export async function allocateLease(
  repo: string,
  id: string,
): Promise<SandboxLease | { error: string }> {
  const sandboxes = await sandboxesDir(repo);
  if ("error" in sandboxes) return sandboxes;
  const locked = await withAllocationLock(sandboxes.path, async () => {
    const loaded = await readTable(sandboxes.path);
    if ("error" in loaded) return loaded;
    const live = await reclaimDead(loaded);
    const own = live.find((row) => row.id === id);
    if (own) {
      if (own.buildDir !== expectedBuildDir(id)) return { error: LEAVE };
      const built = await ensureBuildDir(repo, id);
      if (typeof built !== "string") return built;
      if (live.length !== loaded.length) {
        const written = await writeTable(sandboxes.path, live);
        if (written) return { error: written };
      }
      return toLease(own);
    }
    const buildDir = await ensureBuildDir(repo, id);
    if (typeof buildDir !== "string") return buildDir;
    const buildSlot = nextBuildSlot(live);
    const skipped = new Set<number>();
    while (true) {
      const port = nextPort(live, skipped);
      if (port === null) return { error: "No free sandbox port.\n" };
      const pid = await startHolder(port);
      if (pid === null) {
        skipped.add(port);
        continue;
      }
      const row: LeaseRow = {
        id,
        port,
        portEnd: port + PORT_SPAN - 1,
        buildSlot,
        buildDir,
        pid,
      };
      const written = await writeTable(sandboxes.path, [...live, row]);
      if (written) {
        await stopHolder(pid, port);
        return { error: written };
      }
      return toLease(row);
    }
  });
  return locked;
}

export async function releaseLease(repo: string, id: string): Promise<string | null> {
  const sandboxes = await sandboxesDir(repo);
  if ("error" in sandboxes) return sandboxes.error;
  const locked = await withAllocationLock(sandboxes.path, async () => {
    const loaded = await readTable(sandboxes.path);
    if ("error" in loaded) return loaded.error;
    const own = loaded.find((row) => row.id === id);
    if (own) await stopHolder(own.pid, own.port);
    const kept = (await reclaimDead(loaded)).filter((row) => row.id !== id);
    return writeTable(sandboxes.path, kept);
  });
  if (!locked) return null;
  if (typeof locked === "string") return locked;
  return locked.error;
}
