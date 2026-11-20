import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ChangeMetaSchema,
  backportCompletionErrors,
  type ChangeMeta,
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