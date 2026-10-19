import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { dirname, join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import {
  EMBEDDINGS_UNAVAILABLE,
  type Embedder,
  type SearchRuntime,
  type SearchScope,
  countTokens,
  createBuiltinProvider,
  createChange,
  createFastembedEmbedder,
  executeSearch,
  fastembedImportCount,
  fuseByRank,
  generateCodeContext,
  initProject,
  loadConfig,
  loadSearchConfig,
  writeAgentHandoff,
} from "../index.js";
import { chunkMarkdown } from "../search/chunk-markdown.js";

const temps: string[] = [];
const here = dirname(fileURLToPath(import.meta.url));
const s1Fixture = join(here, "fixtures/search-s1");
const s2Fixture = join(here, "fixtures/search-s2");
const NEST_ONLY = new Set(["packages/secret-nest/hidden.ts", "packages/secret-nest/shown.ts"]);
const EN = "\u2013";
const SECRETS = ["FAKE_BIRTH_RECORD_S1", "fake-secret-s1-do-not-index"];
const CACHE_FILES = [
  "model_optimized.onnx",
  "tokenizer.json",
  "tokenizer_config.json",
  "config.json",
  "special_tokens_map.json",
];
const A_BODY = "export function zebraMarker() {\n  return 1;\n}";
const B_BODY = "export function zebraMarker() {\n  return 2;\n}";
const C_BODY = "export function padText(s: string): string {\n  return s.trim();\n}";
const ALPHA_BODY = "export function alphaWidget(n: number): number {\n  return n + 1;\n}";
const BETA_BODY = "export function betaWidget(x: string): string {\n  return x.trim();\n}";

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function copyTree(from: string, root: string, skip: Set<string>): Promise<void> {
  async function walk(dir: string, rel: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      const source = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(source, child);
        continue;
      }
      if (skip.has(child)) continue;
      const dest = join(root, child);
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, await readFile(source));
    }
  }
  await walk(from, "");
}

async function project(corpus: "s1" | "s2"): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sdd-search-s2-"));
  temps.push(root);
  await initProject({ projectRoot: root, agents: false });
  await copyTree(
    corpus === "s1" ? s1Fixture : s2Fixture,
    root,
    corpus === "s1" ? NEST_ONLY : new Set(),
  );
  return root;
}

async function patchSearch(
  root: string,
  patch: { embeddings?: boolean; k?: number; excludePrivate?: boolean; raw?: string },
): Promise<void> {
  const path = join(root, ".sdd/search.yaml");
  if (patch.raw) {
    await writeFile(path, patch.raw);
    return;
  }
  let text = await readFile(path, "utf8");
  if (patch.embeddings !== undefined) {
    text = text.replace("embeddings: false", `embeddings: ${String(patch.embeddings)}`);
  }
  if (patch.k !== undefined) text = text.replace("k: 20", `k: ${String(patch.k)}`);
  if (patch.excludePrivate) {
    text = text.replace("exclude: []", 'exclude:\n  - "*.jhd"\n  - "review-private/"');
  }
  await writeFile(path, text);
}

async function removeMemoryMarkdown(root: string): Promise<void> {
  const dir = join(root, "memory");
  for (const name of await readdir(dir)) {
    if (name.endsWith(".md")) await rm(join(dir, name));
  }
}

function codeBlock(path: string, symbol: string, body: string): string {
  return `### \`${path}\` · \`${symbol}\` (lines 1${EN}3) · full\n\`\`\`ts\n${body}\n\`\`\`\n`;
}

function searchHeader(query: string, budget: number, hybrid: boolean): string {
  const mode = hybrid ? "Mode: hybrid\n" : "";
  return `# Search\nQuery: ${query}\nScope: code\nProvider: builtin\n${mode}Budget: ${budget}\n\n`;
}

function vector(fill: (lanes: Float32Array) => void): Float32Array {
  const lanes = new Float32Array(384);
  fill(lanes);
  return lanes;
}

