import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import {
  addDecision,
  checkDecisionReferences,
  initProject,
  listDecisions,
  loadDecisionRecord,
  pathExists,
  resolveDecisionRefsInText,
  runDecisionCheck,
  showDecision,
  showDecisionResolved,
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
  const root = await mkdtemp(join(tmpdir(), "sdd-decision-"));
  temps.push(root);
  await initProject({ projectRoot: root, agents: false });
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "dev@example.com"]);
  git(root, ["config", "user.name", "Example Dev"]);
  git(root, ["config", "commit.gpgsign", "false"]);
  return root;
}

describe("decision records", () => {
  it("records a ruling and loads it from disk", async () => {
    const root = await project();
    expect(
      (await addDecision(root, { id: "block-on-limit", rule: "Always block when over the limit." }))
        .stdout,
    ).toBe("Decision block-on-limit recorded.");
    const file = join(root, ".sdd", "decisions", "block-on-limit.yaml");
    expect(await pathExists(file)).toBe(true);
    const record = await loadDecisionRecord(root, "block-on-limit");
    expect(record?.rule).toBe("Always block when over the limit.");
    expect((await showDecision(root, "block-on-limit")).stdout).toContain("block-on-limit");
  });

  it("supersedes a decision and keeps history on the old record", async () => {
    const root = await project();
    await addDecision(root, { id: "fallback", rule: "Allow fallback once." });
    expect(
      (
        await addDecision(root, {
          id: "fallback-v2",
          rule: "Allow fallback only under the daily cap.",
          supersedes: "fallback",
          why: "Cap clarified in review",
        })
      ).stdout,
    ).toBe("Decision fallback-v2 recorded.");

    const old = await loadDecisionRecord(root, "fallback");
    expect(old?.superseded_by).toBe("fallback-v2");
    expect(old?.history).toHaveLength(1);
    expect(old?.history[0]?.from_rule).toBe("Allow fallback once.");
    expect(old?.history[0]?.to_rule).toBe("Allow fallback only under the daily cap.");

    const shown = (await showDecision(root, "fallback")).stdout;
    expect(shown).toContain("superseded_by: fallback-v2");
    expect(shown).toContain("Replacement (fallback-v2):");
    expect(shown).toContain("daily cap");
  });

  it("resolves decision-ref lines in a spec file for show", async () => {
    const root = await project();
    await addDecision(root, { id: "no-double", rule: "Reject duplicate keys." });
    const rel = "changes/demo/feature.md";
    await mkdir(join(root, "changes", "demo"), { recursive: true });
    await writeFile(join(root, rel), "# Feature\n\n- decision-ref: no-double\n", "utf8");
    const out = (await showDecisionResolved(root, rel)).stdout;
    expect(out).toContain("Linked decisions");
    expect(out).toContain("[no-double] Reject duplicate keys.");
  });

  it("warns on unknown decision-ref ids in check", async () => {
    const root = await project();
    await addDecision(root, { id: "known", rule: "One rule." });
    const rel = "changes/demo/acceptance.md";
    await mkdir(join(root, "changes", "demo"), { recursive: true });
    await writeFile(join(root, rel), "- decision-ref: missing-id\n", "utf8");
    const check = await checkDecisionReferences(root, {
      memory_path: "memory",
      changes_path: "changes",
      domains_path: "domains",
    });
    expect(check.unknownRefs).toEqual([{ file: rel, id: "missing-id" }]);
    expect(
      (
        await runDecisionCheck(root, {
          memory_path: "memory",
          changes_path: "changes",
          domains_path: "domains",
        })
      ).exitCode,
    ).toBe(1);
    expect(
      (
        await runDecisionCheck(root, {
          memory_path: "memory",
          changes_path: "changes",
          domains_path: "domains",
        })
      ).stdout,
    ).toContain("unknown decision-ref missing-id");
  });

  it("notes active decisions not yet cited in tests", async () => {
    const root = await project();
    await addDecision(root, { id: "orphan", rule: "Unused ruling." });
    await addDecision(root, { id: "covered", rule: "Covered ruling." });
    await mkdir(join(root, "changes", "x"), { recursive: true });
    await writeFile(
      join(root, "changes/x/local-test-plan.md"),
      "- decision-ref: covered\n",
      "utf8",
    );
    const result = await runDecisionCheck(root, {
      memory_path: "memory",
      changes_path: "changes",
      domains_path: "domains",
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("no test references yet for: orphan");
  });

  it("lists decisions and resolves text helpers", async () => {
    const root = await project();
    await addDecision(root, { id: "a", rule: "Alpha", scope: ["billing"] });
    expect((await listDecisions(root)).stdout).toContain("a:");
    const resolved = await resolveDecisionRefsInText(root, "See decision-ref: a in the spec.\n");
    expect(resolved.missing).toEqual([]);
    expect(resolved.resolved[0]).toContain("Alpha");
    expect(resolved.body).toContain("Linked decisions");
  });

  it("scaffolds decisions folder on init", async () => {
    const root = await project();
    expect(await pathExists(join(root, ".sdd", "decisions", ".gitkeep"))).toBe(true);
    const raw = await readFile(join(root, ".sdd", "decisions", ".gitkeep"), "utf8");
    expect(raw).toBe("");
  });
});
