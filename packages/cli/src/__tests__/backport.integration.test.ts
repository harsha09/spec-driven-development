import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(" ")}`);
  }
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

async function patchMeta(
  metaPath: string,
  patch: { backport_targets?: string[]; branch?: string },
): Promise<void> {
  const lines = (await readFile(metaPath, "utf8")).split(/\r?\n/);
  if (patch.backport_targets) {
    const start = lines.findIndex((line) => line.startsWith("backport_targets:"));
    const block = ["backport_targets:", ...patch.backport_targets.map((target) => `  - ${target}`)];
    if (start >= 0) {
      let end = start + 1;
      while (end < lines.length && lines[end]!.startsWith("  - ")) end += 1;
      lines.splice(start, end - start, ...block);
    } else {
      lines.push(...block);
    }
  }
  if (patch.branch) {
    const idx = lines.findIndex((line) => line.startsWith("branch:"));
    const branchLine = `branch: ${patch.branch}`;
    if (idx >= 0) lines[idx] = branchLine;
    else lines.push(branchLine);
  }
  const text = lines.join("\n");
  await writeFile(metaPath, text.endsWith("\n") ? text : `${text}\n`);
}

async function repo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sdd-backport-cli-"));
  temps.push(root);
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "sdd@example.com"]);
  git(root, ["config", "user.name", "sdd"]);
  await writeFile(join(root, "README.md"), "main\n");
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-m", "init"]);
  expect(runSdd(root, ["init", "--here", "--no-agent"]).status).toBe(0);
  git(root, ["branch", "release/1.0"]);
  return root;
}

describe("sdd backport", () => {
  it("shows twin state in status and enforces check", async () => {
    const root = await repo();
    const created = runSdd(root, ["new", "Hotfix widget", "-w", "hotfix", "-y", "--no-agent"]);
    expect(created.status, created.stderr).toBe(0);
    const changeDirs = (await import("node:fs/promises")).readdir(join(root, "changes"));
    const changeId = (await changeDirs).find((name) => name.includes("hotfix"))!;
    const metaPath = join(root, "changes", changeId, "meta.yaml");
    await patchMeta(metaPath, { backport_targets: ["release/1.0"] });
    await writeFile(
      join(root, "changes", changeId, "tasks.md"),
      "- [ ] Ship fix needs-backport: release/1.0\n",
    );

    git(root, ["switch", "-c", "fix/widget"]);
    await writeFile(join(root, "README.md"), "fixed\n");
    git(root, ["add", "README.md"]);
    git(root, ["commit", "-m", "fix"]);

    await patchMeta(metaPath, { branch: "fix/widget" });

    const plan = runSdd(root, ["check", "-c", changeId]);
    expect(plan.status, plan.stderr).toBe(1);
    expect(plan.stdout + plan.stderr).toContain("Tasks needing a twin PR");

    const opened = runSdd(root, ["backport", "open", "-c", changeId, "--dry-pr"]);
    expect(opened.status, opened.stderr + opened.stdout).toBe(0);

    const status = runSdd(root, ["status", "-c", changeId]);
    const statusOut = status.stderr + status.stdout;
    expect(status.status, statusOut).toBe(0);
    expect(statusOut).toContain("Backport twins");
    expect(statusOut).toContain("release/1.0");

    const parity = runSdd(root, ["backport", "check", "-c", changeId]);
    const parityOut = parity.stderr + parity.stdout;
    expect(parity.status, parityOut).toBe(0);
    expect(parityOut).toContain("parity ok");
  });
});