function hybridEmbedder(seen: string[]): Embedder {
  return {
    async embedPassages(texts) {
      return texts.map((text) => {
        seen.push(text);
        if (text.includes("return 2"))
          return vector((lanes) => {
            lanes[0] = 0.6;
            lanes[1] = 0.8;
          });
        if (text.includes("padText"))
          return vector((lanes) => {
            lanes[0] = 1;
          });
        if (text.includes("return 1"))
          return vector((lanes) => {
            lanes[1] = 1;
          });
        return vector((lanes) => {
          lanes[2] = 1;
        });
      });
    },
    async embedQuery(text) {
      seen.push(`query:${text}`);
      return vector((lanes) => {
        lanes[0] = 1;
      });
    },
  };
}

function git(root: string, args: string[]): string {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "sdd",
      GIT_AUTHOR_EMAIL: "sdd@example.com",
      GIT_COMMITTER_NAME: "sdd",
      GIT_COMMITTER_EMAIL: "sdd@example.com",
    },
  });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

function hitLines(text: string): string[] {
  return text.split("\n").filter((line) => line.startsWith("###"));
}

function betweenMarkers(text: string): string {
  const start = text.indexOf("<!-- retrieved-context:start -->");
  const end = text.indexOf("<!-- retrieved-context:end -->");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const between = text.slice(start + "<!-- retrieved-context:start -->".length, end);
  return between.slice(1, -1);
}

function openDb(root: string): Database.Database {
  return new Database(join(root, ".sdd/index.db"), { readonly: true, fileMustExist: true });
}

