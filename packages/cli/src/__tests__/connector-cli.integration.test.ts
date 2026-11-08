import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { access, chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

const temps: string[] = [];
const here = dirname(fileURLToPath(import.meta.url));
const sddBin = join(here, "../../dist/index.js");

async function exists(p: string): Promise<boolean> {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function runSdd(
  cwd: string,
  args: string[],
  env: Record<string, string> = {},
): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [sddBin, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 15000,
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
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

async function treeContains(dir: string, needle: string): Promise<string | null> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = await treeContains(path, needle);
      if (found) return found;
      continue;
    }
    if (!entry.isFile()) continue;
    const text = await readFile(path, "utf8");
    if (text.includes(needle)) return path;
  }
  return null;
}

beforeAll(async () => {
  if (!(await exists(sddBin))) {
    throw new Error(
      `CLI dist missing at ${sddBin}. Run: pnpm --filter @structured-vibe-coding/cli build`,
    );
  }
});

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

describe("sdd role connector", () => {
  it("refuses X and does not run another action", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-connector-cli-"));
    temps.push(root);
    expect(runSdd(root, ["init", "--here", "--no-agent"]).status).toBe(0);
    const refused = runSdd(root, ["role", "connector", "read", "x", "1"]);
    expect(refused.status).toBe(1);
    expect(refused.stdout.trim()).toBe("A connector cannot read or post on X.");
    const comment = runSdd(root, ["role", "connector", "comment", "github-issue", "37"]);
    expect(comment.status).toBe(1);
    expect(comment.stdout.trim()).toBe("That connector action does not run in this slice.");
    const other = runSdd(root, ["role", "connector", "read", "jira", "PROJ-1"]);
    expect(other.status).toBe(1);
    expect(other.stdout.trim()).toBe("Jira record PROJ-1 could not be read.");
    expect(other.stdout).not.toContain("title");
    const draft = runSdd(root, ["role", "connector", "draft", "slack", "The reading is ready"]);
    expect(draft.status).toBe(0);
    expect(draft.stdout.trim()).toBe("slack\nThe reading is ready\nnot sent");
    const post = runSdd(root, ["role", "connector", "post", "teams", "The reading is ready"]);
    expect(post.status).toBe(1);
    expect(post.stdout.trim()).toBe("That connector action does not run in this slice.");
  });

  it("prints one Actions run and does not run merge, deploy, or promote", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-actions-cli-"));
    temps.push(root);
    expect(runSdd(root, ["init", "--here", "--no-agent"]).status).toBe(0);
    const bin = join(root, "fake-bin");
    await mkdir(bin);
    const calls = join(root, "gh-calls.log");
    const token = "sdd-actions-token-do-not-print";
    await writeFile(
      join(bin, "gh"),
      `#!/bin/sh
printf '%s\\n' "$*" >> "${calls}"
id="$3"
if [ "$1" = "run" ] && [ "$2" = "view" ]; then
  if [ "$id" = "42" ]; then
    printf '%s\\n' '{"databaseId":42,"status":"completed","conclusion":"failure"}'
    exit 0
  fi
  if [ "$id" = "99" ]; then
    echo "run 99 not found" >&2
    exit 1
  fi
  if [ "$id" = "7" ]; then
    echo "token $GH_TOKEN" >&2
    exit 1
  fi
fi
echo "unexpected gh $*" >&2
exit 1
`,
    );
    await chmod(join(bin, "gh"), 0o755);
    const env = { PATH: `${bin}:${process.env.PATH ?? ""}`, GH_TOKEN: token, GITHUB_TOKEN: token };
    const failed = runSdd(root, ["role", "connector", "read", "github-actions", "42"], env);
    expect(failed.status, failed.stderr).toBe(0);
    expect(failed.stdout.trim()).toBe("42\ncompleted\nfailure");
    const missing = runSdd(root, ["role", "connector", "read", "github-actions", "99"], env);
    expect(missing.status).toBe(1);
    expect(missing.stdout.trim()).toBe("GitHub Actions run 99 was not found.");
    expect(missing.stdout.toLowerCase()).not.toContain("success");
    expect(missing.stderr.toLowerCase()).not.toContain("success");
    const unread = runSdd(root, ["role", "connector", "read", "github-actions", "7"], env);
    expect(unread.status).toBe(1);
    expect(unread.stdout.trim()).toBe("GitHub Actions run 7 could not be read.");
    expect(unread.stdout).not.toContain(token);
    expect(unread.stderr).not.toContain(token);
    const before = (await readFile(calls, "utf8")).trim().split("\n").length;
    for (const verb of ["merge", "deploy", "promote"]) {
      const stopped = runSdd(root, ["role", "connector", verb, "github-actions", "42"], env);
      expect(stopped.status).toBe(1);
      expect(stopped.stdout.trim()).toBe("That connector action does not run in this slice.");
      expect(stopped.stdout).not.toContain(token);
      expect(stopped.stderr).not.toContain(token);
    }
    expect((await readFile(calls, "utf8")).trim().split("\n").length).toBe(before);
    expect(await treeContains(root, token)).toBeNull();
  });
});
