/**
 * Unit tests: project templates under .sdd/templates are overridable.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import {
  createChange,
  defaultTemplatesDir,
  initProject,
  loadConfig,
  pathExists,
} from "../index.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const d = temps.pop();
    if (d) await rm(d, { recursive: true, force: true });
  }
});

describe("shipped review and sign-off templates", () => {
  it("carries verdict, severity, and SHA so they match the sign-off record", async () => {
    const dir = defaultTemplatesDir();
    for (const name of ["review.md", "signoff.md"]) {
      const body = await readFile(join(dir, name), "utf8");
      expect(body).toContain("## Verdict");
      expect(body).toContain("## Severity");
      expect(body).toContain("## SHA");
    }
  });
});

describe("templates are overridable", () => {
  it("uses customized .sdd/templates content for new change artifacts", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-tpl-"));
    temps.push(root);
    await initProject({ projectRoot: root, agents: false });

    const tplDir = join(root, ".sdd/templates");
    await mkdir(tplDir, { recursive: true });
    // hotfix starts with intent.md
    await writeFile(
      join(tplDir, "intent.md"),
      "# CUSTOM INTENT\n\nTitle: {{title}}\nId: {{id}}\n",
      "utf8",
    );

    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Override template test",
      workflowName: "hotfix",
    });

    const intentPath = join(ctx.path, "intent.md");
    expect(await pathExists(intentPath)).toBe(true);
    const body = await readFile(intentPath, "utf8");
    expect(body).toContain("CUSTOM INTENT");
    expect(body).toContain("Override template test");
    expect(body).toContain(ctx.id);
  });

  it("falls back to generated stub when template file missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-tpl-miss-"));
    temps.push(root);
    await initProject({ projectRoot: root, agents: false });

    // Remove feature template; feature workflow needs feature.md
    const featureTpl = join(root, ".sdd/templates/feature.md");
    if (await pathExists(featureTpl)) {
      await rm(featureTpl);
    }

    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Missing template feature",
      workflowName: "feature",
    });

    const featurePath = join(ctx.path, "feature.md");
    expect(await pathExists(featurePath)).toBe(true);
    const body = await readFile(featurePath, "utf8");
    // defaultArtifactContent shape
    expect(body).toMatch(/# feature/i);
    expect(body).toContain("Missing template feature");
  });
});
