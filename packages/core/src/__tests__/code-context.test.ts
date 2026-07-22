import { mkdtemp, rm, writeFile, mkdir, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "pathe";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildAgentPrompt,
  createChange,
  generateCodeContext,
  initProject,
  isSecretPath,
  loadConfig,
  resolveFocus,
  tokenizeKeywords,
  typescriptAdapter,
  type LanguageAdapter,
  type AdapterExtractResult,
} from "../index.js";

const temps: string[] = [];
const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/code-context",
);

async function tempProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "sdd-cc-"));
  temps.push(dir);
  await initProject({ projectRoot: dir });
  return dir;
}

async function copyFixtures(root: string): Promise<string> {
  const dest = join(root, "packages", "demo", "src");
  await mkdir(dest, { recursive: true });
  await cp(fixtureDir, dest, { recursive: true });
  return dest;
}

afterEach(async () => {
  while (temps.length) {
    const d = temps.pop();
    if (d) await rm(d, { recursive: true, force: true });
  }
});

describe("code-context helpers", () => {
  it("tokenizes keywords and drops stopwords", () => {
    const kw = tokenizeKeywords(
      "I want to add a feature for AST ranking using agents",
    );
    expect(kw).toContain("ranking");
    expect(kw).not.toContain("want");
    expect(kw).not.toContain("feature");
    expect(kw).not.toContain("agents");
  });

  it("denies secret paths", () => {
    expect(isSecretPath(".env")).toBe(true);
    expect(isSecretPath("config/.env.local")).toBe(true);
    expect(isSecretPath("certs/server.pem")).toBe(true);
    expect(isSecretPath("id_rsa")).toBe(true);
    expect(isSecretPath("my-secret-token.txt")).toBe(true);
    expect(isSecretPath(".git/config")).toBe(true);
    expect(isSecretPath("packages/core/src/index.ts")).toBe(false);
  });
});

describe("FocusResolver", () => {
  it("seeds from explicit paths", async () => {
    const root = await tempProject();
    const dest = await copyFixtures(root);
    const alpha = join("packages", "demo", "src", "alpha.ts");
    const { plan, gaps } = await resolveFocus({
      projectRoot: root,
      paths: [alpha],
    });
    expect(plan.seedPaths.some((p) => p.endsWith("alpha.ts"))).toBe(true);
    expect(gaps.some((g) => g.code === "no_focus")).toBe(false);
    expect(dest).toBeTruthy();
  });

  it("hard-path ready when empty focus", async () => {
    const root = await tempProject();
    const { plan } = await resolveFocus({ projectRoot: root });
    expect(plan.seedPaths).toEqual([]);
    expect(plan.candidatePaths).toEqual([]);
  });

  it("extracts keywords from change title", async () => {
    const root = await tempProject();
    await copyFixtures(root);
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Wire ranking AST slices for demo alpha",
      workflowName: "hotfix",
    });
    const { plan } = await resolveFocus({
      projectRoot: root,
      changeId: ctx.id,
    });
    expect(plan.changeId).toBe(ctx.id);
    expect(plan.keywords.length).toBeGreaterThan(0);
  });
});