describe("search S2", () => {
  it("keeps the S1 keyword bytes when embeddings are omitted", async () => {
    const calls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
      calls.push(String(input));
      throw new Error("blocked");
    }) as typeof fetch;
    const importsBefore = fastembedImportCount;
    try {
      const root = await project("s1");
      const config = await loadConfig(root);
      const search = (query: string, scope: SearchScope, budget: number) =>
        executeSearch(root, config, query, scope, budget);
      const both =
        codeBlock("src/budget.ts", "alphaWidget", ALPHA_BODY) +
        codeBlock("src/other.ts", "betaWidget", BETA_BODY);
      const signature = `### \`src/other.ts\` · \`betaWidget\` (lines 1${EN}3) · signature\n\`\`\`ts\nexport function betaWidget(x: string): string {\n\`\`\`\n`;
      const full = await search("function", "code", 120);
      expect(full.text).toBe(`${searchHeader("function", 120, false)}${both}`);
      expect(countTokens(full.text)).toBe(108);
      expect(full.text).not.toContain("Mode:");
      const tight = await search("function", "code", 105);
      expect(tight.text).toBe(
        `${searchHeader("function", 105, false)}${codeBlock("src/budget.ts", "alphaWidget", ALPHA_BODY)}${signature}`,
      );
      expect(countTokens(tight.text)).toBe(102);
      const headerOnly = await search("function", "code", 30);
      expect(headerOnly.text).toBe(searchHeader("function", 30, false));
      expect(countTokens(headerOnly.text)).toBe(20);
      const none = await search("function", "code", 19);
      expect(none.text).toBe("");
      const marker = "## Slices\n\n";
      const contextTight = await generateCodeContext({
        projectRoot: root,
        query: "function",
        caps: { maxTokensApprox: 87 },
      });
      const tightBytes = contextTight.markdown.slice(
        contextTight.markdown.indexOf(marker) + marker.length,
      );
      expect(tightBytes).toBe(
        `${codeBlock("src/budget.ts", "alphaWidget", ALPHA_BODY)}${signature}`,
      );
      expect(countTokens(tightBytes)).toBe(82);
      const contextWide = await generateCodeContext({
        projectRoot: root,
        query: "function",
        caps: { maxTokensApprox: 88 },
      });
      const wideBytes = contextWide.markdown.slice(
        contextWide.markdown.indexOf(marker) + marker.length,
      );
      expect(wideBytes).toBe(both);
      expect(countTokens(wideBytes)).toBe(88);
      expect(calls).toEqual([]);
      expect(fastembedImportCount).toBe(importsBefore);
      await expect(stat(join(root, ".sdd/models"))).rejects.toThrow();
    } finally {
      globalThis.fetch = original;
    }
  });

  it("ranks the S2 corpus by keyword when embeddings are off", async () => {
    const root = await project("s2");
    await patchSearch(root, { embeddings: false, k: 2 });
    const config = await loadConfig(root);
    const result = await executeSearch(root, config, "zebraMarker", "code", 400);
    const expected =
      searchHeader("zebraMarker", 400, false) +
      codeBlock("src/a.ts", "zebraMarker", A_BODY) +
      codeBlock("src/b.ts", "zebraMarker", B_BODY);
    expect(result.text).toBe(expected);
    expect(countTokens(result.text)).toBe(102);
    expect(result.text).not.toContain("padText");
    expect(result.text).not.toContain("Mode:");
  });

  it("fuses keyword and vector ranks without cutting the union to k", async () => {
    const root = await project("s2");
    await patchSearch(root, { embeddings: true, k: 2 });
    const seen: string[] = [];
    const runtime: SearchRuntime = { embedder: hybridEmbedder(seen) };
    const config = await loadConfig(root);
    const provider = createBuiltinProvider(root, config, runtime);
    await provider.index();
    const first = await provider.search("zebraMarker", { scope: "code", k: 2, budget: 400 });
    const second = await provider.search("zebraMarker", { scope: "code", k: 2, budget: 400 });
    const expected =
      searchHeader("zebraMarker", 400, true) +
      codeBlock("src/b.ts", "zebraMarker", B_BODY) +
      codeBlock("src/a.ts", "zebraMarker", A_BODY) +
      codeBlock("src/c.ts", "padText", C_BODY);
    expect(first.warning).toBeUndefined();
    expect(first.text).toBe(expected);
    expect(second.text).toBe(first.text);
    expect(countTokens(first.text)).toBe(148);
    const lines = hitLines(first.text);
    expect(lines[0]).toContain("`src/b.ts` · `zebraMarker`");
    expect(lines[1]).toContain("`src/a.ts` · `zebraMarker`");
    expect(lines[2]).toContain("`src/c.ts` · `padText`");
    expect(seen.some((text) => SECRETS.some((secret) => text.includes(secret)))).toBe(false);
  });

  it("fuses the worked ranks with constant 60", () => {
    const fused = fuseByRank([
      { id: "a", path: "src/a.ts", startLine: 1, symbol: "zebraMarker", keywordRank: 1 },
      {
        id: "b",
        path: "src/b.ts",
        startLine: 1,
        symbol: "zebraMarker",
        keywordRank: 2,
        vectorRank: 2,
      },
      { id: "c", path: "src/c.ts", startLine: 1, symbol: "padText", vectorRank: 1 },
    ]);
    expect(fused.map((row) => row.id)).toEqual(["b", "a", "c"]);
    expect(fused[0]?.score).toBeCloseTo(1 / 31);
    expect(fused[1]?.score).toBeCloseTo(1 / 61);
    expect(fused[2]?.score).toBeCloseTo(1 / 61);
  });

  it("falls back to keyword search when the embedder factory throws", async () => {
    const root = await project("s2");
    const config = await loadConfig(root);
    const change = await createChange({
      projectRoot: root,
      config,
      title: "zebraMarker",
      workflowName: "feature",
    });
    await writeFile(join(change.path, "feature.md"), "\n");
    await patchSearch(root, { embeddings: true, k: 2 });
    const runtime: SearchRuntime = {
      embedderFactory: () => Promise.reject(new Error(`model missing ${root}`)),
    };
    const provider = createBuiltinProvider(root, config, runtime);
    await expect(provider.index()).resolves.toBeTruthy();
    const result = await provider.search("zebraMarker", { scope: "code", k: 2, budget: 400 });
    const expected =
      searchHeader("zebraMarker", 400, false) +
      codeBlock("src/a.ts", "zebraMarker", A_BODY) +
      codeBlock("src/b.ts", "zebraMarker", B_BODY);
    expect(result.warning).toBe(EMBEDDINGS_UNAVAILABLE);
    expect(result.warning).not.toContain(root);
    expect(result.text).toBe(expected);
    expect(result.text).not.toContain("Mode:");

    const context = await generateCodeContext(
      { projectRoot: root, query: "zebraMarker", caps: { maxTokensApprox: 400 } },
      runtime,
    );
    expect(context.ok).toBe(true);
    expect(context.gaps).toContainEqual({
      code: "embeddings_unavailable",
      message: EMBEDDINGS_UNAVAILABLE,
    });
    expect(context.markdown).not.toContain("padText");
    expect(context.markdown).not.toContain("Mode:");

    const handoffPath = await writeAgentHandoff(root, config, change.id, 400, runtime);
    const handoff = await readFile(handoffPath, "utf8");
    const inner = betweenMarkers(handoff);
    expect(inner).not.toContain(EMBEDDINGS_UNAVAILABLE);
    expect(inner).not.toContain("padText");
  });

  it("uses the fused order for context and the handoff", async () => {
    const root = await project("s2");
    await removeMemoryMarkdown(root);
    const config = await loadConfig(root);
    const change = await createChange({
      projectRoot: root,
      config,
      title: "zebraMarker",
      workflowName: "feature",
    });
    await writeFile(join(change.path, "feature.md"), "\n");
    await patchSearch(root, { embeddings: true, k: 2 });
    const runtime: SearchRuntime = { embedder: hybridEmbedder([]) };
    const context = await generateCodeContext(
      { projectRoot: root, query: "zebraMarker", caps: { maxTokensApprox: 400 } },
      runtime,
    );
    const lines = hitLines(context.markdown);
    expect(lines[0]).toContain("`src/b.ts` · `zebraMarker`");
    expect(context.markdown).toContain("padText");
    expect(context.markdown).not.toContain("Mode:");
    const handoff = await readFile(
      await writeAgentHandoff(root, config, change.id, 400, runtime),
      "utf8",
    );
    expect(hitLines(betweenMarkers(handoff))).toEqual(lines);
  });

  it("deletes an incomplete model cache and leaves a complete cache in place", async () => {
    const calls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      calls.push(url);
      throw new Error("blocked");
    }) as typeof fetch;
    try {
      const root = await project("s2");
      const modelDir = join(root, ".sdd/models/fastembed/Qdrant_bge-small-en-v1.5-onnx-Q");
      await expect(
        createFastembedEmbedder(root, {
          init: () => Promise.reject(new Error("model missing")),
        }),
      ).rejects.toThrow("model missing");
      await expect(stat(modelDir)).rejects.toThrow();
      await mkdir(modelDir, { recursive: true });
      for (const name of CACHE_FILES) await writeFile(join(modelDir, name), "cached");
      const before = calls.length;
      await expect(
        createFastembedEmbedder(root, {
          init: () => Promise.reject(new Error("session")),
        }),
      ).rejects.toThrow("session");
      expect(calls.length).toBe(before);
      for (const name of CACHE_FILES) {
        const info = await stat(join(modelDir, name));
        expect(info.isFile()).toBe(true);
        expect(info.size).toBeGreaterThan(0);
      }
      for (const url of calls) {
        expect(
          url.startsWith("https://huggingface.co/Qdrant/bge-small-en-v1.5-onnx-Q/resolve/main/"),
        ).toBe(true);
        const name = url.split("/").pop()?.split("?")[0];
        expect(CACHE_FILES).toContain(name);
      }
    } finally {
      globalThis.fetch = original;
    }
  });

  it("embeds one shared body once", async () => {
    const root = await project("s2");
    await removeMemoryMarkdown(root);
    await patchSearch(root, { embeddings: true });
    const body = "export function sameBody() {\n  return 1;\n}\n";
    await writeFile(join(root, "src/a.ts"), body);
    await writeFile(join(root, "src/b.ts"), body);
    await rm(join(root, "src/c.ts"));
    const seen: string[] = [];
    const config = await loadConfig(root);
    const stats = await createBuiltinProvider(root, config, {
      embedder: {
        async embedPassages(texts) {
          seen.push(...texts);
          return texts.map(() =>
            vector((lanes) => {
              lanes[0] = 1;
            }),
          );
        },
        async embedQuery(text) {
          return vector((lanes) => {
            lanes[0] = text.length > 0 ? 1 : 0;
          });
        },
      },
    }).index();
    expect(stats.lastIndexChunksReindexed).toBe(2);
    expect(stats.lastIndexChunksEmbedded).toBe(1);
    expect(seen).toEqual(["export function sameBody() {\n  return 1;\n}"]);
    const db = openDb(root);
    try {
      const hashes = db.prepare("SELECT chunk_hash FROM vec_meta").all() as {
        chunk_hash: string;
      }[];
      expect(hashes).toHaveLength(2);
      expect(hashes[0]?.chunk_hash).toBe(hashes[1]?.chunk_hash);
    } finally {
      db.close();
    }
  });

  it("keeps index(paths) off the commit cursor", async () => {
    const root = await project("s2");
    await removeMemoryMarkdown(root);
    await rm(join(root, "src/c.ts"));
    await patchSearch(root, { embeddings: true });
    git(root, ["init", "-b", "main"]);
    git(root, ["add", "src/a.ts", "src/b.ts"]);
    git(root, ["commit", "-m", "add"]);
    const head = git(root, ["rev-parse", "HEAD"]);
    const runtime: SearchRuntime = { embedder: hybridEmbedder([]) };
    const config = await loadConfig(root);
    const provider = createBuiltinProvider(root, config, runtime);
    const full = await provider.index();
    expect(full.indexedCommit).toBe(head);
    expect(full.lastIndexFilesReindexed).toBe(2);
    const committedA = await readFile(join(root, "src/a.ts"), "utf8");
    await writeFile(join(root, "src/a.ts"), `${committedA}// a\n`);
    await writeFile(
      join(root, "src/b.ts"),
      "export function zebraMarker() {\n  return 2; // b\n}\n",
    );
    await provider.index(["src/b.ts"]);
    const db = openDb(root);
    try {
      const a = db.prepare("SELECT body FROM chunks WHERE path = ?").get("src/a.ts") as {
        body: string;
      };
      const b = db.prepare("SELECT body FROM chunks WHERE path = ?").get("src/b.ts") as {
        body: string;
      };
      expect(a.body).toBe(A_BODY);
      expect(b.body).toContain("// b");
      const cursor = db.prepare("SELECT value FROM meta WHERE key = ?").get("indexed_commit") as {
        value: string;
      };
      expect(cursor.value).toBe(head);
    } finally {
      db.close();
    }
  });

  it("indexes a dirty file without moving the commit cursor", async () => {
    const root = await project("s2");
    await removeMemoryMarkdown(root);
    await rm(join(root, "src/c.ts"));
    await patchSearch(root, { embeddings: true });
    git(root, ["init", "-b", "main"]);
    git(root, ["add", "src/a.ts", "src/b.ts"]);
    git(root, ["commit", "-m", "add"]);
    const head = git(root, ["rev-parse", "HEAD"]);
    const config = await loadConfig(root);
    const provider = createBuiltinProvider(root, config, { embedder: hybridEmbedder([]) });
    await provider.index();
    const dbBefore = openDb(root);
    let hashB = "";
    try {
      hashB = (
        dbBefore.prepare("SELECT content_hash FROM files WHERE path = ?").get("src/b.ts") as {
          content_hash: string;
        }
      ).content_hash;
    } finally {
      dbBefore.close();
    }
    await writeFile(
      join(root, "src/a.ts"),
      `${await readFile(join(root, "src/a.ts"), "utf8")}// dirty\n`,
    );
    const dirty = await provider.index();
    expect(dirty.lastIndexFilesReindexed).toBe(1);
    expect(dirty.indexedCommit).toBe(head);
    const during = openDb(root);
    try {
      const hash = during
        .prepare("SELECT content_hash FROM files WHERE path = ?")
        .get("src/b.ts") as {
        content_hash: string;
      };
      expect(hash.content_hash).toBe(hashB);
    } finally {
      during.close();
    }
    git(root, ["add", "src/a.ts"]);
    git(root, ["commit", "-m", "dirty"]);
    const next = git(root, ["rev-parse", "HEAD"]);
    const again = await provider.index();
    expect(again.indexedCommit).toBe(next);
    expect(again.lastIndexFilesReindexed).toBe(0);
    const after = openDb(root);
    try {
      const hash = after
        .prepare("SELECT content_hash FROM files WHERE path = ?")
        .get("src/b.ts") as {
        content_hash: string;
      };
      expect(hash.content_hash).toBe(hashB);
    } finally {
      after.close();
    }
  });

  it("drops chunk and vector rows when a committed file is deleted", async () => {
    const root = await project("s2");
    await removeMemoryMarkdown(root);
    await rm(join(root, "src/c.ts"));
    await patchSearch(root, { embeddings: true });
    git(root, ["init", "-b", "main"]);
    git(root, ["add", "src/a.ts", "src/b.ts"]);
    git(root, ["commit", "-m", "add"]);
    const config = await loadConfig(root);
    const provider = createBuiltinProvider(root, config, { embedder: hybridEmbedder([]) });
    await provider.index();
    await rm(join(root, "src/a.ts"));
    git(root, ["add", "-A"]);
    git(root, ["commit", "-m", "delete"]);
    await provider.index();
    const db = openDb(root);
    try {
      expect(db.prepare("SELECT COUNT(*) AS n FROM chunks WHERE path = ?").get("src/a.ts")).toEqual(
        { n: 0 },
      );
      expect(
        db
          .prepare(
            "SELECT COUNT(*) AS n FROM vec_meta WHERE chunk_id IN (SELECT id FROM chunks WHERE path = ?)",
          )
          .get("src/a.ts"),
      ).toEqual({ n: 0 });
      expect(
        (
          db.prepare("SELECT COUNT(*) AS n FROM chunks WHERE path = ?").get("src/b.ts") as {
            n: number;
          }
        ).n,
      ).toBe(1);
    } finally {
      db.close();
    }
    const result = await provider.search("zebraMarker", { scope: "code", k: 2, budget: 400 });
    expect(result.text).not.toContain("src/a.ts");
  });

  it("does not embed excluded or secret text", async () => {
    const root = await project("s2");
    const config = await loadConfig(root);
    const change = await createChange({
      projectRoot: root,
      config,
      title: "notes",
      workflowName: "feature",
    });
    await writeFile(join(change.path, "feature.md"), "\n");
    await patchSearch(root, { embeddings: true, k: 2, excludePrivate: true });
    const seen: string[] = [];
    const runtime: SearchRuntime = { embedder: hybridEmbedder(seen) };
    await createBuiltinProvider(root, config, runtime).index();
    for (const secret of SECRETS) {
      expect(seen.some((text) => text.includes(secret))).toBe(false);
    }
    const dbBytes = await readFile(join(root, ".sdd/index.db"));
    for (const secret of SECRETS) expect(dbBytes.includes(Buffer.from(secret))).toBe(false);
    const db = openDb(root);
    try {
      const bodies = db.prepare("SELECT body FROM chunks").all() as { body: string }[];
      const hashes = db.prepare("SELECT chunk_hash FROM vec_meta").all() as {
        chunk_hash: string;
      }[];
      for (const secret of SECRETS) {
        for (const row of bodies) expect(row.body).not.toContain(secret);
        for (const row of hashes) expect(row.chunk_hash).not.toContain(secret);
      }
    } finally {
      db.close();
    }
    for (const query of ["FAKE_BIRTH_RECORD_S1", "fake-secret-s1-do-not-index"]) {
      for (const scope of ["code", "specs", "memory"] as const) {
        const result = await createBuiltinProvider(root, config, runtime).search(query, {
          scope,
          k: 2,
          budget: 200,
        });
        const rest = result.text
          .split("\n")
          .filter((line) => !line.startsWith("Query:"))
          .join("\n");
        for (const secret of SECRETS) expect(rest).not.toContain(secret);
      }
    }
    const context = await generateCodeContext(
      { projectRoot: root, query: "FAKE_BIRTH_RECORD_S1", caps: { maxTokensApprox: 200 } },
      runtime,
    );
    const handoff = await readFile(
      await writeAgentHandoff(root, config, change.id, 200, runtime),
      "utf8",
    );
    for (const secret of SECRETS) {
      expect(context.markdown).not.toContain(secret);
      expect(handoff).not.toContain(secret);
    }
  });

  it("rejects a non-boolean embeddings flag before importing fastembed", async () => {
    const root = await project("s2");
    const before = fastembedImportCount;
    await patchSearch(root, { raw: 'version: 1\nprovider: builtin\nk: 20\nembeddings: "true"\n' });
    await expect(loadSearchConfig(root)).rejects.toThrow("search.yaml is invalid");
    const config = await loadConfig(root);
    await expect(executeSearch(root, config, "zebraMarker", "code", 50)).rejects.toThrow(
      "search.yaml is invalid",
    );
    try {
      await executeSearch(root, config, "zebraMarker", "code", 50);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      expect(message).not.toContain(root);
    }
    expect(fastembedImportCount).toBe(before);
  });

  it("gitignores models and does not create the directory when embeddings are off", async () => {
    const root = await mkdtemp(join(tmpdir(), "sdd-search-s2-init-"));
    temps.push(root);
    await initProject({ projectRoot: root, agents: false });
    const ignore = await readFile(join(root, ".sdd/.gitignore"), "utf8");
    expect(ignore).toBe(
      "handoff.md\nactive-context.md\nindex.db\nindex.db-journal\nindex.db-wal\nindex.db-shm\nmodels/\nrole-runs/\n",
    );
    await expect(stat(join(root, ".sdd/models"))).rejects.toThrow();
    const search = await readFile(join(root, ".sdd/search.yaml"), "utf8");
    expect(search).toContain("embeddings: false");
    expect(search).not.toContain("sdd:generated");
  });

  it("backfills missing vectors on a later full index and not on index(paths)", async () => {
    const root = await project("s2");
    await removeMemoryMarkdown(root);
    await patchSearch(root, { embeddings: false });
    git(root, ["init", "-b", "main"]);
    git(root, ["add", "src/a.ts", "src/b.ts", "src/c.ts"]);
    git(root, ["commit", "-m", "add"]);
    const config = await loadConfig(root);
    const off = await createBuiltinProvider(root, config).index();
    expect(off.lastIndexFilesReindexed).toBe(3);
    const before = openDb(root);
    try {
      expect((before.prepare("SELECT COUNT(*) AS n FROM chunks").get() as { n: number }).n).toBe(3);
      expect((before.prepare("SELECT COUNT(*) AS n FROM vec_meta").get() as { n: number }).n).toBe(
        0,
      );
    } finally {
      before.close();
    }
    await patchSearch(root, { embeddings: true });
    const on = await createBuiltinProvider(root, config, { embedder: hybridEmbedder([]) }).index();
    expect(on.lastIndexFilesReindexed).toBe(0);
    expect(on.lastIndexChunksEmbedded).toBe(3);
    const after = openDb(root);
    try {
      const chunks = (after.prepare("SELECT COUNT(*) AS n FROM chunks").get() as { n: number }).n;
      const metas = (after.prepare("SELECT COUNT(*) AS n FROM vec_meta").get() as { n: number }).n;
      expect(metas).toBe(chunks);
    } finally {
      after.close();
    }

    const retryRoot = await project("s2");
    await removeMemoryMarkdown(retryRoot);
    await patchSearch(retryRoot, { embeddings: true });
    const retryConfig = await loadConfig(retryRoot);
    const failing: SearchRuntime = {
      embedderFactory: () => Promise.reject(new Error("model missing")),
    };
    await expect(
      createBuiltinProvider(retryRoot, retryConfig, failing).index(),
    ).resolves.toBeTruthy();
    const empty = openDb(retryRoot);
    try {
      expect((empty.prepare("SELECT COUNT(*) AS n FROM vec_meta").get() as { n: number }).n).toBe(
        0,
      );
    } finally {
      empty.close();
    }
    const recovered = await createBuiltinProvider(retryRoot, retryConfig, {
      embedder: hybridEmbedder([]),
    }).index();
    expect(recovered.lastIndexChunksEmbedded).toBe(3);
    const filled = openDb(retryRoot);
    try {
      const chunks = (filled.prepare("SELECT COUNT(*) AS n FROM chunks").get() as { n: number }).n;
      const metas = (filled.prepare("SELECT COUNT(*) AS n FROM vec_meta").get() as { n: number }).n;
      expect(metas).toBe(chunks);
    } finally {
      filled.close();
    }

    const pathRoot = await project("s2");
    await removeMemoryMarkdown(pathRoot);
    await patchSearch(pathRoot, { embeddings: false });
    const pathConfig = await loadConfig(pathRoot);
    await createBuiltinProvider(pathRoot, pathConfig).index();
    await patchSearch(pathRoot, { embeddings: true });
    await createBuiltinProvider(pathRoot, pathConfig, { embedder: hybridEmbedder([]) }).index([
      "src/a.ts",
    ]);
    const pathDb = openDb(pathRoot);
    try {
      expect((pathDb.prepare("SELECT COUNT(*) AS n FROM vec_meta").get() as { n: number }).n).toBe(
        0,
      );
    } finally {
      pathDb.close();
    }
  });

  it("puts hybrid spec and memory hits ahead of a keyword-only code hit", async () => {
    const root = await project("s2");
    await removeMemoryMarkdown(root);
    await rm(join(root, "src/a.ts"));
    await rm(join(root, "src/b.ts"));
    await rm(join(root, "src/c.ts"));
    const config = await loadConfig(root);
    const change = await createChange({
      projectRoot: root,
      config,
      title: "sharedToken",
      workflowName: "feature",
    });
    await writeFile(join(change.path, "feature.md"), "\n");
    await patchSearch(root, { embeddings: true, k: 2 });
    await mkdir(join(root, "docs"), { recursive: true });
    await writeFile(
      join(root, "docs/spec-hit.md"),
      "# SpecHybrid\n\nsharedToken appears in the spec.\n",
    );
    await writeFile(
      join(root, "memory/mem-hit.md"),
      "# MemHybrid\n\nsharedToken appears in memory.\n",
    );
    await writeFile(
      join(root, "src/code-hit.ts"),
      'export function codeKeyword() {\n  return "sharedToken";\n}\n',
    );
    expect(
      chunkMarkdown("# SpecHybrid\n\nsharedToken appears in the spec.\n").map(
        (chunk) => chunk.symbol,
      ),
    ).toEqual(["SpecHybrid"]);
    expect(
      chunkMarkdown("# MemHybrid\n\nsharedToken appears in memory.\n").map((chunk) => chunk.symbol),
    ).toEqual(["MemHybrid"]);
    const runtime: SearchRuntime = {
      embedder: {
        async embedPassages(texts) {
          return texts.map((text) => {
            if (text.includes("codeKeyword")) throw new Error("code keyword");
            return vector((lanes) => {
              lanes[0] = 1;
            });
          });
        },
        async embedQuery() {
          return vector((lanes) => {
            lanes[0] = 1;
          });
        },
      },
    };
    await expect(createBuiltinProvider(root, config, runtime).index()).resolves.toBeTruthy();
    const db = openDb(root);
    try {
      const rows = db.prepare("SELECT symbol FROM chunks ORDER BY path").all() as {
        symbol: string;
      }[];
      expect(rows.map((row) => row.symbol).sort()).toEqual([
        "MemHybrid",
        "SpecHybrid",
        "codeKeyword",
      ]);
      const meta = db
        .prepare(
          `SELECT c.symbol AS symbol FROM vec_meta AS m
           JOIN chunks AS c ON c.id = m.chunk_id`,
        )
        .all() as { symbol: string }[];
      expect(meta.map((row) => row.symbol).sort()).toEqual(["MemHybrid", "SpecHybrid"]);
    } finally {
      db.close();
    }
    const handoff = await readFile(
      await writeAgentHandoff(root, config, change.id, 400, runtime),
      "utf8",
    );
    const lines = hitLines(betweenMarkers(handoff));
    expect(lines[0]).toContain("`docs/spec-hit.md` · `SpecHybrid`");
    expect(lines[1]).toContain("`memory/mem-hit.md` · `MemHybrid`");
    expect(lines[2]).toContain("`src/code-hit.ts` · `codeKeyword`");
  });
});
