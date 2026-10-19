import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { dirname, join } from "pathe";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildAgentPrompt,
  buildContext,
  countTokens,
  createChange,
  executeSearch,
  extractiveSummary,
  generateCodeContext,
  initProject,
  loadConfig,
  refreshActiveAgentContext,
  writeAgentHandoff,
} from "../index.js";

const temps: string[] = [];
const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures/search-s1");

afterEach(async () => {
  vi.restoreAllMocks();
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sdd-search-s3-"));
  temps.push(root);
  await initProject({ projectRoot: root, agents: false });
  return root;
}

function longSection(heading: string): string {
  const filler = Array.from(
    { length: 40 },
    (_, i) => `tailword${i} stays in the indexed body and may be cut.`,
  ).join(" ");
  return `## ${heading}\n\n${heading} is the answer. ${filler}\n`;
}

function db(root: string): Database.Database {
  return new Database(join(root, ".sdd/index.db"), { readonly: true, fileMustExist: true });
}

describe("search S3", () => {
  it("pins the extractive summary at 80 cl100k tokens", () => {
    const signature = "## SpecAnswerHeading";
    const filler = Array.from(
      { length: 40 },
      (_, i) => `tailword${i} stays in the indexed body and may be cut.`,
    ).join(" ");
    const body = `${signature}\n\nSpecAnswerHeading is the answer. ${filler}`;
    const summary = extractiveSummary(signature, body);
    const expected = [
      "## SpecAnswerHeading",
      "",
      "SpecAnswerHeading is the answer. tailword0 stays in the indexed body and may be cut. tailword1 stays in the indexed body and may be cut. tailword2 stays in the indexed body and may be cut. tailword3 stays in the indexed body and may be cut. tailword4 stays in the indexed body and may be cut. tailword5",
    ].join("\n");
    expect(countTokens(body)).toBe(532);
    expect(countTokens(summary)).toBe(80);
    expect(summary).toBe(expected);
    expect(summary).not.toContain("tailword6");
    expect(extractiveSummary(signature, "## Short\n\nKept.")).toBe("## Short\n\nKept.");
  });

  it("keeps the active change in full and summarizes the other spec", async () => {
    const root = await project();
    await mkdir(join(root, "changes/keep"), { recursive: true });
    await mkdir(join(root, "changes/other"), { recursive: true });
    await writeFile(join(root, "changes/keep/feature.md"), longSection("SpecAnswerHeading"));
    await writeFile(join(root, "changes/other/feature.md"), longSection("SpecAnswerHeading"));
    await writeFile(join(root, "changes/.active"), "keep\n");
    const config = await loadConfig(root);
    const result = await executeSearch(root, config, "SpecAnswerHeading", "specs", 4000);
    expect(result.text).toContain("changes/keep/feature.md");
    expect(result.text).toContain("· full");
    expect(result.text).toContain("· summary");
    const otherAt = result.text.indexOf("changes/other/feature.md");
    const otherBlock = result.text.slice(otherAt, result.text.indexOf("```\n", otherAt + 10));
    expect(otherBlock).toContain("· summary");
    expect(otherBlock).not.toContain("tailword6");
    const keepAt = result.text.indexOf("changes/keep/feature.md");
    const keepBlock = result.text.slice(keepAt, result.text.indexOf("```\n", keepAt + 10));
    expect(keepBlock).toContain("· full");
    expect(keepBlock).toContain("tailword6");
    const stored = db(root);
    try {
      const bodies = stored.prepare("SELECT body FROM chunks").all() as { body: string }[];
      expect(bodies.some((row) => row.body.includes("tailword39"))).toBe(true);
    } finally {
      stored.close();
    }
  });

  it("reuses a warm code search without changing the S1 budget-120 stdout", async () => {
    const root = await project();
    const { cp } = await import("node:fs/promises");
    await cp(fixtureDir, root, { recursive: true });
    const config = await loadConfig(root);
    const first = await executeSearch(root, config, "function", "code", 120);
    const stored = db(root);
    let rows = 0;
    try {
      rows = (stored.prepare("SELECT COUNT(*) AS n FROM result_cache").get() as { n: number }).n;
    } finally {
      stored.close();
    }
    expect(rows).toBeGreaterThan(0);
    const second = await executeSearch(root, config, "function", "code", 120);
    expect(second.text).toBe(first.text);
    expect(countTokens(second.text)).toBe(108);
    expect(second.text).not.toContain("· summary");
    expect(second.text).not.toContain("Mode:");
    expect(second.text).not.toContain("cache");
  });

  it("drops only cache rows and summaries for the file that changed", async () => {
    const root = await project();
    await mkdir(join(root, "changes/aaa"), { recursive: true });
    await mkdir(join(root, "changes/bbb"), { recursive: true });
    await writeFile(join(root, "changes/aaa/feature.md"), longSection("AlphaOnlyToken"));
    await writeFile(join(root, "changes/bbb/feature.md"), longSection("BetaOnlyToken"));
    await writeFile(join(root, "changes/.active"), "\n");
    const config = await loadConfig(root);
    await executeSearch(root, config, "BetaOnlyToken", "specs", 4000);
    await executeSearch(root, config, "AlphaOnlyToken", "specs", 4000);
    const before = db(root);
    let betaKey = "";
    let betaRow = 0;
    let alphaKey = "";
    try {
      betaKey = (
        before
          .prepare("SELECT cache_key FROM result_cache WHERE query = ?")
          .get("BetaOnlyToken") as {
          cache_key: string;
        }
      ).cache_key;
      alphaKey = (
        before
          .prepare("SELECT cache_key FROM result_cache WHERE query = ?")
          .get("AlphaOnlyToken") as {
          cache_key: string;
        }
      ).cache_key;
      betaRow = (
        before
          .prepare("SELECT rowid AS id FROM spec_summaries WHERE path = ?")
          .get("changes/bbb/feature.md") as { id: number }
      ).id;
    } finally {
      before.close();
    }
    const alphaPath = join(root, "changes/aaa/feature.md");
    await writeFile(alphaPath, `${await readFile(alphaPath, "utf8")}x\n`);
    const again = await executeSearch(root, config, "BetaOnlyToken", "specs", 4000);
    expect(again.text).toContain("· summary");
    const after = db(root);
    try {
      const betaNow = after
        .prepare("SELECT cache_key FROM result_cache WHERE query = ?")
        .get("BetaOnlyToken") as { cache_key: string };
      expect(betaNow.cache_key).toBe(betaKey);
      const betaFiles = after
        .prepare("SELECT path FROM result_cache_files WHERE cache_key = ?")
        .all(betaKey) as { path: string }[];
      expect(betaFiles.map((row) => row.path)).not.toContain("changes/aaa/feature.md");
      const betaRowNow = after
        .prepare("SELECT rowid AS id FROM spec_summaries WHERE path = ?")
        .get("changes/bbb/feature.md") as { id: number };
      expect(betaRowNow.id).toBe(betaRow);
      const alphaStill = after
        .prepare("SELECT cache_key FROM result_cache WHERE cache_key = ?")
        .get(alphaKey);
      expect(alphaStill).toBeUndefined();
    } finally {
      after.close();
    }
  });

  it("does not store the private-record strings", async () => {
    const root = await project();
    await mkdir(join(root, "review-private"), { recursive: true });
    await writeFile(join(root, "review-private/birth.jhd"), "FAKE_BIRTH_RECORD_S1\n");
    await writeFile(join(root, ".env"), "fake-secret-s1-do-not-index\n");
    const yamlPath = join(root, ".sdd/search.yaml");
    const yaml = await readFile(yamlPath, "utf8");
    await writeFile(
      yamlPath,
      yaml.replace("exclude: []", 'exclude:\n  - "*.jhd"\n  - "review-private/"'),
    );
    const config = await loadConfig(root);
    const result = await executeSearch(root, config, "FAKE_BIRTH_RECORD_S1", "code", 200);
    expect(result.text).toContain("Query: FAKE_BIRTH_RECORD_S1");
    const bytes = await readFile(join(root, ".sdd/index.db"));
    expect(bytes.includes(Buffer.from("FAKE_BIRTH_RECORD_S1"))).toBe(false);
    expect(bytes.includes(Buffer.from("fake-secret-s1-do-not-index"))).toBe(false);
    const stored = db(root);
    try {
      const n = stored.prepare("SELECT COUNT(*) AS n FROM result_cache").get() as { n: number };
      expect(n.n).toBe(0);
    } finally {
      stored.close();
    }
  });

  it("falls back to a full pack when the summarizer throws", async () => {
    const summarize = await import("../search/summarize.js");
    vi.spyOn(summarize, "extractiveSummary").mockImplementation(() => {
      throw new Error("boom");
    });
    const root = await project();
    await mkdir(join(root, "changes/other"), { recursive: true });
    await writeFile(join(root, "changes/other/feature.md"), longSection("SpecAnswerHeading"));
    await writeFile(join(root, "changes/.active"), "\n");
    const config = await loadConfig(root);
    const result = await executeSearch(root, config, "SpecAnswerHeading", "specs", 4000);
    expect(result.text).toContain("· full");
    expect(result.text).not.toContain("· summary");
    expect(result.text).not.toContain("boom");
    expect(result.text).not.toContain("Embeddings are unavailable");
  });

  it("shares a stage-free handoff prefix and splices cached context", async () => {
    const root = await project();
    const config = await loadConfig(root);
    const created = await createChange({
      projectRoot: root,
      config,
      title: "Stable prefix",
      workflowName: "feature",
    });
    const metaPath = join(root, config.changes_path, created.id, "meta.yaml");
    const setStage = async (stage: string) => {
      const text = await readFile(metaPath, "utf8");
      await writeFile(metaPath, text.replace(/stage: \S+/, `stage: ${stage}`));
    };
    await setStage("clarify_intent");
    const intentCtx = await buildContext(root, config, created.id);
    const intent = await buildAgentPrompt(intentCtx, config, root);
    await setStage("clarify_design");
    const designCtx = await buildContext(root, config, created.id);
    const design = await buildAgentPrompt(designCtx, config, root);
    const cut = (text: string) => text.slice(0, text.indexOf("\n## Stage\n"));
    expect(cut(intent)).toBe(cut(design));
    expect(cut(intent)).not.toContain("clarify_intent");
    expect(cut(intent)).not.toContain("clarify_design");
    expect(intent).toContain("- Current stage: clarify_intent");
    expect(design).toContain("- Current stage: clarify_design");
    await setStage("clarify_intent");
    const handoffPath = await writeAgentHandoff(root, config, created.id);
    const handoff = await readFile(handoffPath, "utf8");
    const handoffCut = handoff.slice(0, handoff.indexOf("\n## Stage\n"));
    expect(handoffCut).not.toContain("clarify_intent");
    expect(handoffCut).toContain(cut(intent).slice(0, 40));
    expect(handoff).not.toContain("· stage **");
    expect(handoff).toContain("- Current stage: clarify_intent");
    await refreshActiveAgentContext(root);
    const active = await readFile(join(root, ".sdd/active-context.md"), "utf8");
    expect(active).toContain("stage **");

    const context = await generateCodeContext({
      projectRoot: root,
      query: "Stable",
      caps: { maxTokensApprox: 12000 },
    });
    const marker = "## Slices\n\n";
    const firstSlices = context.markdown.slice(context.markdown.indexOf(marker) + marker.length);
    const stored = db(root);
    try {
      const n = stored
        .prepare("SELECT COUNT(*) AS n FROM result_cache WHERE channel = ?")
        .get("context") as { n: number };
      expect(n.n).toBeGreaterThan(0);
    } finally {
      stored.close();
    }
    const again = await generateCodeContext({
      projectRoot: root,
      query: "Stable",
      caps: { maxTokensApprox: 12000 },
    });
    const secondSlices = again.markdown.slice(again.markdown.indexOf(marker) + marker.length);
    expect(secondSlices).toBe(firstSlices);
    expect(again.markdown.startsWith("# Code context")).toBe(true);
  });
});
