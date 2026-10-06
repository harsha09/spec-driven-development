/**
 * Unit tests: init alone is enough to install agents (no separate agents install).
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import {
  AGENT_INTEGRATIONS,
  type AgentTarget,
  generatedState,
  initProject,
  installAgentIntegration,
  markGenerated,
  pathExists,
} from "../index.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const d = temps.pop();
    if (d) await rm(d, { recursive: true, force: true });
  }
});

async function freshRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "sdd-init-ag-"));
  temps.push(dir);
  return dir;
}

describe("init installs agents without separate agents install", () => {
  it.each([
    {
      target: "copilot" as AgentTarget,
      present: ".github/agents/sdd.agent.md",
      absent: [".claude/agents/sdd.md", ".grok/rules/sdd.md", ".kilo/sdd.md"],
      aiKey: "copilot",
    },
    {
      target: "claude-code" as AgentTarget,
      present: ".claude/agents/sdd.md",
      absent: [".github/agents/sdd.agent.md", ".grok/rules/sdd.md", ".kilo/sdd.md"],
      aiKey: "claude",
    },
    {
      target: "grok" as AgentTarget,
      present: ".grok/rules/sdd.md",
      absent: [".github/agents/sdd.agent.md", ".claude/agents/sdd.md", ".kilo/sdd.md"],
      aiKey: "grok",
    },
    {
      target: "kilo" as AgentTarget,
      present: ".kilo/sdd.md",
      absent: [
        ".github/agents/sdd.agent.md",
        ".claude/agents/sdd.md",
        ".grok/rules/sdd.md",
        ".ollama/sdd.md",
      ],
      aiKey: "kilo",
    },
  ])(
    "init with agents=$target installs only that host",
    async ({ target, present, absent, aiKey }) => {
      const root = await freshRoot();
      const res = await initProject({ projectRoot: root, agents: target });

      expect(res.agents?.created.length).toBeGreaterThan(0);
      expect(await pathExists(join(root, present))).toBe(true);
      expect(await pathExists(join(root, ".sdd/protocol.md"))).toBe(true);
      expect(await pathExists(join(root, "AGENTS.md"))).toBe(true);
      expect(await pathExists(join(root, ".sdd/agents.json"))).toBe(true);
      expect(await pathExists(join(root, "memory/index.md"))).toBe(true);
      expect(await pathExists(join(root, "memory/constitution.md"))).toBe(true);
      const index = await readFile(join(root, "memory/index.md"), "utf8");
      expect(index).toMatch(/constitution/i);

      for (const p of absent) {
        expect(await pathExists(join(root, p))).toBe(false);
      }

      const snap = JSON.parse(await readFile(join(root, ".sdd/agents.json"), "utf8"));
      expect(snap.ai).toBe(aiKey);
      expect(snap.version).toBe(3);
    },
  );

  it("init without agents does not create host agent files", async () => {
    const root = await freshRoot();
    await initProject({ projectRoot: root, agents: false });
    expect(await pathExists(join(root, ".github/agents/sdd.agent.md"))).toBe(false);
    expect(await pathExists(join(root, ".claude/agents/sdd.md"))).toBe(false);
    expect(await pathExists(join(root, ".grok/rules/sdd.md"))).toBe(false);
    expect(await pathExists(join(root, ".sdd/config.yaml"))).toBe(true);
  });

  it("registry covers public keys including ollama and kilo", () => {
    const keys = AGENT_INTEGRATIONS.map((i) => i.key).sort();
    expect(keys).toEqual(["claude", "copilot", "grok", "kilo", "ollama"]);
  });
});

/** Brownfield fixture: a user's own agent rules, other tools' folders and memory docs. */
const USER_FILES: Record<string, string> = {
  "AGENTS.md": "# My hand-written agent rules\n\nAlways run the linter.\n",
  ".claude/agents/reviewer.md": "---\nname: reviewer\n---\nmy claude reviewer\n",
  ".claude/settings.json": '{"model":"x"}\n',
  ".kilo/config.md": "kilo cfg\n",
  ".grok/rules/team.md": "team rules\n",
  ".github/agents/release.agent.md": "---\nname: release\n---\nrelease helper\n",
  ".github/workflows/ci.yml": "name: CI\n",
  ".idea/sdd-agent-notes.md": "notes I keep\n",
  "memory/PRD.md": "# PRD\n\nThe product.\n",
  "memory/constitution.md": "# Constitution\n\n- Our own rule.\n",
};

async function seedUserFiles(root: string): Promise<void> {
  for (const [rel, body] of Object.entries(USER_FILES)) {
    await mkdir(dirname(join(root, rel)), { recursive: true });
    await writeFile(join(root, rel), body);
  }
}

async function expectUserFilesUnchanged(root: string): Promise<void> {
  for (const [rel, body] of Object.entries(USER_FILES)) {
    expect(await readFile(join(root, rel), "utf8"), rel).toBe(body);
  }
}

