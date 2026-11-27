/**
 * Workflow YAML that fails the schema must name the file, the stage, and a fix.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import { initProject, loadWorkflow } from "../index.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sdd-workflow-error-"));
  temps.push(root);
  await initProject({ projectRoot: root, agents: false });
  return root;
}

describe("workflow schema errors", () => {
  it("explains a string verify command with the file, stage, and an example", async () => {
    const root = await project();
    const path = join(root, ".sdd/workflows/feature.yaml");
    const text = await readFile(path, "utf8");
    const broken = text.replace("      commands: []", '      commands:\n        - "npm test"');
    expect(broken).not.toBe(text);
    await writeFile(path, broken);

    const message = await loadWorkflow(root, "feature").then(
      () => "",
      (err: unknown) => (err instanceof Error ? err.message : String(err)),
    );
    expect(message).toBe(
      '.sdd/workflows/feature.yaml: stage "local_verify" verify.commands[0] must be an object with name, run, required (e.g. - {name: test, run: "npm test", required: true})',
    );
    expect(message).not.toContain("invalid_type");
    expect(message).not.toContain('"code"');
    expect(message.split("\n")).toHaveLength(1);
  });

  it("keeps a different workflow mistake to one readable line", async () => {
    const root = await project();
    const path = join(root, ".sdd/workflows/hotfix.yaml");
    const text = await readFile(path, "utf8");
    const broken = text.replace("skippable: false", "kind: nope\n    skippable: false");
    expect(broken).not.toBe(text);
    await writeFile(path, broken);

    const message = await loadWorkflow(root, "hotfix").then(
      () => "",
      (err: unknown) => (err instanceof Error ? err.message : String(err)),
    );
    expect(message).toContain('.sdd/workflows/hotfix.yaml: stage "intent" kind ');
    expect(message).toContain("Invalid enum value");
    expect(message).not.toContain("invalid_type");
    expect(message).not.toContain('"expected"');
    expect(message.split("\n")).toHaveLength(1);
  });
});
