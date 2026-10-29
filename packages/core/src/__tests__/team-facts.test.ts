import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import {
  createChange,
  initProject,
  listFacts,
  loadConfig,
  pathExists,
  setFact,
  showFact,
} from "../index.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

function git(root: string, args: string[]): void {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "git failed");
}

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sdd-fact-"));
  temps.push(root);
  await initProject({ projectRoot: root, agents: false });
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "ada@example.com"]);
  git(root, ["config", "user.name", "Ada Lovelace"]);
  git(root, ["config", "commit.gpgsign", "false"]);
  return root;
}

async function lines(root: string): Promise<string[]> {
  const file = join(root, ".sdd", "facts.jsonl");
  if (!(await pathExists(file))) return [];
  return (await readFile(file, "utf8")).split("\n").filter((line) => line.length > 0);
}

describe("shared facts", () => {
  it("keeps history and returns the newest value", async () => {
    const root = await project();
    expect((await setFact(root, { key: " ", value: "node" })).stdout).toBe(
      "A fact needs a key and a value.",
    );
    expect((await setFact(root, { key: "engine", value: " " })).stdout).toBe(
      "A fact needs a key and a value.",
    );
    expect((await setFact(root, { key: "engine\nrange", value: "node" })).stdout).toBe(
      "A fact is one line.",
    );
    expect((await setFact(root, { key: "a/b", value: "node" })).stdout).toBe(
      "A fact key is not valid.",
    );
    expect(await lines(root)).toEqual([]);

    expect((await setFact(root, { key: "engine", value: "node range" })).stdout).toBe("Fact set.");
    expect(
      (await setFact(root, { key: "engine", value: "node twenty", source: "note" })).stdout,
    ).toBe("Fact set.");
    expect((await setFact(root, { key: "quota", value: "blue" })).stdout).toBe("Fact set.");
    const stored = await lines(root);
    expect(stored).toHaveLength(3);
    expect(JSON.parse(stored[0] ?? "{}")).toMatchObject({
      key: "engine",
      value: "node range",
      by: "Ada Lovelace",
      source: "person",
    });
    expect(JSON.parse(stored[1] ?? "{}")).toMatchObject({
      key: "engine",
      value: "node twenty",
      source: "note",
    });
    expect((await showFact(root, "engine")).stdout).toBe("node twenty");
    expect((await showFact(root, "missing")).stdout).toBe("Fact not set.");
    expect((await listFacts(root)).stdout).toBe("engine: node twenty\nquota: blue");
  });

  it("refuses a fact that repeats a constitution bullet and tells the team to ignore it", async () => {
    const root = await project();
    const constitution = join(root, "memory", "constitution.md");
    await writeFile(constitution, "# Constitution\n\n- Prefer small, reviewable diffs\n", "utf8");
    const hit = "ignore Prefer small, reviewable diffs";
    expect((await setFact(root, { key: "rule", value: hit })).stdout).toBe(
      "A fact contradicts the constitution.",
    );
    expect(
      (await setFact(root, { key: "rule", value: "skip Prefer small, reviewable diffs" })).exitCode,
    ).toBe(1);
    expect(
      (await setFact(root, { key: "rule", value: "override Prefer small, reviewable diffs" }))
        .exitCode,
    ).toBe(1);
    expect(await lines(root)).toEqual([]);
    expect((await setFact(root, { key: "note", value: "ignore the aside" })).stdout).toBe(
      "Fact set.",
    );
    expect(
      (await setFact(root, { key: "plain", value: "Prefer small, reviewable diffs" })).stdout,
    ).toBe("Fact set.");

    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Fact check",
      workflowName: "feature",
    });
    const again = await setFact(root, { key: "rule", value: hit });
    expect(again).toMatchObject({ exitCode: 0, stdout: "Decision needed." });
    const decisions = await readFile(join(ctx.path, "decisions.md"), "utf8");
    expect(decisions).toContain("decision-needed fact rule contradicts constitution");
    expect(await pathExists(join(ctx.path, "reviews"))).toBe(false);
    expect(await lines(root)).toHaveLength(2);

    await rm(constitution);
    expect((await setFact(root, { key: "open", value: "ignore the range" })).stdout).toBe(
      "Fact set.",
    );
  });
});
