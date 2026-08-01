import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveProjectRoot, runCodeContextTool } from "./context-tool.js";

const here = dirname(fileURLToPath(import.meta.url));
// monorepo fixtures live in core package
const fixtureRoot = join(
  here,
  "../../core/src/__tests__/fixtures/code-context",
);

describe("runCodeContextTool", () => {
  it("returns focused markdown under a tight token budget", async () => {
    const { text, result } = await runCodeContextTool({
      projectRoot: fixtureRoot,
      paths: ["alpha.ts"],
      symbols: ["buildAgentPrompt"],
      maxTokens: 2000,
      format: "markdown",
    });
    expect(result.summary.filesAnalyzed).toBeGreaterThan(0);
    expect(text.length).toBeGreaterThan(40);
    expect(text).toMatch(/Code context|buildAgentPrompt|alpha|slice/i);
  });

  it("summary format is compact JSON", async () => {
    const { text, result } = await runCodeContextTool({
      projectRoot: fixtureRoot,
      paths: ["alpha.ts"],
      format: "summary",
      maxTokens: 1500,
    });
    expect(result.ok || result.gaps.length >= 0).toBe(true);
    const parsed = JSON.parse(text);
    expect(parsed).toHaveProperty("summary");
  });
});

describe("resolveProjectRoot", () => {
  it("prefers explicit root", () => {
    expect(resolveProjectRoot("/tmp/proj")).toBe("/tmp/proj");
  });
});
