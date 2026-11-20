import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import {
  WorkflowSchema,
  createChange,
  formatGateStatus,
  gateVerdictStatus,
  initProject,
  loadConfig,
  mergeChange,
  recordGateVerdict,
  saveChangeMeta,
} from "../index.js";

const temps: string[] = [];
const HEAD = "a".repeat(40);
const NEXT = "b".repeat(40);
const AT = "2026-11-20T00:00:00.000Z";
const LATER = "2026-11-20T01:00:00.000Z";

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

function git(root: string, args: string[]): string {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "git failed");
  return result.stdout.trim();
}

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sdd-gate-"));
  temps.push(root);
  await initProject({ projectRoot: root, agents: false });
  await writeFile(
    join(root, ".sdd/workflows/gated.yaml"),
    [
      "name: gated",
      "version: 1",
      "stages:",
      "  - id: intent",
      "    gate:",
      "      type: none",
      "required_gates:",
      "  - review",
      "  - qa",
      "  - domain",
      "  - review",
      "",
    ].join("\n"),
    "utf8",
  );
  return root;
}

async function change(root: string, branch?: string) {
  const config = await loadConfig(root);
  const ctx = await createChange({
    projectRoot: root,
    config,
    title: "Pin the gates",
    workflowName: "gated",
    branch,
  });
  return { config, ctx };
}

function readHead(sha: string | null) {
  return async () => sha;
}

async function pass(
  root: string,
  config: Awaited<ReturnType<typeof loadConfig>>,
  changeId: string,
  gate: string,
  sha: string,
  at = AT,
) {
  return recordGateVerdict(root, config, changeId, {
    gate,
    reviewer: "Ada Lovelace",
    verdict: "pass",
    sha,
    evidence: ["evidence/qa.log"],
    at,
  });
}