describe("generateCodeContext", () => {
  it("produces slices for real TS adapter on fixtures", async () => {
    const root = await tempProject();
    await copyFixtures(root);
    const alpha = "packages/demo/src/alpha.ts";
    const result = await generateCodeContext({
      projectRoot: root,
      paths: [alpha],
      symbols: ["buildAgentPrompt"],
    });
    expect(result.ok).toBe(true);
    expect(result.summary.filesAnalyzed).toBeGreaterThanOrEqual(1);
    expect(result.markdown).toContain("## Gaps");
    expect(result.markdown).toContain("## Slices");
    expect(result.slices.some((s) => s.symbolName === "buildAgentPrompt")).toBe(
      true,
    );
    expect(result.markdown).toContain("buildAgentPrompt");
  });

  it("prefers exact symbol over unrelated export", async () => {
    const root = await tempProject();
    await copyFixtures(root);
    const result = await generateCodeContext({
      projectRoot: root,
      paths: ["packages/demo/src"],
      symbols: ["buildAgentPrompt"],
      caps: { maxSlices: 5 },
    });
    expect(result.ok).toBe(true);
    expect(result.slices[0]?.symbolName).toBe("buildAgentPrompt");
  });

  it("enforces maxLinesPerSlice and maxSlices", async () => {
    const root = await tempProject();
    await copyFixtures(root);
    const result = await generateCodeContext({
      projectRoot: root,
      paths: ["packages/demo/src"],
      caps: { maxSlices: 1, maxLinesPerSlice: 3 },
    });
    expect(result.ok).toBe(true);
    expect(result.slices.length).toBeLessThanOrEqual(1);
    if (result.slices[0]) {
      const lines = result.slices[0].body.split("\n").length;
      expect(lines).toBeLessThanOrEqual(3);
    }
  });

  it("never includes .env body in slices", async () => {
    const root = await tempProject();
    await copyFixtures(root);
    await writeFile(join(root, ".env"), "SECRET=super-secret-value\n", "utf8");
    await writeFile(
      join(root, "packages/demo/src/.env.local"),
      "TOKEN=abc\n",
      "utf8",
    );
    const result = await generateCodeContext({
      projectRoot: root,
      paths: [".env", "packages/demo/src"],
      symbols: ["buildAgentPrompt"],
    });
    expect(result.ok).toBe(true);
    expect(result.markdown).not.toContain("super-secret-value");
    expect(result.markdown).not.toContain("TOKEN=abc");
    expect(
      result.gaps.some((g) => g.code === "path_denied_secret"),
    ).toBe(true);
    for (const s of result.slices) {
      expect(s.body).not.toContain("super-secret");
    }
  });

  it("soft-skips unsupported language with ok true", async () => {
    const root = await tempProject();
    await copyFixtures(root);
    const result = await generateCodeContext({
      projectRoot: root,
      paths: ["packages/demo/src/gamma.py", "packages/demo/src/alpha.ts"],
    });
    expect(result.ok).toBe(true);
    expect(result.gaps.some((g) => g.code === "unsupported_language")).toBe(
      true,
    );
    expect(result.slices.some((s) => s.filePath.endsWith("alpha.ts"))).toBe(
      true,
    );
  });

  it("returns no_focus hard failure when empty", async () => {
    const root = await tempProject();
    const result = await generateCodeContext({ projectRoot: root });
    expect(result.ok).toBe(false);
    expect(result.gaps.some((g) => g.code === "no_focus")).toBe(true);
    expect(result.markdown).toContain("## Gaps");
  });

  it("works with mock LanguageAdapter", async () => {
    const root = await tempProject();
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(
      join(root, "src/mock.ts"),
      "export function mocked() {}\n",
      "utf8",
    );

    const mock: LanguageAdapter = {
      id: "mock",
      extensions: [".ts"],
      extract(): AdapterExtractResult {
        return {
          ok: true,
          language: "mock",
          symbols: [
            {
              name: "mocked",
              kind: "function",
              filePath: "src/mock.ts",
              startLine: 1,
              endLine: 1,
              exported: true,
            },
          ],
          imports: [],
          exports: [{ name: "mocked" }],
        };
      },
    };

    const result = await generateCodeContext(
      {
        projectRoot: root,
        paths: ["src/mock.ts"],
        symbols: ["mocked"],
      },
      { adapters: [mock] },
    );
    expect(result.ok).toBe(true);
    expect(result.slices.some((s) => s.symbolName === "mocked")).toBe(true);
  });

  it("writes regenerable artifact when writeArtifactTo set", async () => {
    const root = await tempProject();
    await copyFixtures(root);
    const out = join(root, "changes", "tmp-artifact", "code-context.md");
    const result = await generateCodeContext({
      projectRoot: root,
      paths: ["packages/demo/src/alpha.ts"],
      symbols: ["buildAgentPrompt"],
      writeArtifactTo: out,
    });
    expect(result.ok).toBe(true);
    expect(result.artifactPath).toBe(out);
    const { readText } = await import("../fs.js");
    const body = await readText(out);
    expect(body).toContain("# Code context");
    expect(body).toContain("buildAgentPrompt");
  });

  it("formatter always includes Gaps section", async () => {
    const root = await tempProject();
    await copyFixtures(root);
    const result = await generateCodeContext({
      projectRoot: root,
      paths: ["packages/demo/src/beta.ts"],
    });
    expect(result.markdown).toMatch(/## Gaps\n_None\._|## Gaps\n-/);
    const gapsIdx = result.markdown.indexOf("## Gaps");
    const slicesIdx = result.markdown.indexOf("## Slices");
    const summaryIdx = result.markdown.indexOf("## Summary");
    expect(summaryIdx).toBeGreaterThan(-1);
    expect(gapsIdx).toBeGreaterThan(summaryIdx);
    expect(slicesIdx).toBeGreaterThan(gapsIdx);
  });
});

describe("typescript adapter unit", () => {
  it("extracts exported function and imports", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(join(fixtureDir, "alpha.ts"), "utf8"),
    );
    const extract = await typescriptAdapter.extract({
      filePath: "alpha.ts",
      source,
      projectRoot: fixtureDir,
    });
    expect(extract.ok).toBe(true);
    expect(extract.symbols.some((s) => s.name === "buildAgentPrompt")).toBe(
      true,
    );
    expect(extract.imports.some((i) => i.from.includes("beta"))).toBe(true);
  });
});

describe("handoff pointer", () => {
  it("includes code context section on implement stage", async () => {
    const root = await tempProject();
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Implement pointer check",
      workflowName: "hotfix",
    });
    // hotfix: intent -> implement after advance
    await writeFile(
      join(ctx.path, "intent.md"),
      "# Intent\n\nEnough substance for the stage artifact to pass checks.\n",
      "utf8",
    );
    const { advanceStage } = await import("../index.js");
    const advanced = await advanceStage(root, config, ctx.id);
    expect(advanced.ctx.meta.stage).toBe("implement");
    const prompt = await buildAgentPrompt(advanced.ctx, config, root);
    expect(prompt).toContain("## Code context (product code)");
    expect(prompt).toContain("sdd context");
  });

  it("omits code context section on intent stage", async () => {
    const root = await tempProject();
    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "Intent only pointer check",
      workflowName: "hotfix",
    });
    expect(ctx.meta.stage).toBe("intent");
    const prompt = await buildAgentPrompt(ctx, config, root);
    expect(prompt).not.toContain("## Code context (product code)");
  });
});
