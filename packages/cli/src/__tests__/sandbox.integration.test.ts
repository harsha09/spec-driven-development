import { spawnSync } from "node:child_process";
import { lstat, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

const temps: string[] = [];
const here = dirname(fileURLToPath(import.meta.url));
const sddBin = join(here, "../../dist/index.js");

function runSdd(
  cwd: string,
  args: string[],
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [sddBin, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR,
      USER: process.env.USER,
      LANG: process.env.LANG,
      CI: "1",
    },
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
}

beforeAll(async () => {
  await readFile(sddBin, "utf8");
});

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

describe("sdd sandbox", () => {
  it("opens, lists the status, and closes the worktree", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-sandbox-cli-"));
    temps.push(root);
    expect(runSdd(root, ["init", "--here", "--no-agent"]).status).toBe(0);
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "sdd-test@example.com"]);
    git(root, ["config", "user.name", "sdd test"]);
    git(root, ["config", "commit.gpgsign", "false"]);
    git(root, ["config", "core.fsmonitor", "false"]);
    await writeFile(join(root, "README.md"), "keep\n");
    git(root, ["add", "README.md"]);
    git(root, ["commit", "-m", "start"]);
    const created = runSdd(root, ["new", "Sandbox slice", "-w", "hotfix", "-y", "--no-agent"]);
    expect(created.status, created.stderr + created.stdout).toBe(0);
    const ids = (await readdir(join(root, "changes"), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    expect(ids).toHaveLength(1);
    const id = ids[0] ?? "";

    const help = runSdd(root, ["sandbox", "--help"]);
    expect(help.stdout).toContain("open");
    expect(help.stdout).toContain("list");
    expect(help.stdout).toContain("close");

    const opened = runSdd(root, ["sandbox", "open", "--change", id]);
    expect(opened.status, opened.stderr + opened.stdout).toBe(0);
    expect(opened.stdout).toBe(`Sandbox ${id} is ready.\n`);
    const listed = runSdd(root, ["sandbox", "list"]);
    expect(listed.status, listed.stderr + listed.stdout).toBe(0);
    expect(listed.stdout).toBe(`${id} ready\n`);
    expect((await lstat(join(root, ".git"))).isDirectory()).toBe(true);

    const closed = runSdd(root, ["sandbox", "close", id]);
    expect(closed.status, closed.stderr + closed.stdout).toBe(0);
    expect(closed.stdout).toBe(`Sandbox ${id} is closed.\n`);
    expect((await lstat(join(root, ".git"))).isDirectory()).toBe(true);
    expect(await readFile(join(root, "README.md"), "utf8")).toBe("keep\n");
    const empty = runSdd(root, ["sandbox", "list"]);
    expect(empty.stdout).toBe("No sandboxes.\n");

    const escaped = runSdd(root, ["sandbox", "open", "--change", "../outside"]);
    expect(escaped.status).toBe(1);
    expect(escaped.stdout).toContain("path separator");
    expect(await readFile(join(root, "README.md"), "utf8")).toBe("keep\n");
  });
});
