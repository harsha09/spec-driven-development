import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
  contentHash,
  initProject,
  loadConfig,
  missingBundledWorkflows,
  recommendWorkflow,
} from "../index.js";

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

describe("per-machine gitignore (#11)", () => {
  it("writes ignore files on fresh init and line-merges them on --force", async () => {
    const root = await freshProject();
    const sddIgnore = join(root, ".sdd/.gitignore");
    const changesIgnore = join(root, "changes/.gitignore");
    expect(await readFile(sddIgnore, "utf8")).toBe(
      "handoff.md\nactive-context.md\nindex.db\nindex.db-journal\nindex.db-wal\nindex.db-shm\nmodels/\nrole-runs/\n",
    );
    expect(await readFile(changesIgnore, "utf8")).toBe(".active\n");

    await writeFile(sddIgnore, "# keep\nextra\nhandoff.md");
    await initProject({ projectRoot: root, agents: false, force: true });
    expect(await readFile(sddIgnore, "utf8")).toBe(
      "# keep\nextra\nhandoff.md\nactive-context.md\nindex.db\nindex.db-journal\nindex.db-wal\nindex.db-shm\nmodels/\nrole-runs/\n",
    );
    expect(await readFile(changesIgnore, "utf8")).toBe(".active\n");
    expect(await readFile(sddIgnore, "utf8")).not.toContain("sdd:generated");
  });

  it("appends missing gitignore lines without --force and does not rewrite config", async () => {
    const root = await freshProject();
    const sddIgnore = join(root, ".sdd/.gitignore");
    const configPath = join(root, ".sdd/config.yaml");
    const workflowPath = join(root, ".sdd/workflows/feature.yaml");
    const configBefore = await readFile(configPath, "utf8");
    const workflowBefore = await readFile(workflowPath, "utf8");
    await writeFile(sddIgnore, "extra\n");
    await initProject({ projectRoot: root, agents: false });
    const ignore = await readFile(sddIgnore, "utf8");
    expect(ignore.startsWith("extra\n")).toBe(true);
    expect(ignore).toContain("role-runs/\n");
    expect(await readFile(configPath, "utf8")).toBe(configBefore);
    expect(await readFile(workflowPath, "utf8")).toBe(workflowBefore);
    await initProject({ projectRoot: root, agents: false });
    expect(await readFile(sddIgnore, "utf8")).toBe(ignore);
  });

  it("appends .active under a custom changes_path and does not rewrite config", async () => {
    const root = await freshProject();
    const configPath = join(root, ".sdd/config.yaml");
    const original = await readFile(configPath, "utf8");
    const edited = original.replace(/^changes_path: changes$/m, "changes_path: .sdd/changes");
    await writeFile(configPath, edited);
    const customIgnore = join(root, ".sdd/changes/.gitignore");
    await mkdir(join(root, ".sdd/changes"), { recursive: true });
    await writeFile(customIgnore, "extra\n");
    await initProject({ projectRoot: root, agents: false });
    expect(await readFile(configPath, "utf8")).toBe(edited);
    expect(await readFile(customIgnore, "utf8")).toBe("extra\n.active\n");
    expect(await readFile(join(root, "changes/.gitignore"), "utf8")).toBe(".active\n");
  });

  it("warns when a per-machine file is already tracked and does not untrack it", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-tracked-"));
    temps.push(root);
    const git = (...args: string[]) => {
      const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0);
      return result.stdout;
    };
    git("init");
    git("config", "user.email", "sdd-test@example.com");
    git("config", "user.name", "sdd test");
    await initProject({ projectRoot: root, agents: false });
    await writeFile(join(root, ".sdd/active-context.md"), "local notes\n");
    git("add", "-f", ".sdd/active-context.md");
    git("commit", "-m", "track active context");

    const result = await initProject({ projectRoot: root, agents: false, force: true });
    expect(result.warnings.some((warning) => warning.includes(".sdd/active-context.md"))).toBe(
      true,
    );
    expect(git("ls-files", "--", ".sdd/active-context.md")).toContain(".sdd/active-context.md");
    expect(await readFile(join(root, ".sdd/active-context.md"), "utf8")).toBe("local notes\n");
  });

  it("does not warn or throw when git cannot answer", async () => {
    const root = await freshProject();
    const result = await initProject({
      projectRoot: root,
      agents: false,
      force: true,
      indexLookup: async () => null,
    });
    expect(result.warnings.filter((warning) => /tracked/i.test(warning))).toEqual([]);
    expect(await readFile(join(root, ".sdd/.gitignore"), "utf8")).toContain("handoff.md");
  });
});

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

  it("records a matching unmarked workflow and keeps one that differs (#36)", async () => {
    const root = await freshProject();
    const patchPath = join(root, ".sdd/workflows/patch.yaml");
    const featurePath = join(root, ".sdd/workflows/feature.yaml");
    const patchBefore = await readFile(patchPath, "utf8");
    const featureBefore = await readFile(featurePath, "utf8");
    await rm(featurePath);
    await rm(join(root, ".sdd/.generated.json"));

    const config = await loadConfig(root);
    const missing = await missingBundledWorkflows(root);
    expect(missing).toContain("feature");
    expect(missing).not.toContain("patch");
    await expect(
      recommendWorkflow(root, "probe", config, { preferred: "feature" }),
    ).rejects.toThrow(
      /This CLI ships feature\. Run `sdd init --here --force` to copy new defaults/,
    );

    const adopted = await initProject({ projectRoot: root, agents: false, force: true });
    const manifest = JSON.parse(await readFile(join(root, ".sdd/.generated.json"), "utf8")) as {
      files: Record<string, string>;
    };
    expect(await readFile(patchPath, "utf8")).toBe(patchBefore);
    expect(manifest.files[".sdd/workflows/patch.yaml"]).toBe(contentHash(patchBefore));
    expect(adopted.kept.some((k) => k.path === ".sdd/workflows/patch.yaml")).toBe(false);
    expect(await readFile(featurePath, "utf8")).toBe(featureBefore);
    expect(manifest.files[".sdd/workflows/feature.yaml"]).toBe(contentHash(featureBefore));
    await expect(
      recommendWorkflow(root, "probe", config, { preferred: "feature" }),
    ).resolves.toMatchObject({ name: "feature" });

    const custom = `${patchBefore}\n# team edit\n`;
    await writeFile(patchPath, custom);
    manifest.files = Object.fromEntries(
      Object.entries(manifest.files).filter(([path]) => path !== ".sdd/workflows/patch.yaml"),
    );
    await writeFile(join(root, ".sdd/.generated.json"), `${JSON.stringify(manifest, null, 2)}\n`);

    const kept = await initProject({ projectRoot: root, agents: false, force: true });
    const after = JSON.parse(await readFile(join(root, ".sdd/.generated.json"), "utf8")) as {
      files: Record<string, string>;
    };
    expect(await readFile(patchPath, "utf8")).toBe(custom);
    expect(kept.kept).toContainEqual({
      path: ".sdd/workflows/patch.yaml",
      reason: "not-generated",
    });
    expect(after.files[".sdd/workflows/patch.yaml"]).toBeUndefined();
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

  it("writes prices.yaml when missing and keeps a user edit on --force", async () => {
    const root = await freshProject();
    const prices = join(root, ".sdd/prices.yaml");
    const text = await readFile(prices, "utf8");
    expect(text).toContain("usd_to_inr: 84");
    expect(text).not.toContain("sdd:generated");
    const manifest = JSON.parse(await readFile(join(root, ".sdd/.generated.json"), "utf8")) as {
      files: Record<string, string>;
    };
    expect(manifest.files[".sdd/prices.yaml"]).toBeUndefined();

    const edited = `${text}# user edit\n`;
    await writeFile(prices, edited);
    await initProject({ projectRoot: root, agents: false, force: true });
    expect(await readFile(prices, "utf8")).toBe(edited);

    await rm(prices);
    await initProject({ projectRoot: root, agents: false, force: true });
    expect(await readFile(prices, "utf8")).toBe(text);
  });

  it("writes search.yaml when missing, keeps an edit, and ignores the index", async () => {
    const root = await freshProject();
    const search = join(root, ".sdd/search.yaml");
    const text = await readFile(search, "utf8");
    expect(text).toContain("provider: builtin");
    expect(text).not.toContain("sdd:generated");
    const manifest = JSON.parse(await readFile(join(root, ".sdd/.generated.json"), "utf8")) as {
      files: Record<string, string>;
    };
    expect(manifest.files[".sdd/search.yaml"]).toBeUndefined();
    expect(await readFile(join(root, ".sdd/.gitignore"), "utf8")).toBe(
      "handoff.md\nactive-context.md\nindex.db\nindex.db-journal\nindex.db-wal\nindex.db-shm\nmodels/\nrole-runs/\n",
    );

    const edited = `${text}# user edit\n`;
    await writeFile(search, edited);
    await initProject({ projectRoot: root, agents: false, force: true });
    expect(await readFile(search, "utf8")).toBe(edited);

    await rm(search);
    await initProject({ projectRoot: root, agents: false, force: true });
    expect(await readFile(search, "utf8")).toBe(text);

    const git = spawnSync("git", ["init"], { cwd: root, encoding: "utf8" });
    expect(git.status, git.stderr).toBe(0);
    const ignored = spawnSync("git", ["check-ignore", ".sdd/index.db"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(ignored.status, ignored.stderr).toBe(0);
  });
});
