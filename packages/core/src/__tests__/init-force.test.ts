import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { contentHash, initProject, loadConfig } from "../index.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function freshProject() {
  const root = await mkdtemp(join(tmpdir(), "sdd-init-force-"));
  temps.push(root);
  await initProject({ projectRoot: root, agents: false });
  return root;
}

describe("sdd init --force preserves project customization", () => {
  it("merges nested config and custom paths over current defaults", async () => {
    const root = await freshProject();
    const configPath = join(root, ".sdd/config.yaml");
    const raw = parseYaml(await readFile(configPath, "utf8")) as Record<string, unknown>;
    raw.memory_path = ".sdd/memory";
    raw.changes_path = ".sdd/changes";
    raw.domains_path = ".sdd/domains";
    raw.archive_path = ".sdd/archive";
    (raw.per_change as Record<string, unknown>).allow_skip = false;
    (raw.persistence as Record<string, unknown>).archive_on_complete = true;
    (raw.policy as Record<string, unknown>).gates = "hard";
    await writeFile(configPath, stringifyYaml(raw));

    await initProject({ projectRoot: root, agents: false, force: true });
    const config = await loadConfig(root);

    expect(config.memory_path).toBe(".sdd/memory");
    expect(config.changes_path).toBe(".sdd/changes");
    expect(config.domains_path).toBe(".sdd/domains");
    expect(config.archive_path).toBe(".sdd/archive");
    expect(config.per_change.allow_skip).toBe(false);
    expect(config.per_change.allow_gate_override).toBe("soft_only");
    expect(config.persistence.archive_on_complete).toBe(true);
    expect(config.metrics.enabled).toBe(true);
  });

  it("keeps edited workflows/templates and reports them while refreshing untouched defaults", async () => {
    const root = await freshProject();
    const workflowPath = join(root, ".sdd/workflows/patch.yaml");
    const templatePath = join(root, ".sdd/templates/intent.md");
    const untouchedPath = join(root, ".sdd/workflows/feature.yaml");
    const originalWorkflow = await readFile(workflowPath, "utf8");
    const workflow = `${originalWorkflow}\n# Team-owned policy\n`;
    const template = `${await readFile(templatePath, "utf8")}\nTeam-specific intent prompt.\n`;
    const untouched = await readFile(untouchedPath, "utf8");
    await writeFile(workflowPath, workflow);
    await writeFile(templatePath, template);

    const result = await initProject({ projectRoot: root, agents: false, force: true });
    const manifest = JSON.parse(await readFile(join(root, ".sdd/.generated.json"), "utf8"));

    expect(await readFile(workflowPath, "utf8")).toBe(workflow);
    expect(await readFile(templatePath, "utf8")).toBe(template);
    expect(await readFile(untouchedPath, "utf8")).toBe(untouched);
    expect(result.kept).toEqual(
      expect.arrayContaining([
        { path: ".sdd/workflows/patch.yaml", reason: "edited" },
        { path: ".sdd/templates/intent.md", reason: "edited" },
      ]),
    );
    expect(manifest.files[".sdd/workflows/patch.yaml"]).toBe(contentHash(originalWorkflow));
  });

  it("treats pre-manifest workflow files as user-owned on legacy upgrades", async () => {
    const root = await freshProject();
    const workflowPath = join(root, ".sdd/workflows/patch.yaml");
    const before = await readFile(workflowPath, "utf8");
    await rm(join(root, ".sdd/.generated.json"));

    const result = await initProject({ projectRoot: root, agents: false, force: true });
    const manifest = JSON.parse(await readFile(join(root, ".sdd/.generated.json"), "utf8"));

    expect(await readFile(workflowPath, "utf8")).toBe(before);
    expect(result.kept).toContainEqual({
      path: ".sdd/workflows/patch.yaml",
      reason: "not-generated",
    });
    expect(manifest.files[".sdd/workflows/patch.yaml"]).toBeUndefined();
  });

  it("fails on a malformed manifest before changing config or workflow files", async () => {
    const root = await freshProject();
    const configPath = join(root, ".sdd/config.yaml");
    const workflowPath = join(root, ".sdd/workflows/patch.yaml");
    const configBefore = await readFile(configPath, "utf8");
    const workflowBefore = await readFile(workflowPath, "utf8");
    await writeFile(join(root, ".sdd/.generated.json"), "{invalid");

    await expect(initProject({ projectRoot: root, agents: false, force: true })).rejects.toThrow(
      /invalid generated file manifest.*no files were changed/i,
    );
    expect(await readFile(configPath, "utf8")).toBe(configBefore);
    expect(await readFile(workflowPath, "utf8")).toBe(workflowBefore);
  });
});
