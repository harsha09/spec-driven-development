import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import { loadGeneratedManifest, reconcileGeneratedTree, saveGeneratedManifest } from "../index.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function put(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

describe("generated defaults manifest", () => {
  it("refreshes unchanged files and preserves edited or untracked files", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-generated-defaults-"));
    temps.push(root);
    const manifestPath = join(root, ".sdd/.generated.json");
    const sourceWorkflows = join(root, "package/workflows");
    const sourceTemplates = join(root, "package/templates");
    const destWorkflows = join(root, ".sdd/workflows");
    const destTemplates = join(root, ".sdd/templates");
    await put(join(sourceWorkflows, "patch.yaml"), "name: patch-v1\n");
    await put(join(sourceWorkflows, "team.yaml"), "name: packaged-team-default\n");
    await put(join(sourceTemplates, "intent.md"), "# Intent v1\n");
    await put(join(destWorkflows, "team.yaml"), "name: user-team-workflow\n");
    const manifest = await loadGeneratedManifest(manifestPath);

    const firstWorkflows = await reconcileGeneratedTree(
      root,
      sourceWorkflows,
      destWorkflows,
      ".sdd/workflows",
      manifest,
      false,
    );
    await reconcileGeneratedTree(
      root,
      sourceTemplates,
      destTemplates,
      ".sdd/templates",
      manifest,
      false,
    );
    await saveGeneratedManifest(manifestPath, manifest);
    expect(firstWorkflows.kept).toContainEqual({
      path: ".sdd/workflows/team.yaml",
      reason: "not-generated",
    });

    await put(join(sourceWorkflows, "patch.yaml"), "name: patch-v2\n");
    await put(join(sourceTemplates, "intent.md"), "# Intent v2\n");
    await put(join(destTemplates, "intent.md"), "# Team edited intent\n");
    const workflows = await reconcileGeneratedTree(
      root,
      sourceWorkflows,
      destWorkflows,
      ".sdd/workflows",
      manifest,
      true,
    );
    const templates = await reconcileGeneratedTree(
      root,
      sourceTemplates,
      destTemplates,
      ".sdd/templates",
      manifest,
      true,
    );

    expect(await readFile(join(destWorkflows, "patch.yaml"), "utf8")).toBe("name: patch-v2\n");
    expect(workflows.refreshed).toContain(".sdd/workflows/patch.yaml");
    expect(await readFile(join(destWorkflows, "team.yaml"), "utf8")).toBe(
      "name: user-team-workflow\n",
    );
    expect(await readFile(join(destTemplates, "intent.md"), "utf8")).toBe("# Team edited intent\n");
    expect(templates.kept).toContainEqual({
      path: ".sdd/templates/intent.md",
      reason: "edited",
    });

    await saveGeneratedManifest(manifestPath, manifest);
    const saved = await loadGeneratedManifest(manifestPath);
    expect(saved.files[".sdd/workflows/patch.yaml"]).toBeTruthy();
    expect(saved.files[".sdd/workflows/team.yaml"]).toBeUndefined();
  });

  it("rejects a malformed manifest before any defaults are written", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-bad-manifest-"));
    temps.push(root);
    const manifestPath = join(root, ".sdd/.generated.json");
    await put(manifestPath, "{bad json");

    await expect(loadGeneratedManifest(manifestPath)).rejects.toThrow(/no files were changed/i);
    expect(await readFile(manifestPath, "utf8")).toBe("{bad json");
  });
});
