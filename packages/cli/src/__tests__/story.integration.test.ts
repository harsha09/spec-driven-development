import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
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
  env: Record<string, string> = {},
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [sddBin, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      PATH: env.PATH ?? process.env.PATH,
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR,
      USER: process.env.USER,
      LANG: process.env.LANG,
      CI: "1",
      ...env,
    },
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(" ")} failed`);
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

async function repo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sdd-story-cli-"));
  temps.push(root);
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "sdd@example.com"]);
  git(root, ["config", "user.name", "sdd"]);
  await writeFile(join(root, "README.md"), "story\n");
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-m", "init"]);
  expect(runSdd(root, ["init", "--here", "--no-agent"]).status).toBe(0);
  return root;
}

describe("sdd epic stories", () => {
  it("blocks a second story id and branches only after a dependency is completed", async () => {
    const root = await repo();
    const first = runSdd(root, [
      "new",
      "Role handoff",
      "--epic",
      "issue-37",
      "--story",
      "S-001",
      "-w",
      "hotfix",
      "-y",
      "--no-agent",
    ]);
    expect(first.status, first.stderr).toBe(0);
    const again = runSdd(root, [
      "new",
      "Role handoff again",
      "--epic",
      "issue-37",
      "--story",
      "S-001",
      "-w",
      "hotfix",
      "-y",
      "--no-agent",
    ]);
    expect(again.status).toBe(1);
    expect(again.stdout.trim()).toBe("Story S-001 already exists.");

    const second = runSdd(root, [
      "new",
      "Connectors",
      "--epic",
      "issue-37",
      "--story",
      "S-002",
      "--depends",
      "S-001",
      "-w",
      "hotfix",
      "-y",
      "--no-agent",
    ]);
    expect(second.status, second.stderr).toBe(0);
    const graph = runSdd(root, ["graph", "--epic", "issue-37"]);
    expect(graph.status).toBe(0);
    expect(graph.stdout).toContain("Wave 1");
    expect(graph.stdout).toContain("Serial: S-002 after S-001");

    const changes = (await readdir(join(root, "changes"))).filter((name) => !name.startsWith("."));
    const connector = changes.find((name) => name.includes("connectors"));
    expect(connector).toBeTruthy();
    const blocked = runSdd(root, ["branch", "story/issue-37/S-002", "--change", connector ?? ""]);
    expect(blocked.status).toBe(1);
    expect(blocked.stdout.trim()).toBe("S-002 waits on S-001.");
    expect(gitHead(root)).toBe("main");
    expect(
      spawnSync("git", ["show-ref", "--verify", "--quiet", "refs/heads/story/issue-37/S-002"], {
        cwd: root,
        encoding: "utf8",
      }).status,
    ).not.toBe(0);

    await writeFile(join(root, "notes.txt"), "untracked\n");
    const handoff = changes.find((name) => name.includes("role-handoff"));
    expect(handoff).toBeTruthy();
    const branched = runSdd(root, ["branch", "story/issue-37/S-001", "--change", handoff ?? ""]);
    expect(branched.status, branched.stderr + branched.stdout).toBe(0);
    expect(gitHead(root)).toBe("story/issue-37/S-001");
    expect(await readFile(join(root, "notes.txt"), "utf8")).toBe("untracked\n");

    const third = runSdd(root, [
      "new",
      "Docs",
      "--epic",
      "issue-37",
      "--story",
      "S-003",
      "-w",
      "hotfix",
      "-y",
      "--no-agent",
    ]);
    expect(third.status, third.stderr).toBe(0);
    await writeFile(join(root, "README.md"), "dirty\n");
    const docs = (await readdir(join(root, "changes"))).find((name) => name.includes("docs"));
    const dirty = runSdd(root, ["branch", "story/issue-37/S-003", "--change", docs ?? ""]);
    expect(dirty.status).toBe(1);
    expect(dirty.stdout.trim()).toBe("Working tree has uncommitted changes.");
    expect(gitHead(root)).toBe("story/issue-37/S-001");
  });

  it("opens a pull request with a fake git and gh and omits Closes unless asked", async () => {
    const root = await repo();
    const created = runSdd(root, [
      "new",
      "Role handoff",
      "--epic",
      "issue-37",
      "--story",
      "S-001",
      "-w",
      "hotfix",
      "-y",
      "--no-agent",
    ]);
    expect(created.status, created.stderr).toBe(0);
    const changes = (await readdir(join(root, "changes"))).filter((name) => !name.startsWith("."));
    const id = changes[0] ?? "";
    const branched = runSdd(root, ["branch", "story/issue-37/S-001", "--change", id]);
    expect(branched.status, branched.stderr + branched.stdout).toBe(0);

    const bin = join(root, "fake-bin");
    await mkdir(bin);
    const bodyCopy = join(root, "pr-body.md");
    await writeFile(
      join(bin, "git"),
      `#!/bin/sh
if [ "$1" = "branch" ]; then echo story/issue-37/S-001; exit 0; fi
if [ "$1" = "push" ]; then exit 0; fi
echo "unexpected git $*" >&2
exit 1
`,
    );
    await writeFile(
      join(bin, "gh"),
      `#!/bin/sh
while [ $# -gt 0 ]; do
  if [ "$1" = "--body-file" ]; then
    shift
    cp "$1" "${bodyCopy}"
  fi
  shift
done
echo https://github.com/example/repo/pull/44
`,
    );
    await chmod(join(bin, "git"), 0o755);
    await chmod(join(bin, "gh"), 0o755);
    const opened = runSdd(root, ["pr", "--change", id], { PATH: `${bin}:${process.env.PATH}` });
    expect(opened.status, opened.stderr + opened.stdout).toBe(0);
    expect(opened.stdout.trim()).toBe("https://github.com/example/repo/pull/44");
    const body = await readFile(bodyCopy, "utf8");
    expect(body).not.toContain("Closes");
    const meta = await readFile(join(root, "changes", id, "meta.yaml"), "utf8");
    expect(meta).toContain("https://github.com/example/repo/pull/44");

    const extra = runSdd(root, [
      "new",
      "Docs",
      "--epic",
      "issue-37",
      "--story",
      "S-003",
      "-w",
      "hotfix",
      "-y",
      "--no-agent",
    ]);
    expect(extra.status, extra.stderr).toBe(0);
    const docs = (await readdir(join(root, "changes"))).find((name) => name.includes("docs"));
    expect(docs).toBeTruthy();
    const docsMeta = join(root, "changes", docs ?? "", "meta.yaml");
    await writeFile(docsMeta, `${await readFile(docsMeta, "utf8")}branch: story/issue-37/S-001\n`);
    const closed = runSdd(root, ["pr", "--change", docs ?? "", "--closes", "44"], {
      PATH: `${bin}:${process.env.PATH}`,
    });
    expect(closed.status, closed.stderr + closed.stdout).toBe(0);
    expect(await readFile(bodyCopy, "utf8")).toContain("Closes #44");
  });
});

function gitHead(cwd: string): string {
  const result = spawnSync("git", ["branch", "--show-current"], { cwd, encoding: "utf8" });
  return (result.stdout ?? "").trim();
}
