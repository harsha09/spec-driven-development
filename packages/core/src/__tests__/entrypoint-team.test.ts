import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import { writeText } from "../fs.js";
import {
  createChange,
  initProject,
  installAgentIntegration,
  loadConfig,
  refreshActiveAgentContext,
  writeAgentHandoff,
} from "../index.js";
import { createRole, pinRole } from "../role/profile.js";

const temps: string[] = [];
const previousHome = process.env.SDD_HOME;

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "sdd-team-entry-"));
  temps.push(dir);
  return dir;
}

async function project(): Promise<string> {
  const root = await tempDir();
  await initProject({ projectRoot: root, agents: false });
  return root;
}

afterEach(async () => {
  if (previousHome === undefined) process.env.SDD_HOME = undefined;
  else process.env.SDD_HOME = previousHome;
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

describe("product team on the host entrypoint", () => {
  it("keeps today's entrypoint when the repo and the user default have no team", async () => {
    process.env.SDD_HOME = await tempDir();
    const root = await project();
    await installAgentIntegration({ projectRoot: root, target: "grok", force: true });
    const protocol = await readFile(join(root, ".sdd/protocol.md"), "utf8");
    const agents = await readFile(join(root, "AGENTS.md"), "utf8");
    const rule = await readFile(join(root, ".grok/rules/sdd.md"), "utf8");
    expect(protocol).not.toContain("## Product team");
    expect(agents).not.toContain("## Product team");
    expect(rule).not.toContain("## Product team");
    expect(protocol).toContain("## Stage behavior");
    expect(rule).toContain("## Role rules");
  });

  it("lists role files in name order and ignores pin", async () => {
    process.env.SDD_HOME = await tempDir();
    const root = await project();
    await createRole(root, {
      name: "z-role",
      label: "Z",
      job: "Goes last",
      approvers: ["human"],
    });
    await createRole(root, {
      name: "a-role",
      label: "A",
      job: "Goes first",
      approvers: ["z-role"],
    });
    await pinRole(root, "z-role");
    await installAgentIntegration({ projectRoot: root, target: "grok", force: true });
    const protocol = await readFile(join(root, ".sdd/protocol.md"), "utf8");
    expect(protocol.indexOf("`a-role`")).toBeGreaterThan(0);
    expect(protocol.indexOf("`a-role`")).toBeLessThan(protocol.indexOf("`z-role`"));
    expect(protocol).toContain("Goes first");
    expect(protocol).toContain("Accepts: z-role");
    expect(protocol).toContain("`.sdd/roles/a-role.md`");
    expect(protocol).toContain("does not replace this team");
    expect(protocol).not.toContain("user default");
  });

  it("uses team.yaml order and does not let a user default replace the repo", async () => {
    const home = await tempDir();
    process.env.SDD_HOME = home;
    await createRole(home, {
      name: "global-role",
      label: "Global",
      job: "Must not appear",
      approvers: ["human"],
    });
    const root = await project();
    await createRole(root, {
      name: "dev",
      label: "Dev",
      job: "Build the change",
      approvers: ["qa"],
    });
    await createRole(root, {
      name: "qa",
      label: "QA",
      job: "Check the change",
      approvers: ["human"],
    });
    await writeText(
      join(root, ".sdd/team.yaml"),
      [
        "branch: bot/{bot}/{change}",
        "rooms:",
        "  commit: false",
        "bots:",
        "  - name: qa-bot",
        "    role: qa",
        "    wip: 1",
        "  - name: qa-again",
        "    role: qa",
        "    wip: 1",
        "  - name: dev-bot",
        "    role: dev",
        "    wip: 1",
        "  - name: missing-bot",
        "    role: missing",
        "    wip: 1",
        "",
      ].join("\n"),
    );
    await installAgentIntegration({ projectRoot: root, target: "grok", force: true });
    const protocol = await readFile(join(root, ".sdd/protocol.md"), "utf8");
    const agents = await readFile(join(root, "AGENTS.md"), "utf8");
    const rule = await readFile(join(root, ".grok/rules/sdd.md"), "utf8");
    for (const body of [protocol, agents, rule]) {
      expect(body.indexOf("`qa`")).toBeLessThan(body.indexOf("`dev`"));
      expect(body.indexOf("`dev`")).toBeLessThan(body.indexOf("`missing`"));
      expect(body).toContain("does not replace this team");
      expect(body).not.toContain("global-role");
      expect(body).not.toContain("user default");
    }
    expect(protocol.match(/`qa`/g)?.length).toBe(1);
    expect(protocol).toContain(
      "`missing` — not named. Accepts: not named. File: `.sdd/roles/missing.md`",
    );
    expect(protocol).toContain("## Stage behavior");
    expect(rule).toContain("## Role rules");
  });

  it("uses the user default only when the repo has no team", async () => {
    const home = await tempDir();
    process.env.SDD_HOME = home;
    await createRole(home, {
      name: "global-role",
      label: "Global",
      job: "Default job",
      approvers: ["human"],
    });
    const root = await project();
    await installAgentIntegration({ projectRoot: root, target: "grok", force: true });
    const protocol = await readFile(join(root, ".sdd/protocol.md"), "utf8");
    expect(protocol).toContain(
      "`global-role` — Default job. Accepts: human. File: `~/.sdd/roles/global-role.md`",
    );
    expect(protocol).toContain("Source: user default (`~/.sdd`)");
  });

  it("lists an unparsed role file and does not use the user default", async () => {
    const home = await tempDir();
    process.env.SDD_HOME = home;
    await createRole(home, {
      name: "global-role",
      label: "Global",
      job: "Must not appear",
      approvers: ["human"],
    });
    const root = await project();
    await writeText(join(root, ".sdd/roles/qa.md"), "not a role\n");
    await installAgentIntegration({ projectRoot: root, target: "grok", force: true });
    const protocol = await readFile(join(root, ".sdd/protocol.md"), "utf8");
    expect(protocol).toContain("`qa` — not named. Accepts: not named. File: `.sdd/roles/qa.md`");
    expect(protocol).not.toContain("global-role");
    expect(protocol).not.toContain("user default");
  });

  it("keeps the team in the handoff and after a second refresh", async () => {
    process.env.SDD_HOME = await tempDir();
    const root = await project();
    await createRole(root, {
      name: "qa",
      label: "QA",
      job: "Check the change",
      approvers: ["human"],
    });
    await installAgentIntegration({ projectRoot: root, target: "grok", force: true });
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Team handoff",
      workflowName: "hotfix",
    });
    await refreshActiveAgentContext(root);
    await refreshActiveAgentContext(root);
    const protocol = await readFile(join(root, ".sdd/protocol.md"), "utf8");
    const active = await readFile(join(root, ".sdd/active-context.md"), "utf8");
    const handoffPath = await writeAgentHandoff(root, config, ctx.id);
    const handoff = await readFile(handoffPath, "utf8");
    for (const body of [protocol, active, handoff]) {
      expect(body).toContain("`qa` — Check the change. Accepts: human. File: `.sdd/roles/qa.md`");
      expect(body).toContain("does not replace this team");
    }
    expect(active).toContain("Team handoff");
  });

  it("does not treat an edited protocol as regenerated", async () => {
    process.env.SDD_HOME = await tempDir();
    const root = await project();
    await installAgentIntegration({ projectRoot: root, target: "grok", force: true });
    const protocolPath = join(root, ".sdd/protocol.md");
    const original = await readFile(protocolPath, "utf8");
    await writeFile(protocolPath, `${original}\nEdited by a person.\n`, "utf8");
    await createRole(root, {
      name: "qa",
      label: "QA",
      job: "Check the change",
      approvers: ["human"],
    });
    await refreshActiveAgentContext(root);
    const protocol = await readFile(protocolPath, "utf8");
    expect(protocol).toContain("Edited by a person.");
    expect(protocol).not.toContain("`qa`");
    const rule = await readFile(join(root, ".grok/rules/sdd.md"), "utf8");
    expect(rule).toContain("`qa` — Check the change");
  });
});
