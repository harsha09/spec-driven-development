/**
 * QA follow-ups for #4 (PR #14): symlinks, empty user folders, CRLF/marker
 * tolerance, removed-file reporting, and clear errors instead of raw EACCES/EISDIR
 * with nothing half-written.
 */
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import {
  AgentInstallPreflightError,
  generatedState,
  initProject,
  installAgentIntegration,
  markGenerated,
  pathExists,
} from "../index.js";

const temps: string[] = [];
const isRoot = typeof process.getuid === "function" && process.getuid() === 0;

afterEach(async () => {
  while (temps.length) {
    const d = temps.pop();
    if (d) {
      await chmodTree(d);
      await rm(d, { recursive: true, force: true });
    }
  }
});

/** Restore write/read bits so temp dirs can be removed after permission tests. */
async function chmodTree(dir: string): Promise<void> {
  try {
    const st = await lstat(dir);
    if (st.isSymbolicLink()) return;
    await chmod(dir, st.isDirectory() ? 0o755 : 0o644);
    if (st.isDirectory()) for (const n of await readdir(dir)) await chmodTree(join(dir, n));
  } catch {
    // ignore
  }
}

async function tmp(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

async function put(root: string, rel: string, body: string): Promise<void> {
  await mkdir(dirname(join(root, rel)), { recursive: true });
  await writeFile(join(root, rel), body, "utf8");
}

describe("symlinks are never followed (F1)", () => {
  it("a forced host switch keeps a symlinked host dir and the files in its target", async () => {
    const outside = await tmp("sdd-shared-claude-");
    const root = await tmp("sdd-sym-");
    // The shared target holds unedited sdd stubs (e.g. copied from another repo).
    const donor = await tmp("sdd-donor-");
    await initProject({ projectRoot: donor, agents: "claude-code" });
    for (const n of await readdir(join(donor, ".claude/agents"))) {
      await writeFile(join(outside, n), await readFile(join(donor, ".claude/agents", n)));
    }
    const before = (await readdir(outside)).sort();
    await mkdir(join(root, ".claude"), { recursive: true });
    await symlink(outside, join(root, ".claude/agents"));

    await initProject({ projectRoot: root, agents: "claude-code" });
    const r = await installAgentIntegration({ projectRoot: root, target: "copilot", force: true });

    expect((await readdir(outside)).sort()).toEqual(before);
    expect((await lstat(join(root, ".claude/agents"))).isSymbolicLink()).toBe(true);
    expect(r.kept).toContainEqual({ path: ".claude/agents", reason: "symlink" });
    expect(r.removed.some((p) => p.startsWith(".claude"))).toBe(false);
  });

  it("does not write host stubs through a symlinked host dir", async () => {
    const outside = await tmp("sdd-shared-gh-");
    const root = await tmp("sdd-sym-write-");
    await mkdir(join(root, ".github"), { recursive: true });
    await symlink(outside, join(root, ".github/agents"));
    const res = await initProject({ projectRoot: root, agents: "copilot" });
    expect(await readdir(outside)).toEqual([]);
    expect(res.kept).toContainEqual({ path: ".github/agents", reason: "symlink" });
  });

  it("does not write through a dangling AGENTS.md symlink", async () => {
    const root = await tmp("sdd-sym-agents-");
    await mkdir(join(root, "docs"));
    await symlink("docs/AGENTS.md", join(root, "AGENTS.md"));
    const res = await initProject({ projectRoot: root, agents: "copilot" });
    expect(await pathExists(join(root, "docs/AGENTS.md"))).toBe(false);
    expect((await lstat(join(root, "AGENTS.md"))).isSymbolicLink()).toBe(true);
    expect(res.kept).toContainEqual({ path: "AGENTS.md", reason: "symlink" });
  });

  it("a dangling link or a link loop in another host's dir does not crash init", async () => {
    const root = await tmp("sdd-sym-broken-");
    await mkdir(join(root, ".claude/agents"), { recursive: true });
    await mkdir(join(root, ".grok/rules"), { recursive: true });
    await symlink("/nonexistent/target", join(root, ".claude/agents/broken.md"));
    await symlink("..", join(root, ".grok/rules/loop"));
    await put(root, ".grok/rules/team.md", "t\n");

    const res = await initProject({ projectRoot: root, agents: "copilot" });
    expect(await pathExists(join(root, ".github/agents/sdd.agent.md"))).toBe(true);
    expect((await lstat(join(root, ".claude/agents/broken.md"))).isSymbolicLink()).toBe(true);
    expect((await lstat(join(root, ".grok/rules/loop"))).isSymbolicLink()).toBe(true);
    expect(res.kept).toContainEqual({ path: ".claude/agents/broken.md", reason: "symlink" });
    expect(res.kept).toContainEqual({ path: ".grok/rules/loop", reason: "symlink" });
  });
});

describe("only folders sdd emptied are removed (F3)", () => {
  it("keeps the user's empty folders on a host switch, removes the ones sdd emptied", async () => {
    const root = await tmp("sdd-prune-");
    await mkdir(join(root, ".kilo/empty-user-dir"), { recursive: true });
    await mkdir(join(root, ".github/agents/empty-user-dir"), { recursive: true });
    await initProject({ projectRoot: root, agents: "kilo" });
    const toGrok = await installAgentIntegration({
      projectRoot: root,
      target: "grok",
      force: true,
    });
    expect(toGrok.removed).toContain(".kilo/sdd.md");
    expect(await pathExists(join(root, ".kilo/empty-user-dir"))).toBe(true);
    expect(await pathExists(join(root, ".github/agents/empty-user-dir"))).toBe(true);

    await installAgentIntegration({ projectRoot: root, target: "claude-code", force: true });
    const toCopilot = await installAgentIntegration({
      projectRoot: root,
      target: "copilot",
      force: true,
    });
    // .claude/agents and .claude held only sdd files → sdd emptied them → removed
    expect(toCopilot.removed).toEqual(
      expect.arrayContaining([".claude/agents/sdd.md", ".claude/agents", ".claude"]),
    );
    expect(await pathExists(join(root, ".claude"))).toBe(false);
    expect(await pathExists(join(root, ".kilo/empty-user-dir"))).toBe(true);
  });
});

describe("marker tolerance", () => {
  it("treats a CRLF checkout of an unedited file as unmodified", () => {
    const lf = markGenerated("---\nname: x\n---\n# Title\n\nBody line.\n");
    expect(generatedState(lf.replace(/\n/g, "\r\n"))).toBe("unmodified");
    expect(generatedState(`${lf.replace(/\n/g, "\r\n")}extra\r\n`)).toBe("edited");
  });

  it("accepts trailing whitespace after -->", () => {
    const lf = markGenerated("# Title\n\nBody.\n");
    expect(generatedState(lf.replace(/-->\n/, "-->  \t\n"))).toBe("unmodified");
  });
});

describe("clear errors, nothing half-written", () => {
  it("a directory at AGENTS.md fails before .sdd/ is written (EISDIR)", async () => {
    const root = await tmp("sdd-eisdir-");
    await put(root, "AGENTS.md/inner.txt", "x\n");
    const err = await initProject({ projectRoot: root, agents: "copilot" }).catch((e) => e);
    expect(err).toBeInstanceOf(AgentInstallPreflightError);
    expect(err.message).toMatch(/AGENTS\.md: it is a directory/);
    expect(err.message).toMatch(/Nothing was written/);
    expect(await pathExists(join(root, ".sdd"))).toBe(false);
    expect(await readFile(join(root, "AGENTS.md/inner.txt"), "utf8")).toBe("x\n");
  });

  it.skipIf(isRoot)(
    "an unreadable AGENTS.md fails clearly before anything is written (EACCES)",
    async () => {
      const root = await tmp("sdd-eacces-");
      await put(root, "AGENTS.md", "# mine\n");
      await chmod(join(root, "AGENTS.md"), 0o000);
      const err = await initProject({ projectRoot: root, agents: "copilot" }).catch((e) => e);
      expect(err).toBeInstanceOf(AgentInstallPreflightError);
      expect(err.message).toMatch(/Cannot read AGENTS\.md: permission denied \(EACCES\)/);
      expect(await pathExists(join(root, ".sdd"))).toBe(false);
    },
  );

  it.skipIf(isRoot)(
    "a read-only host dir on switch fails clearly and removes nothing",
    async () => {
      const root = await tmp("sdd-ro-dir-");
      await initProject({ projectRoot: root, agents: "claude-code" });
      const before = (await readdir(join(root, ".claude/agents"))).sort();
      await chmod(join(root, ".claude/agents"), 0o555);
      const err = await installAgentIntegration({
        projectRoot: root,
        target: "copilot",
        force: true,
      }).catch((e) => e);
      expect(err).toBeInstanceOf(AgentInstallPreflightError);
      expect(err.message).toMatch(/\.claude\/agents\/ is not writable/);
      await chmod(join(root, ".claude/agents"), 0o755);
      expect((await readdir(join(root, ".claude/agents"))).sort()).toEqual(before);
      expect(await pathExists(join(root, ".github/agents"))).toBe(false);
    },
  );

  it.skipIf(isRoot)("a read-only unedited stub under --force fails clearly", async () => {
    const root = await tmp("sdd-ro-file-");
    await initProject({ projectRoot: root, agents: "copilot" });
    await chmod(join(root, ".github/agents/sdd-planner.agent.md"), 0o444);
    const err = await initProject({ projectRoot: root, agents: "copilot", force: true }).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(AgentInstallPreflightError);
    expect(err.message).toMatch(/sdd-planner\.agent\.md \(--force\): the file is read-only/);
  });
});
