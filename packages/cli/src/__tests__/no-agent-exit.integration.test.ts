/**
 * --no-agent must exit after the change is saved. A full index walks and parses
 * every source file, so a repository of this size used to stay at high CPU well
 * past the limit below.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

const SOURCE_FILES = 10_000;
const EXIT_MS = 5_000;
const temps: string[] = [];
const here = dirname(fileURLToPath(import.meta.url));
const sddBin = join(here, "../../dist/index.js");

const FEATURE = [
  "# Feature",
  "",
  "The list page throws when the catalog has zero rows.",
  "Show an empty state instead of throwing, and keep the rest of the page usable.",
  "Success: open the page with no rows and see the empty state, with no error.",
  "",
].join("\n");

function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  expect(result.status, result.stderr || result.stdout).toBe(0);
}

function runSdd(
  cwd: string,
  args: string[],
): { status: number | null; stdout: string; stderr: string; signal: NodeJS.Signals | null } {
  const result = spawnSync(process.execPath, [sddBin, ...args], {
    cwd,
    encoding: "utf8",
    timeout: EXIT_MS,
    killSignal: "SIGKILL",
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR,
      USER: process.env.USER,
      LANG: process.env.LANG,
      CI: "1",
    },
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    signal: result.signal,
  };
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

describe("--no-agent exits after the change is saved (#191)", () => {
  it("sdd new, next, and skip exit within a few seconds on a large tree", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-no-agent-exit-"));
    temps.push(root);
    git(root, ["init"]);
    git(root, ["config", "user.email", "dev@example.com"]);
    git(root, ["config", "user.name", "Dev"]);
    for (let i = 0; i < SOURCE_FILES; i += 1) {
      const dir = join(root, "src", `p${Math.floor(i / 100)}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, `f${i}.ts`),
        `export function f${i}(n: number): number {\n  return n + ${i};\n}\n`,
      );
    }
    git(root, ["add", "src"]);
    git(root, ["commit", "-m", "sources"]);

    const init = runSdd(root, ["init", "--here", "--no-agent"]);
    expect(init.status, init.stderr + init.stdout).toBe(0);

    const created = runSdd(root, ["new", "Large tree", "-w", "feature", "-y", "--no-agent"]);
    const createdOut = created.stderr + created.stdout;
    expect(created.status, `${created.signal ?? ""} ${createdOut}`).toBe(0);
    expect(createdOut).toMatch(/Created change/);
    expect(await readFile(join(root, ".sdd/handoff.md"), "utf8")).toContain("Large tree");

    const ids = (await readdir(join(root, "changes"))).filter((name) => !name.startsWith("."));
    expect(ids).toHaveLength(1);
    await writeFile(join(root, "changes", ids[0]!, "feature.md"), FEATURE);

    const next = runSdd(root, ["next", "--no-agent"]);
    const nextOut = next.stderr + next.stdout;
    expect(next.status, `${next.signal ?? ""} ${nextOut}`).toBe(0);
    expect(nextOut).toMatch(/intent → clarify_intent/);

    const skipped = runSdd(root, ["skip", "clarify_intent", "-r", "scope is clear", "--no-agent"]);
    const skippedOut = skipped.stderr + skipped.stdout;
    expect(skipped.status, `${skipped.signal ?? ""} ${skippedOut}`).toBe(0);
    expect(skippedOut).toMatch(/Skipped stage clarify_intent/);
  });
});
