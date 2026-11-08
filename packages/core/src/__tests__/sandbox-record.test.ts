import { execFile, spawn } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import {
  type SandboxProfile,
  closeSandbox,
  createChange,
  initProject,
  listSandboxes,
  loadChangeMeta,
  loadConfig,
  openSandbox,
  pathExists,
  rejectWrite,
  saveChangeMeta,
} from "../index.js";

const exec = promisify(execFile);
const temps: string[] = [];

async function stopLeaseHolders(root: string): Promise<void> {
  try {
    const raw = await readFile(join(root, ".sdd", "sandboxes", "leases.json"), "utf8");
    const parsed = JSON.parse(raw) as { leases?: { pid?: number }[] };
    for (const row of parsed.leases ?? []) {
      if (!row.pid) continue;
      try {
        process.kill(row.pid, "SIGKILL");
      } catch {
        // The holder has already exited.
      }
    }
  } catch {
    // No lease table in this repo.
  }
}

function listenResult(port: number): Promise<"ok" | "busy"> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve("busy"));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve("ok"));
    });
  });
}

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (!dir) continue;
    await stopLeaseHolders(dir);
    await rm(dir, { recursive: true, force: true });
  }
});

async function git(cwd: string, args: string[]): Promise<string> {
  const result = await exec("git", args, { cwd });
  return result.stdout.trim();
}

async function writeWorkflow(root: string): Promise<void> {
  await writeFile(
    join(root, ".sdd", "workflows", "sandbox.yaml"),
    ["name: sandbox", "version: 1", "stages:", "  - id: intent", "    artifacts: []", ""].join(
      "\n",
    ),
  );
}

async function gitRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sdd-sandbox-"));
  temps.push(root);
  await initProject({ projectRoot: root, agents: false });
  await writeWorkflow(root);
  await git(root, ["init", "-b", "main"]);
  await git(root, ["config", "user.email", "sdd-test@example.com"]);
  await git(root, ["config", "user.name", "sdd test"]);
  await git(root, ["config", "commit.gpgsign", "false"]);
  await git(root, ["config", "core.fsmonitor", "false"]);
  await writeFile(join(root, "README.md"), "keep\n");
  await git(root, ["add", "README.md"]);
  await git(root, ["commit", "-m", "start"]);
  return root;
}

async function addChange(root: string, title: string): Promise<string> {
  const config = await loadConfig(root);
  const ctx = await createChange({
    projectRoot: root,
    config,
    title,
    workflowName: "sandbox",
  });
  return ctx.id;
}

function recordDir(root: string, id: string): string {
  return join(root, ".sdd", "sandboxes", id);
}

async function readRecord(
  root: string,
  id: string,
): Promise<{
  id: string;
  path: string;
  baseSha: string;
  branch: string;
  status: string;
}> {
  return JSON.parse(await readFile(join(recordDir(root, id), "record.json"), "utf8")) as {
    id: string;
    path: string;
    baseSha: string;
    branch: string;
    status: string;
  };
}

