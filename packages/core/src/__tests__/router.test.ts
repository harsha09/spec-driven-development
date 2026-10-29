import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import { SDD_AGENT_ROLES, renderThinAgent } from "../agents.js";
import { pathExists } from "../fs.js";
import { createChange, initProject, loadConfig, setActiveChange } from "../index.js";
import { createRole, initTeam } from "../role/index.js";
import { queueRole, routeRole, takeRole, writeHandoffInboxes } from "../role/routing.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sdd-router-"));
  temps.push(root);
  return root;
}

describe("role router", () => {
  it("routes by rule, then one owner, and asks when two roles own the item", async () => {
    const root = await project();
    expect((await initTeam(root, "software", "Ada Lovelace")).exitCode).toBe(0);

    const routed = await routeRole(root, { stage: "implement", artifact: "tasks/T-001.md" });
    expect(routed).toMatchObject({
      exitCode: 0,
      stdout: "Ask the human.\nNo rule matched.",
    });

    await writeFile(
      join(root, ".sdd/routing.yaml"),
      "rules:\n  - id: pack\n    owns: the change pack for one service\n    role: architect\n",
      "utf8",
    );
    const ruled = await routeRole(root, { artifact: "the change pack for one service" });
    expect(ruled).toMatchObject({
      exitCode: 0,
      stdout: "role architect\nreason Rule pack matches.\nrule pack",
    });
    await writeFile(
      join(root, ".sdd/routing.yaml"),
      "rules:\n  - id: implement\n    stage: implement\n    role: developer\n",
      "utf8",
    );

    await writeHandoffInboxes(root, {
      type: "handoff",
      from: "dev-lead",
      to: "developer",
      change: "pay",
      section: "task",
      decision: "D-1",
    });
    const taken = await takeRole(root, { stage: "implement", artifact: "tasks/T-001.md" });
    expect(taken).toMatchObject({
      exitCode: 0,
      stdout: "developer took T-001\nrole developer\nrule implement",
    });
    const again = await takeRole(root, { stage: "implement", artifact: "tasks/T-002.md" });
    expect(again).toMatchObject({ exitCode: 1, stdout: "developer is at the limit." });
    const queued = await queueRole(root, "developer");
    expect(queued.stdout).toBe(
      "developer\n- handoff from dev-lead to developer\n- T-001 active implement tasks/T-001.md",
    );

    await writeFile(
      join(root, ".sdd/routing.yaml"),
      "rules:\n  - id: bare\n    role: developer\n",
      "utf8",
    );
    const invalid = await routeRole(root, { stage: "implement" });
    expect(invalid.exitCode).toBe(1);
    expect(invalid.stdout).toContain("routing.yaml is invalid");

    await rm(join(root, ".sdd/routing.yaml"));
    await createRole(root, {
      name: "other-dev",
      label: "Other",
      job: "Build the other pack",
      owns: ["the change pack for one service"],
    });
    const shared = await routeRole(root, { artifact: "the change pack for one service" });
    expect(shared).toMatchObject({
      exitCode: 0,
      stdout: "Ask the human.\nTwo roles own this.",
    });
    expect((await takeRole(root, { artifact: "the change pack for one service" })).exitCode).toBe(
      1,
    );
  });

  it("follows the stages a role lists on the workflow that was started", async () => {
    const root = await project();
    await initProject({ projectRoot: root });
    const config = await loadConfig(root);
    const change = await createChange({
      projectRoot: root,
      config,
      title: "Add a filter",
      workflowName: "feature",
    });
    await setActiveChange(root, config, change.id);
    await createRole(root, {
      name: "analyst",
      label: "Analyst",
      job: "Write the reading",
      stages: ["intent", "design"],
    });
    await createRole(root, {
      name: "builder",
      label: "Builder",
      job: "Build the change",
      stages: ["implement"],
    });

    const reading = await routeRole(root, {});
    expect(reading.stdout).toBe(
      "role analyst\nreason Role analyst lists stage intent.\nrule role-stage",
    );
    expect((await routeRole(root, { stage: "tasks" })).stdout).toBe(
      "Ask the human.\nNo rule matched.",
    );
    expect((await routeRole(root, { stage: "implement" })).stdout).toBe(
      "role builder\nreason Role builder lists stage implement.\nrule role-stage",
    );

    await createRole(root, {
      name: "second",
      label: "Second",
      job: "Also write the reading",
      stages: ["intent"],
    });
    expect((await routeRole(root, { stage: "intent" })).stdout).toBe(
      "Ask the human.\nTwo roles list this stage.",
    );
  });

  it("uses the stage owner when no rule matches, and refuses a full role", async () => {
    const root = await project();
    await initProject({ projectRoot: root });
    const config = await loadConfig(root);
    const change = await createChange({
      projectRoot: root,
      config,
      title: "Route the reading",
      workflowName: "team-software",
    });
    await setActiveChange(root, config, change.id);

    const missing = await routeRole(root, {});
    expect(missing).toMatchObject({ exitCode: 0, stdout: "Ask the human.\nNo rule matched." });

    await createRole(root, {
      name: "product-manager",
      label: "Product manager",
      job: "Write the reading",
    });
    const owned = await routeRole(root, {});
    expect(owned).toMatchObject({
      exitCode: 0,
      stdout:
        "role product-manager\nreason Stage requirements is owned by product-manager.\nrule stage-owner",
    });

    await writeFile(
      join(root, ".sdd/team.yaml"),
      [
        "branch: bot/{bot}/{change}",
        "rooms:",
        "  commit: false",
        "bots:",
        "  - name: dev-a",
        "    role: developer",
        "    wip: 5",
        "  - name: dev-b",
        "    role: developer",
        "    wip: 5",
        "role_wip:",
        "  developer: 1",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      join(root, ".sdd/routing.yaml"),
      "rules:\n  - id: implement\n    stage: implement\n    role: developer\n",
      "utf8",
    );
    expect((await takeRole(root, { stage: "implement", id: "T-1" })).stdout).toContain(
      "dev-a took T-1",
    );
    expect(await takeRole(root, { stage: "implement", id: "T-2" })).toMatchObject({
      exitCode: 1,
      stdout: "developer is at the limit.",
    });
    await writeFile(join(root, ".sdd/agents/dev-a/inbox.jsonl"), "not json\n", "utf8");
    expect(await queueRole(root)).toMatchObject({ exitCode: 1, stdout: "inbox.jsonl is invalid" });
  });

  it("keeps the host stub on the router command", () => {
    const router = SDD_AGENT_ROLES.find((role) => role.id === "sdd");
    expect(router).toBeTruthy();
    const rules = router?.roleRules.join("\n") ?? "";
    expect(rules).toContain("sdd role route");
    expect(rules).not.toContain("If stage is");
    expect(renderThinAgent(router!).length).toBeLessThan(1400);
  });

  it("does not install a team when routing.yaml is already present", async () => {
    const root = await project();
    await mkdir(join(root, ".sdd"), { recursive: true });
    await writeFile(join(root, ".sdd/routing.yaml"), "rules: []\n", "utf8");
    const blocked = await initTeam(root, "software", null);
    expect(blocked.stdout).toContain("Routing config already exists");
    expect(blocked.stdout).toContain("Nothing was written");
    expect(await pathExists(join(root, ".sdd/team.yaml"))).toBe(false);
    expect(await pathExists(join(root, ".sdd/roles/developer.md"))).toBe(false);
    expect(await readFile(join(root, ".sdd/routing.yaml"), "utf8")).toBe("rules: []\n");
  });
});
