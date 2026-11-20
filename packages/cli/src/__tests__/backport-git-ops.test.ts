import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type ChangeMeta,
  ChangeMetaSchema,
  backportCompletionErrors,
} from "@structured-vibe-coding/core";
import { afterEach, describe, expect, it } from "vitest";
import { checkTwinParity, openBackportTwin } from "../backport-git-ops.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) {
      const { rm } = await import("node:fs/promises");
      await rm(dir, { recursive: true, force: true });
    }
  }
});

function meta(overrides: Partial<ChangeMeta> = {}): ChangeMeta {
  return ChangeMetaSchema.parse({
    id: "demo-fix",
    title: "Demo fix",
    workflow: "hotfix",
    created: "2026-01-01T00:00:00.000Z",
    stage: "tasks",
    branch: "fix/demo",
    backport_targets: ["release/1.0"],
    ...overrides,
  });
}

function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || args.join(" "));
  }
}

function gitOut(cwd: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || args.join(" "));
  }
  return result.stdout.trim();
}

async function repo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sdd-backport-range-"));
  temps.push(root);
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "sdd@example.com"]);
  git(root, ["config", "user.name", "sdd"]);
  await writeFile(join(root, "README.md"), "base\n");
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-m", "init"]);
  git(root, ["branch", "release/1.0"]);
  return root;
}

async function commitFile(root: string, name: string, message: string): Promise<void> {
  await writeFile(join(root, name), `${name}\n`);
  git(root, ["add", name]);
  git(root, ["commit", "-m", message]);
}

describe("openBackportTwin with main ahead of the release branch", () => {
  it("cherry-picks only the change commits, with -x, and parity compares the same patch", async () => {
    const root = await repo();
    await commitFile(root, "m1.txt", "main one");
    await commitFile(root, "m2.txt", "main two");
    git(root, ["switch", "-c", "fix/demo"]);
    await commitFile(root, "fix.txt", "fix");
    const fixSha = gitOut(root, ["rev-parse", "HEAD"]);

    const opened = await openBackportTwin({
      projectRoot: root,
      meta: meta(),
      target: "release/1.0",
      dryPr: true,
    });
    expect(opened.commitsCherryPicked).toBe(1);
    expect(gitOut(root, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("fix/demo");
    expect(gitOut(root, ["ls-tree", "-r", "--name-only", opened.branch]).split("\n")).toEqual([
      "README.md",
      "fix.txt",
    ]);
    expect(gitOut(root, ["log", "-1", "--format=%B", opened.branch])).toContain(
      `(cherry picked from commit ${fixSha})`,
    );
    expect(opened.meta.backports?.[0]?.base_ref).toBe("main");
    expect(opened.meta.backports?.[0]?.head_sha).toBe(gitOut(root, ["rev-parse", opened.branch]));

    const { result } = await checkTwinParity(root, opened.meta, "release/1.0");
    expect(result.ok).toBe(true);
    expect(result.onlyMain).toEqual([]);
    expect(result.onlyTwin).toEqual([]);
  }, 20_000);

  it("skips merge commits and commits already on the base branch after main is merged in", async () => {
    const root = await repo();
    git(root, ["switch", "-c", "fix/demo"]);
    await commitFile(root, "fix.txt", "fix");
    git(root, ["switch", "main"]);
    await commitFile(root, "m1.txt", "main one");
    git(root, ["switch", "fix/demo"]);
    git(root, ["merge", "--no-ff", "main", "-m", "merge main into fix"]);
    await commitFile(root, "fix2.txt", "fix two");

    const opened = await openBackportTwin({
      projectRoot: root,
      meta: meta(),
      target: "release/1.0",
      dryPr: true,
    });
    expect(opened.commitsCherryPicked).toBe(2);
    expect(gitOut(root, ["ls-tree", "-r", "--name-only", opened.branch]).split("\n")).toEqual([
      "README.md",
      "fix.txt",
      "fix2.txt",
    ]);
    const { result } = await checkTwinParity(root, opened.meta, "release/1.0");
    expect(result.ok).toBe(true);
  }, 20_000);

  it("takes an explicit base and refuses an empty range without creating a branch", async () => {
    const root = await repo();
    git(root, ["switch", "-c", "fix/demo"]);
    await expect(
      openBackportTwin({
        projectRoot: root,
        meta: meta(),
        target: "release/1.0",
        dryPr: true,
        base: "main",
      }),
    ).rejects.toThrow(/Nothing to backport/);
    expect(gitOut(root, ["branch", "--list", "fix/demo-twin-*"])).toBe("");
    await expect(
      openBackportTwin({
        projectRoot: root,
        meta: meta(),
        target: "release/1.0",
        dryPr: true,
        base: "no-such-branch",
      }),
    ).rejects.toThrow(/Base ref no-such-branch was not found/);
  }, 20_000);

  it("removes the twin branch when a cherry-pick conflicts", async () => {
    const root = await repo();
    git(root, ["switch", "release/1.0"]);
    await writeFile(join(root, "README.md"), "release edit\n");
    git(root, ["commit", "-am", "release edit"]);
    git(root, ["switch", "main"]);
    git(root, ["switch", "-c", "fix/demo"]);
    await writeFile(join(root, "README.md"), "fix edit\n");
    git(root, ["commit", "-am", "fix"]);
    await expect(
      openBackportTwin({ projectRoot: root, meta: meta(), target: "release/1.0", dryPr: true }),
    ).rejects.toThrow();
    expect(gitOut(root, ["branch", "--list", "fix/demo-twin-*"])).toBe("");
    expect(gitOut(root, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("fix/demo");
  }, 20_000);
});

describe("openBackportTwin", () => {
  it("cherry-picks main commits without rebase and checks parity", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-backport-git-ops-"));
    temps.push(root);
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "sdd@example.com"]);
    git(root, ["config", "user.name", "sdd"]);
    await writeFile(join(root, "README.md"), "main\n");
    git(root, ["add", "README.md"]);
    git(root, ["commit", "-m", "init"]);
    git(root, ["branch", "release/1.0"]);
    git(root, ["switch", "-c", "fix/demo"]);
    await writeFile(join(root, "README.md"), "fixed\n");
    git(root, ["add", "README.md"]);
    git(root, ["commit", "-m", "fix"]);
    git(root, ["switch", "fix/demo"]);

    const opened = await openBackportTwin({
      projectRoot: root,
      meta: meta(),
      target: "release/1.0",
      dryPr: true,
    });
    expect(opened.commitsCherryPicked).toBe(1);
    expect(opened.branch).toBe("fix/demo-twin-release-1.0");

    const { result } = await checkTwinParity(root, opened.meta, "release/1.0");
    expect(result.ok).toBe(true);

    git(root, ["switch", "release/1.0"]);
    git(root, ["merge", "--no-ff", opened.branch, "-m", "merge twin"]);
    opened.meta.backports![0]!.merged = true;
    expect(backportCompletionErrors(opened.meta)).toEqual([]);
  }, 20_000);
});