describe("init never overwrites or deletes files sdd did not generate (#4)", () => {
  it("keeps AGENTS.md, .claude/agents, .kilo and memory/ byte-identical without force", async () => {
    const root = await freshRoot();
    await seedUserFiles(root);

    const res = await initProject({ projectRoot: root, agents: "copilot" });

    await expectUserFilesUnchanged(root);
    expect(await pathExists(join(root, ".github/agents/sdd.agent.md"))).toBe(true);
    const keptPaths = res.kept.map((k) => k.path);
    expect(keptPaths).toEqual(
      expect.arrayContaining([
        "AGENTS.md",
        ".claude/agents/reviewer.md",
        ".kilo/config.md",
        ".grok/rules/team.md",
        ".idea/sdd-agent-notes.md",
      ]),
    );
    expect(res.kept.find((k) => k.path === "AGENTS.md")?.reason).toBe("not-generated");
    expect(res.agents?.removed).toEqual([]);
  });

  it("keeps them byte-identical with force too (fresh and re-init, switching host)", async () => {
    const root = await freshRoot();
    await seedUserFiles(root);

    await initProject({ projectRoot: root, agents: "copilot", force: true });
    await expectUserFilesUnchanged(root);

    // Re-init with force, switching to another host: copilot's sdd files go, user files stay
    const res = await initProject({ projectRoot: root, agents: "kilo", force: true });
    await expectUserFilesUnchanged(root);
    expect(await pathExists(join(root, ".kilo/sdd.md"))).toBe(true);
    expect(await pathExists(join(root, ".github/agents/sdd.agent.md"))).toBe(false);
    expect(res.agents?.removed).toContain(".github/agents/sdd.agent.md");
    // .github/agents still has the user's agent, so the folder stays
    expect(await pathExists(join(root, ".github/agents/release.agent.md"))).toBe(true);
  });

  it("force regenerates unedited sdd files but keeps sdd files the user edited", async () => {
    const root = await freshRoot();
    await initProject({ projectRoot: root, agents: "copilot" });

    const edited = ".github/agents/sdd.agent.md";
    const editedBody = `${await readFile(join(root, edited), "utf8")}\nTeam note: never touch prod.\n`;
    await writeFile(join(root, edited), editedBody);
    const protocolBody = `${await readFile(join(root, ".sdd/protocol.md"), "utf8")}\n7. Our rule.\n`;
    await writeFile(join(root, ".sdd/protocol.md"), protocolBody);
    const plannerPath = join(root, ".github/agents/sdd-planner.agent.md");
    await writeFile(
      plannerPath,
      (await readFile(plannerPath, "utf8")).replace("Planner", "PLANNER"),
    );

    const res = await initProject({ projectRoot: root, agents: "copilot", force: true });

    expect(await readFile(join(root, edited), "utf8")).toBe(editedBody);
    expect(await readFile(join(root, ".sdd/protocol.md"), "utf8")).toBe(protocolBody);
    expect(res.kept).toEqual(
      expect.arrayContaining([
        { path: edited, reason: "edited" },
        { path: ".sdd/protocol.md", reason: "edited" },
        { path: ".github/agents/sdd-planner.agent.md", reason: "edited" },
      ]),
    );
    // Unedited generated files are regenerated and still verify as unmodified
    expect(res.agents?.created).toContain(".github/agents/sdd-reviewer.agent.md");
    expect(
      generatedState(await readFile(join(root, ".github/agents/sdd-reviewer.agent.md"), "utf8")),
    ).toBe("unmodified");

    // Switching host with force removes unedited copilot files but keeps the edited ones
    const sw = await initProject({ projectRoot: root, agents: "grok", force: true });
    expect(await readFile(join(root, edited), "utf8")).toBe(editedBody);
    expect(await pathExists(join(root, ".github/agents/sdd-reviewer.agent.md"))).toBe(false);
    expect(sw.kept).toEqual(expect.arrayContaining([{ path: edited, reason: "edited" }]));
  });

  it("without force leaves existing unedited sdd files alone (skipped, not rewritten)", async () => {
    const root = await freshRoot();
    await installAgentIntegration({ projectRoot: root, target: "copilot" });
    const before = await readFile(join(root, "AGENTS.md"), "utf8");
    const res = await installAgentIntegration({ projectRoot: root, target: "copilot" });
    expect(res.created).toEqual([]);
    expect(res.skipped).toContain("AGENTS.md");
    expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe(before);
  });
});

describe("generated-file marker", () => {
  it("puts the marker after YAML front matter and verifies the hash", () => {
    const body = "---\nname: sdd\ndescription: x\n---\n\n# sdd\n";
    const marked = markGenerated(body);
    expect(marked.startsWith("---\nname: sdd\n")).toBe(true);
    expect(marked).toMatch(/^---\n[\s\S]*?\n---\n<!-- sdd:generated sha256=[0-9a-f]{64}/);
    expect(generatedState(marked)).toBe("unmodified");
    expect(generatedState(`${marked}more\n`)).toBe("edited");
  });

  it("puts the marker first when there is no front matter", () => {
    const marked = markGenerated("# Agents\n");
    expect(marked.startsWith("<!-- sdd:generated sha256=")).toBe(true);
    expect(generatedState(marked)).toBe("unmodified");
    expect(generatedState(marked.replace("# Agents", "# Our agents"))).toBe("edited");
  });

  it("treats files without a marker as not generated", () => {
    expect(generatedState("# My rules\n")).toBe("not-generated");
    expect(generatedState("<!-- sdd:generated sha256=nothex -->\nx\n")).toBe("not-generated");
  });
});
