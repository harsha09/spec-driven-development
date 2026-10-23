import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import { SDD_AGENT_ROLES, renderThinAgent } from "../agents.js";
import { pathExists } from "../fs.js";
import { createRole, createRoleFromTemplate, editRole, initTeam, showTeam } from "../role/index.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sdd-team-"));
  temps.push(root);
  await mkdir(join(root, ".sdd"), { recursive: true });
  return root;
}

describe("team config", () => {
  it("installs the software team, records a matching human, and does not overwrite", async () => {
    const root = await project();
    const first = await initTeam(root, "software", "Ada Lovelace");
    expect(first.exitCode).toBe(0);
    const team = await readFile(join(root, ".sdd/team.yaml"), "utf8");
    expect(team).toContain("template: software");
    expect(team).toContain("name: Ada Lovelace");
    expect(team).toContain("commit: false");
    expect(await readFile(join(root, ".sdd/roles/product-manager.md"), "utf8")).toContain(
      "accept a spec",
    );
    const shown = await showTeam(root, "Ada Lovelace");
    expect(shown.stdout).toContain("Ada Lovelace (you)");
    expect(shown.stdout).toContain("rooms.commit: false");
    expect(shown.stdout).toContain("developer 2");
    expect(await readFile(join(root, ".sdd/routing.yaml"), "utf8")).toContain("stage: implement");

    const again = await initTeam(root, "software", "Ada Lovelace");
    expect(again.stdout).toContain("Nothing was written");
    expect(await readFile(join(root, ".sdd/team.yaml"), "utf8")).toBe(team);
  });

  it("leaves humans empty when git has no name and blocks on an existing role", async () => {
    const root = await project();
    const solo = await initTeam(root, "solo", null);
    expect(solo.exitCode).toBe(0);
    expect(await pathExists(join(root, ".sdd/routing.yaml"))).toBe(false);
    expect((await showTeam(root, null)).stdout).toContain("- (none)");
    await rm(join(root, ".sdd/team.yaml"));
    const blocked = await initTeam(root, "software", null);
    expect(blocked.stdout).toContain("Role already exists: developer");
    expect(blocked.stdout).toContain("Nothing was written");
    expect(await pathExists(join(root, ".sdd/roles/product-manager.md"))).toBe(false);
    expect(await pathExists(join(root, ".sdd/team.yaml"))).toBe(false);
  });

  it("creates a role from a template and keeps an unambiguous short name", async () => {
    const root = await project();
    const ambiguous = await createRoleFromTemplate(root, { name: "dev", template: "developer" });
    expect(ambiguous.stdout).toContain("software/developer");
    expect(ambiguous.stdout).toContain("solo/developer");
    expect(await pathExists(join(root, ".sdd/roles/dev.md"))).toBe(false);

    const created = await createRoleFromTemplate(root, {
      name: "builder",
      template: "product-manager",
    });
    expect(created.exitCode).toBe(0);
    const text = await readFile(join(root, ".sdd/roles/builder.md"), "utf8");
    expect(text).toContain("name: builder");
    expect(text).toContain("owns:");
    expect(text).toContain("the short reading");
    await editRole(root, "builder", { job: "Keep the reading" });
    const edited = await readFile(join(root, ".sdd/roles/builder.md"), "utf8");
    expect(edited).toContain("job: Keep the reading");
    expect(edited).toContain("the short reading");
  });

  it("omits empty team lists on a plain role and rejects a bad team file", async () => {
    const root = await project();
    await createRole(root, { name: "builder", label: "Builder", job: "Build" });
    const text = await readFile(join(root, ".sdd/roles/builder.md"), "utf8");
    expect(text).not.toContain("owns:");
    await writeFile(join(root, ".sdd/team.yaml"), "branch: plain\nbots: []\n");
    const shown = await showTeam(root, null);
    expect(shown.exitCode).toBe(1);
    expect(shown.stdout).toContain("team.yaml is invalid");
  });

  it("states owns, never, checks, and ask when on each host stub", () => {
    for (const role of SDD_AGENT_ROLES) {
      const body = renderThinAgent(role);
      expect(body).toContain("Owns:");
      expect(body).toContain("Never:");
      expect(body).toContain("Checks:");
      expect(body).toContain("Ask when:");
    }
  });
});
