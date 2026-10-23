import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import {
  createChange,
  formatTokenInventory,
  initProject,
  loadConfig,
  setActiveChange,
} from "../index.js";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

describe("workflow and artifact tokens", () => {
  it("counts each workflow file and artifact, and the active change", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-tokens-"));
    temps.push(root);
    await initProject({ projectRoot: root });
    await writeFile(
      join(root, ".sdd/workflows/token-gap.yaml"),
      [
        "name: token-gap",
        "stages:",
        "  - id: gap",
        "    artifacts:",
        "      - id: gap",
        "        path: gap.md",
        "        template: does-not-exist.md",
        "",
      ].join("\n"),
      "utf8",
    );
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Token sample",
      workflowName: "hotfix",
    });
    await writeFile(join(ctx.path, "intent.md"), "hello world", "utf8");
    await setActiveChange(root, config, ctx.id);

    const text = await formatTokenInventory(root, config);
    expect(text.startsWith("Tokens (cl100k):")).toBe(true);
    expect(text).toContain("hotfix  workflow ");
    expect(text).toContain("gap  gap.md  missing");
    expect(text).toContain("  artifacts 0");
    expect(text).not.toContain("$");
    expect(text.toLowerCase()).not.toContain("usd");

    const change = text.slice(text.indexOf("\nChange "));
    expect(change).toContain(`Change ${ctx.id}  workflow hotfix`);
    expect(change).toContain("intent  intent.md  2");
    expect(change).toContain("local-test-results.md  not written");
  });
});
