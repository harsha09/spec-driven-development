/**
 * Search CLI against the built binary. The package test script builds core and cli first.
 */
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { countTokens } from "@structured-vibe-coding/core";
import { afterEach, describe, expect, it } from "vitest";

const temps: string[] = [];
const here = dirname(fileURLToPath(import.meta.url));
const sddBin = join(here, "../../dist/index.js");
const fixtureDir = join(here, "../../../core/src/__tests__/fixtures/search-s1");
const NEST_ONLY = new Set(["packages/secret-nest/hidden.ts", "packages/secret-nest/shown.ts"]);

function runSdd(cwd: string, args: string[]) {
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

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function copyCorpus(root: string): Promise<void> {
  async function walk(dir: string, rel: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      const from = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(from, child);
        continue;
      }
      if (NEST_ONLY.has(child)) continue;
      const { mkdir, cp } = await import("node:fs/promises");
      const dest = join(root, child);
      await mkdir(dirname(dest), { recursive: true });
      await cp(from, dest);
    }
  }
  await walk(fixtureDir, "");
}

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sdd-cli-search-"));
  temps.push(root);
  const init = runSdd(root, ["init", "--here", "--no-agent"]);
  expect(init.status, init.stderr + init.stdout).toBe(0);
  await copyCorpus(root);
  return root;
}

describe("sdd search", () => {
  it("prints the pinned budget-120 stdout and does not write a handoff", async () => {
    const root = await project();
    const result = runSdd(root, ["search", "function", "--scope", "code", "--budget", "120"]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("`src/budget.ts` · `alphaWidget`");
    expect(result.stdout).toContain("`src/other.ts` · `betaWidget`");
    expect(result.stdout).toContain("return x.trim()");
    expect(countTokens(result.stdout)).toBe(108);
    expect(result.stdout).not.toContain(root);
    await expect(readFile(join(root, ".sdd/handoff.md"), "utf8")).rejects.toThrow();
  });

  it("rejects a missing query, a bad scope, and a bad budget", async () => {
    const root = await project();
    const missing = runSdd(root, ["search", "--scope", "code"]);
    expect(missing.status).toBe(1);
    expect(missing.stderr.trim()).toBe("Search query is required.");
    expect(missing.stderr).not.toContain(root);

    const scope = runSdd(root, ["search", "function", "--scope", "no"]);
    expect(scope.status).toBe(1);
    expect(scope.stderr.trim()).toBe("Search scope must be code, specs, or memory.");

    const budget = runSdd(root, ["search", "function", "--scope", "code", "--budget", "0"]);
    expect(budget.status).toBe(1);
    expect(budget.stderr.trim()).toBe("Budget must be a positive integer.");

    const fraction = runSdd(root, ["search", "function", "--scope", "code", "--budget", "1.5"]);
    expect(fraction.status).toBe(1);
    expect(fraction.stderr.trim()).toBe("Budget must be a positive integer.");
  });

  it("prints search.yaml is invalid and falls back when the provider name is unknown", async () => {
    const root = await project();
    const yamlPath = join(root, ".sdd/search.yaml");
    const original = await readFile(yamlPath, "utf8");
    await writeFile(yamlPath, original.replace("k: 20", "k: 0"));
    const invalid = runSdd(root, ["search", "function", "--scope", "code", "--budget", "120"]);
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toContain("search.yaml is invalid");
    expect(invalid.stderr).not.toContain(root);
    expect(invalid.stdout).toBe("");

    await writeFile(yamlPath, original.replace("provider: builtin", "provider: does-not-exist"));
    const fallback = runSdd(root, ["search", "function", "--scope", "code", "--budget", "120"]);
    expect(fallback.status, fallback.stderr).toBe(0);
    expect(fallback.stderr).toContain(
      'Search provider "does-not-exist" is unavailable. Using built-in keyword search.',
    );
    expect(countTokens(fallback.stdout)).toBe(108);
    expect(fallback.stdout).not.toContain(root);
  });
});