describe("sandbox record", { timeout: 30_000 }, () => {
  it("opens a worktree and record, lists the status, and closes only that sandbox", async () => {
    const root = await gitRepo();
    const head = await git(root, ["rev-parse", "HEAD"]);
    const id = await addChange(root, "Sandbox one");
    const other = await addChange(root, "Sandbox two");
    await writeFile(join(root, "keep.txt"), "keep\n");

    const opened = await openSandbox(root, id);
    expect(opened.exitCode).toBe(0);
    expect(opened.stdout).toBe(`Sandbox ${id} is ready.\n`);
    const record = await readRecord(root, id);
    expect(record).toMatchObject({
      id,
      path: `.sdd/sandboxes/${id}/worktree`,
      baseSha: head,
      branch: "main",
      status: "ready",
    });
    const worktree = join(root, ".sdd", "sandboxes", id, "worktree");
    expect(await readFile(join(worktree, "README.md"), "utf8")).toBe("keep\n");
    expect((await lstat(join(worktree, ".git"))).isFile()).toBe(true);
    expect(await git(worktree, ["rev-parse", "HEAD"])).toBe(head);
    expect((await git(root, ["worktree", "list"])).split("\n").filter(Boolean)).toHaveLength(2);

    const again = await openSandbox(root, id);
    expect(again.exitCode).toBe(0);
    expect(again.stdout).toBe(`Sandbox ${id} is ready.\n`);
    expect((await git(root, ["worktree", "list"])).split("\n").filter(Boolean)).toHaveLength(2);

    const second = await openSandbox(root, other);
    expect(second.exitCode).toBe(0);
    const listed = await listSandboxes(root);
    expect(listed.exitCode).toBe(0);
    expect(listed.stdout).toBe(`${id} ready devbox\n${other} ready devbox\n`);

    const closed = await closeSandbox(root, id);
    expect(closed.exitCode).toBe(0);
    expect(closed.stdout).toBe(`Sandbox ${id} is closed.\n`);
    expect(await pathExists(worktree)).toBe(false);
    expect(await pathExists(recordDir(root, id))).toBe(false);
    expect(await pathExists(join(recordDir(root, other), "worktree", "README.md"))).toBe(true);
    expect(await readFile(join(root, "keep.txt"), "utf8")).toBe("keep\n");
    expect(await readFile(join(root, "README.md"), "utf8")).toBe("keep\n");
    expect(await pathExists(join(root, "changes", id))).toBe(true);
    expect((await lstat(join(root, ".git"))).isDirectory()).toBe(true);
    expect(await git(root, ["rev-parse", "HEAD"])).toBe(head);
    expect(await git(root, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("main");
    expect((await git(root, ["worktree", "list"])).split("\n").filter(Boolean)).toHaveLength(2);

    const rest = await listSandboxes(root);
    expect(rest.stdout).toBe(`${other} ready devbox\n`);
    expect((await closeSandbox(root, other)).exitCode).toBe(0);
    expect((await listSandboxes(root)).stdout).toBe("No sandboxes.\n");
    expect(await git(root, ["rev-parse", "--show-toplevel"])).toBe(root);
  });

  it("resumes a crashed opening record and tells the person to close a stale one", async () => {
    const root = await gitRepo();
    const id = await addChange(root, "Crashed sandbox");
    expect((await openSandbox(root, id)).exitCode).toBe(0);
    const dir = recordDir(root, id);
    const record = await readRecord(root, id);
    await rm(join(dir, "worktree"), { recursive: true, force: true });
    await writeFile(
      join(dir, "record.json"),
      `${JSON.stringify({ ...record, status: "opening" }, null, 2)}\n`,
    );
    expect((await listSandboxes(root)).stdout).toBe(`${id} opening devbox\n`);

    const resumed = await openSandbox(root, id);
    expect(resumed.exitCode).toBe(0);
    expect(resumed.stdout).toBe(`Sandbox ${id} is ready.\n`);
    expect((await readRecord(root, id)).status).toBe("ready");
    expect(await git(join(dir, "worktree"), ["rev-parse", "HEAD"])).toBe(record.baseSha);
    expect((await git(root, ["worktree", "list"])).split("\n").filter(Boolean)).toHaveLength(2);

    await rm(join(dir, "worktree"), { recursive: true, force: true });
    const stale = await openSandbox(root, id);
    expect(stale.exitCode).toBe(1);
    expect(stale.stdout).toBe(`Sandbox ${id} is stale. Close it with sdd sandbox close ${id}.\n`);
    expect(await pathExists(join(dir, "worktree"))).toBe(false);
    expect((await listSandboxes(root)).stdout).toBe(`${id} ready devbox\n`);

    const closed = await closeSandbox(root, id);
    expect(closed.exitCode).toBe(0);
    expect(await pathExists(dir)).toBe(false);
    expect((await listSandboxes(root)).stdout).toBe("No sandboxes.\n");
    expect((await lstat(join(root, ".git"))).isDirectory()).toBe(true);
    expect(await readFile(join(root, "README.md"), "utf8")).toBe("keep\n");
  });

  it("rejects path-escape ids and does not follow a sandbox symlink", async () => {
    const root = await gitRepo();
    const outside = await mkdtemp(join(tmpdir(), "sdd-sandbox-out-"));
    temps.push(outside);
    await writeFile(join(outside, "sentinel.txt"), "stay\n");
    await writeFile(join(root, "keep.txt"), "keep\n");

    for (const id of ["../outside", "foo/bar", "..\\..\\keep.txt", "..", "."]) {
      expect((await openSandbox(root, id)).stdout, id).toContain("path separator");
      expect((await openSandbox(root, id)).exitCode, id).toBe(1);
      expect((await closeSandbox(root, id)).exitCode, id).toBe(1);
      expect((await closeSandbox(root, id)).stdout, id).toContain("path separator");
    }
    expect(await readFile(join(root, "keep.txt"), "utf8")).toBe("keep\n");
    expect(await readFile(join(outside, "sentinel.txt"), "utf8")).toBe("stay\n");
    expect(await pathExists(join(root, ".sdd", "sandboxes"))).toBe(false);

    await symlink(outside, join(root, ".sdd", "sandboxes"));
    const id = await addChange(root, "Linked sandbox");
    const opened = await openSandbox(root, id);
    expect(opened.exitCode).toBe(1);
    expect(opened.stdout).toContain("cannot leave the repository");
    expect(await readdir(outside)).toEqual(["sentinel.txt"]);
    expect((await lstat(join(root, ".git"))).isDirectory()).toBe(true);
  });

  it("closes a tampered record without deleting the main checkout or an outside path", async () => {
    const root = await gitRepo();
    const id = await addChange(root, "Tampered sandbox");
    expect((await openSandbox(root, id)).exitCode).toBe(0);
    const outside = await mkdtemp(join(tmpdir(), "sdd-sandbox-tamper-"));
    temps.push(outside);
    await writeFile(join(outside, "sentinel.txt"), "stay\n");
    const record = await readRecord(root, id);
    await writeFile(
      join(recordDir(root, id), "record.json"),
      `${JSON.stringify({ ...record, path: outside }, null, 2)}\n`,
    );
    await rm(join(recordDir(root, id), "worktree"), { recursive: true, force: true });
    await symlink(root, join(recordDir(root, id), "worktree"));

    const closed = await closeSandbox(root, id);
    expect(closed.exitCode).toBe(0);
    expect(await readFile(join(outside, "sentinel.txt"), "utf8")).toBe("stay\n");
    expect(await readFile(join(root, "README.md"), "utf8")).toBe("keep\n");
    expect(await pathExists(join(root, ".sdd", "config.yaml"))).toBe(true);
    expect((await lstat(join(root, ".git"))).isDirectory()).toBe(true);
    expect(await pathExists(recordDir(root, id))).toBe(false);
    expect(await git(root, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("main");
  });

  it("checks out the change branch without moving the main checkout", async () => {
    const root = await gitRepo();
    const mainHead = await git(root, ["rev-parse", "HEAD"]);
    await git(root, ["checkout", "-b", "topic"]);
    await writeFile(join(root, "topic.txt"), "topic\n");
    await git(root, ["add", "topic.txt"]);
    await git(root, ["commit", "-m", "topic"]);
    const topicHead = await git(root, ["rev-parse", "HEAD"]);
    await git(root, ["checkout", "main"]);
    const id = await addChange(root, "Branched sandbox");
    const config = await loadConfig(root);
    const meta = await loadChangeMeta(root, config, id);
    await saveChangeMeta(root, config, { ...meta, branch: "topic" });

    const opened = await openSandbox(root, id);
    expect(opened.exitCode).toBe(0);
    const record = await readRecord(root, id);
    expect(record.branch).toBe("topic");
    expect(record.baseSha).toBe(topicHead);
    const worktree = join(recordDir(root, id), "worktree");
    expect(await git(worktree, ["rev-parse", "HEAD"])).toBe(topicHead);
    expect(await git(worktree, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("HEAD");
    const porcelain = await git(root, ["worktree", "list", "--porcelain"]);
    expect(porcelain).toContain(`worktree ${worktree}`);
    expect(porcelain).toContain(`HEAD ${topicHead}`);
    expect(porcelain.split("\n")).toContain("detached");
    expect(await readFile(join(recordDir(root, id), "worktree", "topic.txt"), "utf8")).toBe(
      "topic\n",
    );
    expect(await git(root, ["rev-parse", "HEAD"])).toBe(mainHead);
    expect(await git(root, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("main");
    expect(await pathExists(join(root, "topic.txt"))).toBe(false);
  });

  it("gitignores .sdd/sandboxes and does not open without a change or a commit", async () => {
    const root = await gitRepo();
    const ignorePath = join(root, ".sdd", ".gitignore");
    expect(await readFile(ignorePath, "utf8")).toContain("sandboxes/\n");
    await writeFile(ignorePath, "handoff.md\n");
    const id = await addChange(root, "Ignored sandbox");
    expect((await openSandbox(root, id)).exitCode).toBe(0);
    const ignore = await readFile(ignorePath, "utf8");
    expect(ignore.startsWith("handoff.md\n")).toBe(true);
    expect(ignore).toContain("sandboxes/\n");
    const recordPath = `.sdd/sandboxes/${id}/record.json`;
    await git(root, ["check-ignore", "-q", recordPath]);
    expect(await git(root, ["status", "--short", "--", ".sdd/sandboxes"])).toBe("");

    const missing = await openSandbox(root, "missing-change");
    expect(missing.exitCode).toBe(1);
    expect(missing.stdout).toContain("Change not found: missing-change");

    const bare = await mkdtemp(join(tmpdir(), "sdd-sandbox-bare-"));
    temps.push(bare);
    await initProject({ projectRoot: bare, agents: false });
    await writeWorkflow(bare);
    const bareId = await addChange(bare, "No commit");
    const noHead = await openSandbox(bare, bareId);
    expect(noHead.exitCode).toBe(1);
    expect(noHead.stdout).toBe("Git HEAD is unavailable.\n");
    expect(await pathExists(join(bare, ".sdd", "sandboxes"))).toBe(false);
  });

  it("two concurrent opens never fail with EEXIST", async () => {
    const root = await gitRepo();
    const id = await addChange(root, "Mkdir race");
    const sandboxes = join(root, ".sdd", "sandboxes");
    for (let i = 0; i < 8; i++) {
      await rm(sandboxes, { recursive: true, force: true });
      const [first, second] = await Promise.all([openSandbox(root, id), openSandbox(root, id)]);
      expect(first.exitCode, `${i} ${first.stdout}`).toBe(0);
      expect(second.exitCode, `${i} ${second.stdout}`).toBe(0);
      expect(first.stdout).not.toContain("EEXIST");
      expect(second.stdout).not.toContain("EEXIST");
      expect((await lstat(sandboxes)).isSymbolicLink()).toBe(false);
      expect((await lstat(sandboxes)).isDirectory()).toBe(true);
      expect((await closeSandbox(root, id)).exitCode).toBe(0);
      await git(root, ["worktree", "prune"]);
    }
  }, 60_000);

  it("serializes two overlapping opens onto one worktree", async () => {
    const root = await gitRepo();
    const id = await addChange(root, "Overlapping sandbox");
    const [first, second] = await Promise.all([openSandbox(root, id), openSandbox(root, id)]);
    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);
    expect(first.stdout).toBe(`Sandbox ${id} is ready.\n`);
    expect(second.stdout).toBe(`Sandbox ${id} is ready.\n`);
    const porcelain = await git(root, ["worktree", "list", "--porcelain"]);
    const zeros = "0000000000000000000000000000000000000000";
    expect(porcelain).not.toContain(zeros);
    const paths = porcelain
      .split("\n")
      .filter(
        (line) => line.startsWith("worktree ") && line.includes(`.sdd/sandboxes/${id}/worktree`),
      );
    expect(paths).toHaveLength(1);
    expect((await readRecord(root, id)).status).toBe("ready");
  });

  it("refuses a dirty close unless force discards the edits", async () => {
    const root = await gitRepo();
    const id = await addChange(root, "Dirty sandbox");
    expect((await openSandbox(root, id)).exitCode).toBe(0);
    const worktree = join(recordDir(root, id), "worktree");
    await writeFile(join(worktree, "local.txt"), "edit\n");

    const refused = await closeSandbox(root, id);
    expect(refused.exitCode).toBe(1);
    expect(refused.stdout).toBe(
      `Sandbox ${id} has uncommitted changes. Pass --force to discard them.\n`,
    );
    expect(await readFile(join(worktree, "local.txt"), "utf8")).toBe("edit\n");
    expect(await pathExists(join(recordDir(root, id), "record.json"))).toBe(true);

    const forced = await closeSandbox(root, id, { force: true });
    expect(forced.exitCode).toBe(0);
    expect(forced.stdout).toBe(`Sandbox ${id} is closed. Local edits were discarded.\n`);
    expect(await pathExists(recordDir(root, id))).toBe(false);
    expect(await readFile(join(root, "README.md"), "utf8")).toBe("keep\n");
    expect((await lstat(join(root, ".git"))).isDirectory()).toBe(true);
  });

  it("reports a failed worktree remove and leaves the record", async () => {
    const root = await gitRepo();
    const id = await addChange(root, "Locked sandbox");
    expect((await openSandbox(root, id)).exitCode).toBe(0);
    const worktree = join(recordDir(root, id), "worktree");
    await git(root, ["worktree", "lock", worktree]);
    const closed = await closeSandbox(root, id);
    expect(closed.exitCode).toBe(1);
    expect(closed.stdout).toBe("The sandbox worktree could not be removed.\n");
    expect(await readFile(join(worktree, "README.md"), "utf8")).toBe("keep\n");
    expect(await pathExists(join(recordDir(root, id), "record.json"))).toBe(true);
    expect((await lstat(join(root, ".git"))).isDirectory()).toBe(true);
  });

  it("refuses a symlinked sandbox id and leaves the link in place", async () => {
    const root = await gitRepo();
    const id = await addChange(root, "Symlinked id");
    const outside = await mkdtemp(join(tmpdir(), "sdd-sandbox-id-"));
    temps.push(outside);
    await writeFile(join(outside, "sentinel.txt"), "stay\n");
    await mkdir(join(root, ".sdd", "sandboxes"), { recursive: true });
    const link = join(root, ".sdd", "sandboxes", id);
    await symlink(outside, link);

    const opened = await openSandbox(root, id);
    expect(opened.exitCode).toBe(1);
    expect(opened.stdout).toContain("cannot leave the repository");
    expect((await lstat(link)).isSymbolicLink()).toBe(true);
    expect(await readdir(outside)).toEqual(["sentinel.txt"]);

    const closed = await closeSandbox(root, id);
    expect(closed.exitCode).toBe(1);
    expect(closed.stdout).toContain("cannot leave the repository");
    expect((await lstat(link)).isSymbolicLink()).toBe(true);
    expect(await readFile(join(outside, "sentinel.txt"), "utf8")).toBe("stay\n");
    expect(await readFile(join(root, "README.md"), "utf8")).toBe("keep\n");
  });

  it("takes over a lock whose process has exited", async () => {
    const root = await gitRepo();
    const id = await addChange(root, "Stale lock");
    const child = spawn(process.execPath, ["-e", "process.exit(0)"]);
    const pid = child.pid;
    await new Promise<void>((resolve, reject) => {
      child.once("exit", () => resolve());
      child.once("error", reject);
    });
    expect(pid).toBeGreaterThan(0);
    await mkdir(join(root, ".sdd", "sandboxes"), { recursive: true });
    await writeFile(join(root, ".sdd", "sandboxes", `.lock-${id}`), `${pid}\n`);
    const opened = await openSandbox(root, id);
    expect(opened.exitCode).toBe(0);
    expect(opened.stdout).toBe(`Sandbox ${id} is ready.\n`);
    expect(await pathExists(join(root, ".sdd", "sandboxes", `.lock-${id}`))).toBe(false);
  });

  it("leases a different port and build slot to each sandbox and frees the port on close", async () => {
    const root = await gitRepo();
    const firstId = await addChange(root, "Lease one");
    const secondId = await addChange(root, "Lease two");
    const [first, second] = await Promise.all([
      openSandbox(root, firstId),
      openSandbox(root, secondId),
    ]);
    expect(first.exitCode, first.stdout).toBe(0);
    expect(second.exitCode, second.stdout).toBe(0);
    const a = JSON.parse(await readFile(join(recordDir(root, firstId), "record.json"), "utf8")) as {
      port: number;
      portEnd: number;
      buildSlot: number;
      buildDir: string;
      env: { PORT: string; CARGO_TARGET_DIR: string };
    };
    const b = JSON.parse(
      await readFile(join(recordDir(root, secondId), "record.json"), "utf8"),
    ) as typeof a;
    expect(a.port).not.toBe(b.port);
    expect(a.portEnd < b.port || b.portEnd < a.port).toBe(true);
    expect(a.buildSlot).not.toBe(b.buildSlot);
    expect(a.buildDir).toBe(`.sdd/sandboxes/${firstId}/build`);
    expect(b.buildDir).toBe(`.sdd/sandboxes/${secondId}/build`);
    expect(a.env.PORT).toBe(String(a.port));
    expect(b.env.PORT).toBe(String(b.port));
    expect(a.env.CARGO_TARGET_DIR).not.toBe(b.env.CARGO_TARGET_DIR);
    expect((await lstat(join(root, a.buildDir))).isDirectory()).toBe(true);
    expect((await lstat(join(root, b.buildDir))).isDirectory()).toBe(true);
    expect(await listenResult(a.port)).toBe("busy");
    expect(await listenResult(b.port)).toBe("busy");

    expect((await closeSandbox(root, firstId)).exitCode).toBe(0);
    expect(await listenResult(a.port)).toBe("ok");
    const thirdId = await addChange(root, "Lease three");
    expect((await openSandbox(root, thirdId)).exitCode).toBe(0);
    const third = JSON.parse(
      await readFile(join(recordDir(root, thirdId), "record.json"), "utf8"),
    ) as { port: number };
    expect(third.port).toBe(a.port);
    expect(await listenResult(b.port)).toBe("busy");
  });

  it("reclaims a lease whose holder pid has died", async () => {
    const root = await gitRepo();
    const crashedId = await addChange(root, "Crashed lease");
    const nextId = await addChange(root, "Reclaimed lease");
    expect((await openSandbox(root, crashedId)).exitCode).toBe(0);
    const crashed = JSON.parse(
      await readFile(join(recordDir(root, crashedId), "record.json"), "utf8"),
    ) as { port: number; leasePid: number };
    process.kill(crashed.leasePid, "SIGKILL");
    for (let i = 0; i < 50; i++) {
      try {
        process.kill(crashed.leasePid, 0);
        await new Promise((resolve) => setTimeout(resolve, 10));
      } catch {
        break;
      }
    }
    const table = JSON.parse(
      await readFile(join(root, ".sdd", "sandboxes", "leases.json"), "utf8"),
    ) as { leases: { id: string; port: number; pid: number }[] };
    expect(table.leases).toEqual([
      expect.objectContaining({ id: crashedId, port: crashed.port, pid: crashed.leasePid }),
    ]);

    expect((await openSandbox(root, nextId)).exitCode).toBe(0);
    const next = JSON.parse(
      await readFile(join(recordDir(root, nextId), "record.json"), "utf8"),
    ) as { port: number };
    expect(next.port).toBe(crashed.port);
    const after = JSON.parse(
      await readFile(join(root, ".sdd", "sandboxes", "leases.json"), "utf8"),
    ) as { leases: { id: string; port: number }[] };
    expect(after.leases.map((row) => row.port)).toEqual([crashed.port]);
    expect(after.leases.map((row) => row.id)).toEqual([nextId]);
  });

  it("records the isolation profile and lists it", async () => {
    const root = await gitRepo();
    const secret = "s3cret-value-profile";
    await writeFile(
      join(root, ".sdd", "sandbox.yaml"),
      [
        "profile: read-only",
        "env:",
        "  - PATH",
        "caches:",
        "  - npm",
        "network:",
        "  - registry.npmjs.org",
        "",
      ].join("\n"),
    );
    const id = await addChange(root, "Profiled sandbox");
    expect((await openSandbox(root, id)).exitCode).toBe(0);
    const raw = await readFile(join(recordDir(root, id), "record.json"), "utf8");
    expect(raw).not.toContain(secret);
    const record = JSON.parse(raw) as { profile: SandboxProfile };
    expect(record.profile).toEqual({
      name: "read-only",
      env: ["PATH"],
      caches: ["npm"],
      network: ["registry.npmjs.org"],
    });
    expect((await listSandboxes(root)).stdout).toBe(`${id} ready read-only\n`);
    expect(
      await rejectWrite(record.profile, join(recordDir(root, id), "worktree"), "src/app.ts"),
    ).toBe("A read-only sandbox cannot write src/app.ts.\n");
    expect((await openSandbox(root, id)).exitCode).toBe(0);
    const again = JSON.parse(await readFile(join(recordDir(root, id), "record.json"), "utf8")) as {
      profile: typeof record.profile;
    };
    expect(again.profile).toEqual(record.profile);
  });

  it("treats a record without a profile as devbox and resumes the worktree", async () => {
    const root = await gitRepo();
    const id = await addChange(root, "Legacy record");
    expect((await openSandbox(root, id)).exitCode).toBe(0);
    const file = join(recordDir(root, id), "record.json");
    const stored = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown> & {
      profile?: unknown;
    };
    const { profile: dropped, ...legacy } = stored;
    expect(dropped).toBeDefined();
    await writeFile(file, `${JSON.stringify(legacy, null, 2)}\n`);
    expect((await listSandboxes(root)).stdout).toBe(`${id} ready devbox\n`);
    const again = await openSandbox(root, id);
    expect(again.exitCode).toBe(0);
    expect(again.stdout).toBe(`Sandbox ${id} is ready.\n`);
    expect(await readFile(join(recordDir(root, id), "worktree", "README.md"), "utf8")).toBe(
      "keep\n",
    );
    const reread = JSON.parse(await readFile(file, "utf8")) as {
      profile: { name: string; env: string[]; caches: string[]; network: string[] };
    };
    expect(reread.profile).toEqual({
      name: "devbox",
      env: ["PATH"],
      caches: [],
      network: [],
    });
  });

  it("does not pass an unlisted env var to the port holder", async () => {
    const root = await gitRepo();
    const id = await addChange(root, "Holder env");
    const sentinel = "SDD_SENTINEL_SECRET";
    const previous = process.env[sentinel];
    process.env[sentinel] = "sentinel-secret-value";
    try {
      expect((await openSandbox(root, id)).exitCode).toBe(0);
      const record = JSON.parse(
        await readFile(join(recordDir(root, id), "record.json"), "utf8"),
      ) as {
        leasePid: number;
      };
      const environ = await readFile(`/proc/${record.leasePid}/environ`);
      const text = environ.toString("utf8");
      expect(text).not.toContain(sentinel);
      expect(text).not.toContain("sentinel-secret-value");
      expect(
        await listenResult(
          JSON.parse(await readFile(join(recordDir(root, id), "record.json"), "utf8")).port,
        ),
      ).toBe("busy");
    } finally {
      if (previous === undefined) delete process.env[sentinel];
      else process.env[sentinel] = previous;
    }
  });
});
