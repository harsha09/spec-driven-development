import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertMergeGates,
  createChange,
  formatGateStatusReport,
  gateStatusReport,
  initProject,
  loadConfig,
  mergeWithGateGuard,
  parseSignoff,
  recordSignoff,
} from "../index.js";

const temps: string[] = [];

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
  const root = await mkdtemp(join(tmpdir(), "sdd-gates-"));
  temps.push(root);
  await initProject({ projectRoot: root, agents: false });
  return root;
}

async function writeTeam(root: string): Promise<void> {
  await writeFile(
    join(root, ".sdd", "team.yaml"),
    [
      "branch: bot/{bot}/{change}",
      "rooms:",
      "  commit: false",
      "bots:",
      "  - name: product-manager",
      "    role: product-manager",
      "    wip: 1",
      "humans:",
      "  - name: Ada Lovelace",
      "",
    ].join("\n"),
    "utf8",
  );
}

function initGit(root: string): void {
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "ada@example.com"]);
  git(root, ["config", "user.name", "Ada Lovelace"]);
  git(root, ["config", "commit.gpgsign", "false"]);
}

async function commit(root: string, message: string): Promise<string> {
  await writeFile(join(root, "README.md"), `${message}\n`, "utf8");
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-m", message]);
  return git(root, ["rev-parse", "HEAD"]);
}

describe("gate verdicts on HEAD", () => {
  it("marks a pass on an old commit stale after HEAD moves", async () => {
    const root = await project();
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Stale gates",
      workflowName: "team-software",
    });
    await writeTeam(root);
    initGit(root);
    const first = await commit(root, "first");
    expect(
      (await recordSignoff(root, { note: "reviewed pull request", stage: "pr_review" })).exitCode,
    ).toBe(0);
    expect((await recordSignoff(root, { note: "qa pass", stage: "qa_signoff" })).exitCode).toBe(0);
    expect((await recordSignoff(root, { note: "po pass", stage: "po_signoff" })).exitCode).toBe(0);

    await commit(root, "second");
    const report = await gateStatusReport(root, config, ctx.id);
    expect(report.headSha).not.toBe(first);
    for (const row of report.gates) {
      expect(row.state).toBe("stale");
      expect(row.stale_sha).toBe(first);
    }
    const text = formatGateStatusReport(report);
    expect(text).toContain("stale");
    expect(report.mergeReady).toBe(false);
  });

  it("allows merge when every required gate is fresh, then blocks after a new commit", async () => {
    const root = await project();
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Merge gates",
      workflowName: "team-software",
    });
    await writeTeam(root);
    initGit(root);
    await commit(root, "base");
    git(root, ["checkout", "-b", "feature"]);
    await commit(root, "feature work");

    for (const stage of ["pr_review", "qa_signoff", "po_signoff"]) {
      expect((await recordSignoff(root, { note: `signed ${stage}`, stage })).exitCode).toBe(0);
    }

    const allowed = await assertMergeGates(root, config, ctx.id);
    expect(allowed.ok).toBe(true);
    if (!allowed.ok) return;

    git(root, ["checkout", "main"]);
    const merge = await mergeWithGateGuard({
      projectRoot: root,
      config,
      changeId: ctx.id,
      branch: "feature",
    });
    expect(merge.exitCode).toBe(0);

    await commit(root, "after merge");
    const blocked = await assertMergeGates(root, config, ctx.id);
    expect(blocked.ok).toBe(false);
  });

  it("rejects a sign-off record with no sha in the front matter", async () => {
    const parsed = parseSignoff(
      "---\nkind: qa\nsha:\nreviewer: Ada Lovelace\nverdict: pass\n---\nnote\n",
    );
    expect(parsed).toBeNull();
  });

  it("blocks merge when a required gate is missing", async () => {
    const root = await project();
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Missing gate",
      workflowName: "team-software",
    });
    await writeTeam(root);
    initGit(root);
    await commit(root, "only one");
    expect((await recordSignoff(root, { note: "pr ok", stage: "pr_review" })).exitCode).toBe(0);

    const blocked = await assertMergeGates(root, config, ctx.id);
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.message).toMatch(/missing/i);

    const sha = git(root, ["rev-parse", "HEAD"]);
    const body = await readFile(join(ctx.path, "reviews", `pr_review-${sha}.md`), "utf8");
    expect(body).toMatch(/sha: [0-9a-f]{40}/);
  });
});
