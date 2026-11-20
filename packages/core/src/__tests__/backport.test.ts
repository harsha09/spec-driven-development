import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertSafeGitRef,
  backportCompletionErrors,
  compareTwinPatches,
  parseTasksBackportHints,
  splitUnifiedDiff,
  tasksMissingTwinPr,
  twinBranchName,
  waiveTwin,
} from "../backport.js";
import type { ChangeMeta } from "../schemas.js";
import { ChangeMetaSchema } from "../schemas.js";

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

describe("assertSafeGitRef", () => {
  it("rejects flag-like refs", () => {
    expect(() => assertSafeGitRef("--upload-pack=evil")).toThrow(/Unsafe git ref/);
  });
});

describe("compareTwinPatches", () => {
  it("fails on an unlisted file difference", () => {
    const main = `diff --git a/src/a.ts b/src/a.ts
index 111..222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1 +1 @@
-old
+new
`;
    const twin = `diff --git a/src/a.ts b/src/a.ts
index 111..222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1 +1 @@
-old
+other
`;
    const result = compareTwinPatches(main, twin, new Set());
    expect(result.ok).toBe(false);
    expect(result.unlisted).toContain("src/a.ts");
  });

  it("passes when the only difference is an allowed path", () => {
    const main = `diff --git a/fixtures/base.txt b/fixtures/base.txt
index 111..222 100644
--- a/fixtures/base.txt
+++ b/fixtures/base.txt
@@ -1 +1 @@
-main
+main-line
`;
    const twin = `diff --git a/fixtures/base.txt b/fixtures/base.txt
index 111..222 100644
--- a/fixtures/base.txt
+++ b/fixtures/base.txt
@@ -1 +1 @@
-release
+release-line
`;
    const result = compareTwinPatches(main, twin, new Set(["fixtures/base.txt"]));
    expect(result.ok).toBe(true);
    expect(result.allowedDifferent).toContain("fixtures/base.txt");
  });
});

describe("splitUnifiedDiff", () => {
  it("indexes paths from unified diff headers", () => {
    const diff = `diff --git a/one.ts b/one.ts
--- a/one.ts
+++ b/one.ts
diff --git a/two.ts b/two.ts
--- a/two.ts
+++ b/two.ts
`;
    const map = splitUnifiedDiff(diff);
    expect([...map.keys()].sort()).toEqual(["one.ts", "two.ts"]);
  });
});

describe("tasks backport hints", () => {
  it("finds needs-backport tasks", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-backport-tasks-"));
    temps.push(root);
    await mkdir(root, { recursive: true });
    await writeFile(
      join(root, "tasks.md"),
      "- [ ] Patch handler needs-backport: release/1.0\n- [ ] Docs only main-only\n",
    );
    const hints = await parseTasksBackportHints(root);
    expect(hints.needsBackport).toHaveLength(1);
    expect(hints.needsBackport[0]!.target).toBe("release/1.0");
    expect(hints.mainOnly).toEqual([2]);
    const missing = tasksMissingTwinPr(meta(), hints.needsBackport);
    expect(missing).toHaveLength(1);
  });
});

describe("twin completion", () => {
  it("blocks complete until twins merge or waive", () => {
    expect(backportCompletionErrors(meta())).toEqual([
      "Backport twin for release/1.0 was never opened. Run: sdd backport open",
    ]);
    const opened = meta({
      backports: [
        {
          target: "release/1.0",
          branch: "fix/demo-twin-release-1.0",
          merged: false,
        },
      ],
    });
    expect(backportCompletionErrors(opened).length).toBe(1);
    const merged = meta({
      backports: [
        {
          target: "release/1.0",
          branch: "fix/demo-twin-release-1.0",
          merged: true,
        },
      ],
    });
    expect(backportCompletionErrors(merged)).toEqual([]);
    const waived = waiveTwin(
      meta({
        backports: [
          {
            target: "release/1.0",
            branch: "fix/demo-twin-release-1.0",
            merged: false,
          },
        ],
      }),
      "release/1.0",
      "not shipping this train",
    );
    expect(backportCompletionErrors(waived)).toEqual([]);
  });
});

describe("twinBranchName", () => {
  it("sanitizes slashes in release branch names", () => {
    expect(twinBranchName("fix/demo", "release/1.0.0")).toBe("fix/demo-twin-release-1.0.0");
  });
});
