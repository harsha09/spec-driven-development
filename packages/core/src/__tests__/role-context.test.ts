import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import { initProject, loadBrain, pathExists, readTeamConfig } from "../index.js";
import { createRole, deleteRole, roleContextBody, runRole, setRoleContext } from "../role/index.js";
import type { RoleModel } from "../role/types.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sdd-role-context-"));
  temps.push(root);
  await initProject({ projectRoot: root, agents: false });
  await createRole(root, {
    name: "analyst",
    label: "Analyst",
    job: "Write the reading",
  });
  return root;
}

function model(): { model: RoleModel; prompts: string[] } {
  const prompts: string[] = [];
  return {
    prompts,
    model: {
      async complete(input) {
        prompts.push(input.prompt);
        return JSON.stringify({ text: "noted" });
      },
    },
  };
}

describe("role context", () => {
  it("keeps the context a developer writes", async () => {
    const root = await project();
    const saved = await setRoleContext(root, { name: "analyst", text: "Ship the CLI only." });
    expect(saved).toEqual({ exitCode: 0, stdout: "Ship the CLI only." });
    const again = await setRoleContext(root, { name: "analyst" });
    expect(again.stdout).toBe("Ship the CLI only.");
    expect(await roleContextBody(root, "analyst")).toBe("Ship the CLI only.");
    const empty = await setRoleContext(root, { name: "analyst", text: "   " });
    expect(empty).toEqual({ exitCode: 1, stdout: "A context needs text." });
    expect(await roleContextBody(root, "analyst")).toBe("Ship the CLI only.");
  });

  it("builds context from the repo, the role name, and optional knowledge", async () => {
    const root = await project();
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(
      join(root, "src", "analyst-note.ts"),
      'export const analystMarker = "role-context-marker";\n',
      "utf8",
    );
    await writeFile(join(root, ".env"), "SECRET=role-context-secret\n", "utf8");
    const noted = await setRoleContext(root, {
      name: "analyst",
      knowledge: "Prefer the change pack.",
    });
    expect(noted.exitCode).toBe(0);
    expect(noted.stdout).toBe("Prefer the change pack.");
    const built = await setRoleContext(root, { name: "analyst", generate: true });
    expect(built.exitCode).toBe(0);
    expect(built.stdout).toContain("Role: analyst");
    expect(built.stdout).toContain("Job: Write the reading");
    expect(built.stdout).toContain("Knowledge:\nPrefer the change pack.");
    expect(built.stdout).toContain("role-context-marker");
    expect(built.stdout).not.toContain("role-context-secret");
    const file = await roleContextBody(root, "analyst");
    expect(file).toBe(built.stdout);
  });

  it("uses saved context on a run and drops it when the budget is the role file", async () => {
    const root = await project();
    await setRoleContext(root, { name: "analyst", text: "Ship the CLI only." });
    const fake = model();
    const result = await runRole(root, {
      name: "analyst",
      task: "say hi",
      model: fake.model,
      now: () => new Date("2026-10-29T00:00:00.000Z"),
    });
    expect(result.exitCode).toBe(0);
    expect(fake.prompts[0]).toContain("Context:\nShip the CLI only.");
    expect(fake.prompts[0]).toContain("Task: say hi");

    await writeFile(
      join(root, ".sdd", "team.yaml"),
      [
        "branch: bot/{bot}/{change}",
        "rooms:",
        "  commit: false",
        "bots:",
        "  - name: analyst",
        "    role: analyst",
        "    wip: 1",
        "humans: []",
        "",
      ].join("\n"),
      "utf8",
    );
    const loaded = await readTeamConfig(root);
    if (!("team" in loaded)) throw new Error(loaded.error);
    const roomy = await loadBrain(root, loaded.team, "analyst", { text: "say hi" }, 8000);
    if ("error" in roomy) throw new Error(roomy.error);
    expect(roomy.prompt).toContain("Context:\nShip the CLI only.");

    const tight = await loadBrain(root, loaded.team, "analyst", { text: "say hi" }, 1);
    if ("error" in tight) throw new Error(tight.error);
    expect(tight.prompt).not.toContain("Ship the CLI only.");

    await deleteRole(root, "analyst");
    expect(await pathExists(join(root, ".sdd/role-context/analyst"))).toBe(false);
    expect((await setRoleContext(root, { name: "analyst" })).stdout).toBe("Role not found.");
  });
});
