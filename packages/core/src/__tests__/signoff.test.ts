import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import {
  advanceStage,
  createChange,
  initProject,
  loadConfig,
  pathExists,
  recordDecisionRequest,
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
  const root = await mkdtemp(join(tmpdir(), "sdd-sign-"));
  temps.push(root);
  await initProject({ projectRoot: root, agents: false });
  return root;
}

async function writeTeam(root: string, human = "Ada Lovelace"): Promise<void> {
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
      `  - name: ${human}`,
      "",
    ].join("\n"),
    "utf8",
  );
}

function initGit(root: string, human = "Ada Lovelace"): void {
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "ada@example.com"]);
  git(root, ["config", "user.name", human]);
  git(root, ["config", "commit.gpgsign", "false"]);
}

async function commitReadme(root: string): Promise<string> {
  await writeFile(join(root, "README.md"), "team\n", "utf8");
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-m", "init"]);
  return git(root, ["rev-parse", "HEAD"]);
}

describe("team sign-off", () => {
  it("refuses an empty note, a broken note, a missing team, a missing HEAD, and a stranger", async () => {
    const root = await project();
    expect(await recordSignoff(root, { note: "  " })).toEqual({
      exitCode: 1,
      stdout: "A sign-off needs a note.",
    });
    expect(await recordSignoff(root, { note: "one\ntwo" })).toEqual({
      exitCode: 1,
      stdout: "A sign-off note is one line.",
    });
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Sign the reading",
      workflowName: "team-software",
    });
    expect(await recordSignoff(root, { note: "the person accepted the reading" })).toEqual({
      exitCode: 1,
      stdout: "No team config. Run sdd team init --template software.",
    });
    await writeTeam(root);
    expect(await recordSignoff(root, { note: "the person accepted the reading" })).toEqual({
      exitCode: 1,
      stdout: "Cannot sign off: Git HEAD is unavailable in this project.",
    });
    initGit(root, "Grace Hopper");
    await commitReadme(root);
    expect(await recordSignoff(root, { note: "the person accepted the reading" })).toEqual({
      exitCode: 1,
      stdout: "Git user.name is not a human approver.",
    });
    expect(await recordSignoff(root, { note: "fine", stage: "../stage" })).toEqual({
      exitCode: 1,
      stdout: "A stage id is not valid.",
    });
    expect(await pathExists(join(ctx.path, "decisions.md"))).toBe(false);
    expect(await pathExists(join(ctx.path, "reviews"))).toBe(false);
  });

  it("writes one review for this commit and appends a second line without rewriting it", async () => {
    const root = await project();
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Sign the reading",
      workflowName: "team-software",
    });
    await writeTeam(root);
    initGit(root);
    const sha = await commitReadme(root);
    const review = join(ctx.path, "reviews", `requirements-${sha}.md`);
    await mkdir(join(ctx.path, "reviews"), { recursive: true });
    await writeFile(
      review,
      [
        "---",
        "kind: requirements",
        `sha: ${sha}`,
        "reviewer: developer",
        "verdict: accept",
        "---",
        "A role wrote this.",
        "",
      ].join("\n"),
      "utf8",
    );
    const signed = await recordSignoff(root, { note: "the person accepted the reading" });
    expect(signed).toEqual({ exitCode: 0, stdout: `Signed requirements at ${sha}.` });
    const body = await readFile(review, "utf8");
    expect(body).toContain("kind: requirements");
    expect(body).toContain(`sha: ${sha}`);
    expect(body).toContain("reviewer: Ada Lovelace");
    expect(body).toContain("verdict: accept");
    expect(body).toContain("the person accepted the reading");
    expect(body).not.toContain("A role wrote this.");
    const decisions = await readFile(join(ctx.path, "decisions.md"), "utf8");
    expect(decisions).toContain(
      `sign-off requirements ${sha} Ada Lovelace accept the person accepted the reading`,
    );
    const again = await recordSignoff(root, { note: "the person looked again" });
    expect(again.exitCode).toBe(0);
    expect(await readFile(review, "utf8")).toBe(body);
    const both = await readFile(join(ctx.path, "decisions.md"), "utf8");
    expect(both.startsWith(decisions)).toBe(true);
    expect(both).toContain("the person looked again");
    const lines = both.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(decisions.trim());
  });

  it("keeps a role name or a reject verdict from opening the gate", async () => {
    const root = await project();
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Role cannot sign",
      workflowName: "team-software",
    });
    await writeTeam(root);
    initGit(root);
    const sha = await commitReadme(root);
    await writeFile(
      join(ctx.path, "requirements.md"),
      "# Requirements\n\nThis change fixes a real user-facing issue with enough detail that the stage artifact is not an empty template stub.\n",
      "utf8",
    );
    const review = join(ctx.path, "reviews", `requirements-${sha}.md`);
    await mkdir(join(ctx.path, "reviews"), { recursive: true });
    await writeFile(
      review,
      `---\nkind: requirements\nsha: ${sha}\nreviewer: Ada Lovelace\nverdict: reject\n---\nNot this shape.\n`,
      "utf8",
    );
    await expect(advanceStage(root, config, ctx.id)).rejects.toThrow(/does not match/i);
    await writeFile(
      review,
      `---\nkind: requirements\nsha: ${sha}\nreviewer: developer\nverdict: accept\n---\nA role wrote this.\n`,
      "utf8",
    );
    await expect(advanceStage(root, config, ctx.id)).rejects.toThrow(/does not match/i);
  });

  it("appends a decision request and leaves the gate record alone", async () => {
    const root = await project();
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Ask the person",
      workflowName: "feature",
    });
    const meta = await readFile(join(ctx.path, "meta.yaml"), "utf8");
    expect(await recordDecisionRequest(root, { note: "" })).toEqual({
      exitCode: 1,
      stdout: "A decision needs a note.",
    });
    expect(await recordDecisionRequest(root, { note: "which\nname" })).toEqual({
      exitCode: 1,
      stdout: "A decision note is one line.",
    });
    expect(await recordDecisionRequest(root, { note: "Which name is the approver?" })).toEqual({
      exitCode: 0,
      stdout: "Decision needed.",
    });
    const decisions = await readFile(join(ctx.path, "decisions.md"), "utf8");
    expect(decisions).toContain("decision-needed Which name is the approver?");
    expect(decisions).not.toContain("sign-off");
    expect(await readFile(join(ctx.path, "meta.yaml"), "utf8")).toBe(meta);
    expect(await pathExists(join(ctx.path, "reviews"))).toBe(false);
  });

  it("advances a feature change that has no team file", async () => {
    const root = await project();
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Feature still moves",
      workflowName: "feature",
    });
    await writeFile(
      join(ctx.path, "feature.md"),
      "# Feature\n\nUsers need a sign-off tied to the commit. Non-goals: rooms. Success: sdd next leaves intent.\n",
      "utf8",
    );
    const next = await advanceStage(root, config, ctx.id);
    expect(next.to).not.toBe("intent");
    expect(await pathExists(join(root, ".sdd", "team.yaml"))).toBe(false);
  });
});