describe("gate verdict records", () => {
  it("keeps an older workflow valid and rejects a bad gate name", () => {
    const plain = WorkflowSchema.parse({ name: "plain", stages: [{ id: "intent" }] });
    expect(plain.required_gates).toBeUndefined();
    const named = WorkflowSchema.parse({
      name: "named",
      stages: [{ id: "intent" }],
      required_gates: ["review", "qa"],
    });
    expect(named.required_gates).toEqual(["review", "qa"]);
    expect(
      WorkflowSchema.safeParse({
        name: "bad",
        stages: [{ id: "intent" }],
        required_gates: ["../review"],
      }).success,
    ).toBe(false);
  });

  it("refuses a pass that does not name a SHA or evidence", async () => {
    const root = await project();
    const { config, ctx } = await change(root);
    await expect(
      recordGateVerdict(root, config, ctx.id, {
        gate: "review",
        reviewer: "Ada Lovelace",
        verdict: "pass",
        evidence: ["evidence/qa.log"],
      }),
    ).rejects.toThrow("A pass verdict needs the commit SHA.");
    await expect(
      recordGateVerdict(root, config, ctx.id, {
        gate: "review",
        reviewer: "Ada Lovelace",
        verdict: "pass-with-notes",
        sha: "   ",
        evidence: ["evidence/qa.log"],
      }),
    ).rejects.toThrow("A pass verdict needs the commit SHA.");
    await expect(
      recordGateVerdict(root, config, ctx.id, {
        gate: "review",
        reviewer: "Ada Lovelace",
        verdict: "fail",
      }),
    ).rejects.toThrow("A verdict needs the commit SHA.");
    await expect(
      recordGateVerdict(root, config, ctx.id, {
        gate: "review",
        reviewer: "Ada Lovelace",
        verdict: "pass",
        sha: "abc",
        evidence: ["evidence/qa.log"],
      }),
    ).rejects.toThrow("A commit SHA is 40 or 64 hex characters.");
    await expect(
      recordGateVerdict(root, config, ctx.id, {
        gate: "review",
        reviewer: "Ada Lovelace",
        verdict: "pass",
        sha: HEAD,
      }),
    ).rejects.toThrow("A pass verdict needs a link to evidence.");
    await expect(
      recordGateVerdict(root, config, ctx.id, {
        gate: "review",
        reviewer: "Ada Lovelace",
        verdict: "pass",
        sha: HEAD,
        evidence: ["/tmp/qa.log"],
      }),
    ).rejects.toThrow("An evidence link must be a repo-relative path or an http(s) URL.");
    await expect(
      recordGateVerdict(root, config, ctx.id, {
        gate: "../review",
        reviewer: "Ada Lovelace",
        verdict: "pass",
        sha: HEAD,
        evidence: ["evidence/qa.log"],
      }),
    ).rejects.toThrow("A gate name is not valid.");
    expect(await readFile(join(ctx.path, "gate-verdicts.yaml"), "utf8").catch(() => "")).toBe("");
  });

  it("stores the named SHA and treats a later head as stale", async () => {
    const root = await project();
    const { config, ctx } = await change(root);
    const saved = await recordGateVerdict(root, config, ctx.id, {
      gate: "review",
      reviewer: "Ada Lovelace",
      verdict: "pass",
      sha: HEAD.toUpperCase(),
      evidence: ["evidence/qa.log", "https://example.com/logs/1"],
      at: AT,
    });
    expect(saved.sha).toBe(HEAD);
    const file = await readFile(join(ctx.path, "gate-verdicts.yaml"), "utf8");
    expect(file).toContain(`sha: ${HEAD}`);
    expect(file).toContain("verdict: pass");
    expect(file).toContain("reviewer: Ada Lovelace");
    expect(file).toContain(`at: ${AT}`);
    expect(file).toContain("evidence/qa.log");

    await pass(root, config, ctx.id, "qa", HEAD);
    await recordGateVerdict(root, config, ctx.id, {
      gate: "domain",
      reviewer: "Grace Hopper",
      verdict: "pass-with-notes",
      sha: HEAD,
      evidence: ["evidence/domain.log"],
      at: AT,
    });

    const fresh = await gateVerdictStatus(root, config, ctx.id, readHead(HEAD));
    expect(fresh.ready).toBe(true);
    expect(fresh.gates.map((gate) => gate.gate)).toEqual(["review", "qa", "domain"]);
    expect(fresh.gates.map((gate) => gate.state)).toEqual(["fresh", "fresh", "fresh"]);
    expect(formatGateStatus(fresh)).toContain(`review fresh pass ${HEAD} Ada Lovelace ${AT}`);
    expect(formatGateStatus(fresh)).toContain("ready");

    const moved = await gateVerdictStatus(root, config, ctx.id, readHead(NEXT));
    expect(moved.ready).toBe(false);
    expect(moved.gates.map((gate) => gate.state)).toEqual(["stale", "stale", "stale"]);
    const text = formatGateStatus(moved);
    expect(text).toContain(`head ${NEXT}`);
    expect(text).toContain(`review stale pass ${HEAD} Ada Lovelace ${AT}`);
    expect(text).toContain("blocked");

    const allowed = await mergeChange({
      projectRoot: root,
      config,
      changeId: ctx.id,
      checkOnly: true,
      readHead: readHead(HEAD),
      run: async () => {
        throw new Error("check does not merge");
      },
    });
    expect(allowed).toEqual({ ok: true, message: `Merge allowed at ${HEAD}.` });

    const blocked = await mergeChange({
      projectRoot: root,
      config,
      changeId: ctx.id,
      checkOnly: true,
      readHead: readHead(NEXT),
      run: async () => {
        throw new Error("a stale gate must not merge");
      },
    });
    expect(blocked).toEqual({
      ok: false,
      message: "Merge blocked: review stale, qa stale, domain stale.",
    });
  });

  it("blocks a missing gate and a fail on the current head", async () => {
    const root = await project();
    const { config, ctx } = await change(root);
    await pass(root, config, ctx.id, "review", HEAD);
    await pass(root, config, ctx.id, "qa", HEAD, AT);
    await recordGateVerdict(root, config, ctx.id, {
      gate: "qa",
      reviewer: "Ada Lovelace",
      verdict: "fail",
      sha: HEAD,
      at: LATER,
    });
    const report = await gateVerdictStatus(root, config, ctx.id, readHead(HEAD));
    expect(report.gates.map((gate) => [gate.gate, gate.state])).toEqual([
      ["review", "fresh"],
      ["qa", "failed"],
      ["domain", "missing"],
    ]);
    const blocked = await mergeChange({
      projectRoot: root,
      config,
      changeId: ctx.id,
      readHead: readHead(HEAD),
      run: async () => {
        throw new Error("gh should not run");
      },
    });
    expect(blocked).toEqual({
      ok: false,
      message: "Merge blocked: qa failed, domain missing.",
    });
  });

  it("merges with a head-match guard and stops when the head moves", async () => {
    const root = await project();
    const { config, ctx } = await change(root, "topic");
    await pass(root, config, ctx.id, "review", HEAD);
    await pass(root, config, ctx.id, "qa", HEAD);
    await pass(root, config, ctx.id, "domain", HEAD);
    ctx.meta.pr = { number: 12, url: "https://example.com/pull/12" };
    await saveChangeMeta(root, config, ctx.meta);

    const wrongBranch = await mergeChange({
      projectRoot: root,
      config,
      changeId: ctx.id,
      readHead: readHead(HEAD),
      readBranch: async () => "main",
      run: async () => {
        throw new Error("gh should not run");
      },
    });
    expect(wrongBranch.ok).toBe(false);
    expect(wrongBranch.message).toBe("Merge blocked: current branch is main, not topic.");

    let reads = 0;
    const moved = await mergeChange({
      projectRoot: root,
      config,
      changeId: ctx.id,
      readHead: async () => {
        reads += 1;
        return reads === 1 ? HEAD : NEXT;
      },
      readBranch: async () => "topic",
      run: async () => {
        throw new Error("gh should not run");
      },
    });
    expect(moved).toEqual({
      ok: false,
      message: `Merge blocked: head moved from ${HEAD} to ${NEXT}.`,
    });

    const args: string[][] = [];
    const merged = await mergeChange({
      projectRoot: root,
      config,
      changeId: ctx.id,
      readHead: readHead(HEAD),
      readBranch: async () => "topic",
      run: async (_cwd, command, commandArgs) => {
        args.push([command, ...commandArgs]);
        return { exitCode: 0, stdout: "merged\n", stderr: "" };
      },
    });
    expect(args).toEqual([["gh", "pr", "merge", "12", "--match-head-commit", HEAD]]);
    expect(merged).toEqual({ ok: true, message: "merged" });

    const failed = await mergeChange({
      projectRoot: root,
      config,
      changeId: ctx.id,
      readHead: readHead(HEAD),
      readBranch: async () => "topic",
      run: async () => ({ exitCode: 1, stdout: "", stderr: "head mismatch\n" }),
    });
    expect(failed).toEqual({ ok: false, message: "Merge failed: head mismatch" });
  });

  it("refuses a merge with no pull request and allows a workflow with no gates", async () => {
    const root = await project();
    const { config, ctx } = await change(root);
    await pass(root, config, ctx.id, "review", HEAD);
    await pass(root, config, ctx.id, "qa", HEAD);
    await pass(root, config, ctx.id, "domain", HEAD);
    const noPr = await mergeChange({
      projectRoot: root,
      config,
      changeId: ctx.id,
      readHead: readHead(HEAD),
      run: async () => {
        throw new Error("gh should not run");
      },
    });
    expect(noPr).toEqual({
      ok: false,
      message: "Merge blocked: this change has no pull request.",
    });

    const plain = await createChange({
      projectRoot: root,
      config,
      title: "No gates",
      workflowName: "hotfix",
    });
    const check = await mergeChange({
      projectRoot: root,
      config,
      changeId: plain.id,
      checkOnly: true,
      readHead: readHead(null),
    });
    expect(check).toEqual({ ok: true, message: "No required gates." });
    const blocked = await mergeChange({
      projectRoot: root,
      config,
      changeId: plain.id,
      readHead: readHead(null),
    });
    expect(blocked).toEqual({ ok: false, message: "Merge blocked: Git HEAD is unavailable." });
  });

  it("flips stored verdicts to stale after a new commit", async () => {
    const root = await project();
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "dev@example.com"]);
    git(root, ["config", "user.name", "Dev Example"]);
    git(root, ["config", "commit.gpgsign", "false"]);
    await writeFile(join(root, "README.md"), "one\n", "utf8");
    git(root, ["add", "README.md"]);
    git(root, ["commit", "-m", "one"]);
    const first = git(root, ["rev-parse", "HEAD"]);
    const { config, ctx } = await change(root);
    await pass(root, config, ctx.id, "review", first);
    await pass(root, config, ctx.id, "qa", first);
    await pass(root, config, ctx.id, "domain", first);
    expect((await gateVerdictStatus(root, config, ctx.id)).ready).toBe(true);

    await writeFile(join(root, "NOTES.md"), "two\n", "utf8");
    git(root, ["add", "NOTES.md"]);
    git(root, ["commit", "-m", "two"]);
    const second = git(root, ["rev-parse", "HEAD"]);
    const report = await gateVerdictStatus(root, config, ctx.id);
    expect(report.head).toBe(second);
    expect(report.ready).toBe(false);
    expect(report.gates.every((gate) => gate.state === "stale" && gate.sha === first)).toBe(true);
    expect(formatGateStatus(report)).toContain(`review stale pass ${first}`);
  });
});
