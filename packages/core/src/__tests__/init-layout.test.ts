import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import { createChange, initProject, loadConfig, pathExists } from "../index.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const root = temps.pop();
    if (root) await rm(root, { recursive: true, force: true });
  }
});

describe("init layout root", () => {
  it("places all project paths under the selected root and supports change creation", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-layout-root-"));
    temps.push(root);

    await initProject({ projectRoot: root, layoutRoot: ".sdd", agents: false });
    const config = await loadConfig(root);

    expect(config.memory_path).toBe(".sdd/memory");
    expect(config.changes_path).toBe(".sdd/changes");
    expect(config.domains_path).toBe(".sdd/domains");
    expect(config.archive_path).toBe(".sdd/archive");
    expect(await pathExists(join(root, ".sdd/changes/.gitkeep"))).toBe(true);
    expect(await pathExists(join(root, ".sdd/domains/.gitkeep"))).toBe(true);
    expect(await pathExists(join(root, "changes"))).toBe(false);
    expect(await pathExists(join(root, "memory"))).toBe(false);

    const change = await createChange({
      projectRoot: root,
      config,
      title: "Namespaced change",
      workflowName: "hotfix",
    });
    expect(change.path).toContain("/.sdd/changes/");
    const changesIgnore = await readFile(join(root, ".sdd/changes/.gitignore"), "utf8");
    expect(changesIgnore).toContain(".active");
    expect(await pathExists(join(root, "changes/.gitignore"))).toBe(false);
    const sddIgnore = await readFile(join(root, ".sdd/.gitignore"), "utf8");
    expect(sddIgnore).toContain("handoff.md");
    expect(sddIgnore).toContain("active-context.md");
  });

  it("warns about existing memory content and leaves it intact", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-memory-warning-"));
    temps.push(root);
    await mkdir(join(root, "memory"));
    await writeFile(join(root, "memory/PRD.md"), "# Product requirements\n");

    const result = await initProject({ projectRoot: root, agents: false });

    expect(result.warnings.join(" ")).toMatch(/Existing memory\/ content will be preserved/);
    expect(await readFile(join(root, "memory/PRD.md"), "utf8")).toBe("# Product requirements\n");
  });

  it.each(["", "../outside", ".sdd/../../outside", "/tmp/sdd", "C:\\outside"])(
    "rejects unsafe root %j before writing project state",
    async (layoutRoot) => {
      const root = await mkdtemp(join(tmpdir(), "sdd-layout-invalid-"));
      temps.push(root);

      await expect(initProject({ projectRoot: root, layoutRoot, agents: false })).rejects.toThrow(
        /--root must be a non-empty, project-relative path/i,
      );
      expect(await pathExists(join(root, ".sdd/config.yaml"))).toBe(false);
      expect(await pathExists(join(root, "changes"))).toBe(false);
    },
  );
});
