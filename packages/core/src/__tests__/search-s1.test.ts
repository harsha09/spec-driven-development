import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { dirname, join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import {
  type SearchScope,
  clearRegisteredSearchProviders,
  countTokens,
  createBuiltinProvider,
  createChange,
  executeSearch,
  generateCodeContext,
  initProject,
  loadConfig,
  loadExcluder,
  loadSearchConfig,
  registerSearchProvider,
  writeAgentHandoff,
} from "../index.js";

const temps: string[] = [];
const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures/search-s1");
const NEST_ONLY = new Set(["packages/secret-nest/hidden.ts", "packages/secret-nest/shown.ts"]);
const SECRETS = ["FAKE_BIRTH_RECORD_S1", "fake-secret-s1-do-not-index", "NESTED_JHD_SECRET"];

const ALPHA_FULL = [
  "### `src/budget.ts` · `alphaWidget` (lines 1\u20133) · full",
  "```ts",
  "export function alphaWidget(n: number): number {",
  "  return n + 1;",
  "}",
  "```",
].join("\n");

const BETA_FULL = [
  "### `src/other.ts` · `betaWidget` (lines 1\u20133) · full",
  "```ts",
  "export function betaWidget(x: string): string {",
  "  return x.trim();",
  "}",
  "```",
].join("\n");

const BETA_SIG = [
  "### `src/other.ts` · `betaWidget` (lines 1\u20133) · signature",
  "```ts",
  "export function betaWidget(x: string): string {",
  "```",
].join("\n");

const SLICE_87 = `${ALPHA_FULL}\n${BETA_SIG}\n`;
const SLICE_88 = `${ALPHA_FULL}\n${BETA_FULL}\n`;

function searchText(query: string, scope: string, budget: number, blocks: string): string {
  const head = `# Search\nQuery: ${query}\nScope: ${scope}\nProvider: builtin\nBudget: ${budget}\n\n`;
  return blocks ? `${head}${blocks}` : head;
}

const CASE2 = searchText("function", "code", 120, SLICE_88);
const CASE3 = searchText("function", "code", 105, SLICE_87);
const CASE4 = searchText("function", "code", 30, "");

const ALPHA_SECTION = [
  "### `changes/demo/feature.md` · `Alpha section` (lines 5\u20138) · full",
  "```md",
  "## Alpha section",
  "",
  "AlphaSectionBody is the answer.",
  "",
  "```",
].join("\n");

const MEMORY_ALPHA = [
  "### `memory/product.md` · `Memory alpha` (lines 3\u20135) · full",
  "```md",
  "## Memory alpha",
  "",
  "MemoryAlphaBody is kept.",
  "```",
].join("\n");

afterEach(async () => {
  clearRegisteredSearchProviders();
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function copyCorpus(root: string, nestCode: boolean): Promise<void> {
  async function walk(dir: string, rel: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      const from = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(from, child);
        continue;
      }
      if (!nestCode && NEST_ONLY.has(child)) continue;
      const dest = join(root, child);
      const { mkdir } = await import("node:fs/promises");
      await mkdir(dirname(dest), { recursive: true });
      const { cp } = await import("node:fs/promises");
      await cp(from, dest);
    }
  }
  await walk(fixtureDir, "");
}

async function project(opts?: { nestCode?: boolean; excludePrivate?: boolean }): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sdd-search-s1-"));
  temps.push(root);
  await initProject({ projectRoot: root, agents: false });
  await copyCorpus(root, opts?.nestCode === true);
  if (opts?.excludePrivate) {
    const path = join(root, ".sdd/search.yaml");
    const text = await readFile(path, "utf8");
    await writeFile(
      path,
      text.replace("exclude: []", 'exclude:\n  - "*.jhd"\n  - "review-private/"'),
    );
  }
  return root;
}

async function search(root: string, query: string, scope: SearchScope, budget: number) {
  const config = await loadConfig(root);
  return executeSearch(root, config, query, scope, budget);
}

function chunkBodies(root: string): string[] {
  const db = new Database(join(root, ".sdd/index.db"), { readonly: true, fileMustExist: true });
  try {
    const rows = db.prepare("SELECT body FROM chunks").all() as { body: string }[];
    return rows.map((row) => row.body);
  } finally {
    db.close();
  }
}

function storedFile(root: string, path: string): { hash: string; body: string } | null {
  const db = new Database(join(root, ".sdd/index.db"), { readonly: true, fileMustExist: true });
  try {
    const file = db.prepare("SELECT content_hash FROM files WHERE path = ?").get(path) as
      | { content_hash: string }
      | undefined;
    const chunk = db.prepare("SELECT body FROM chunks WHERE path = ?").get(path) as
      | { body: string }
      | undefined;
    if (!file || !chunk) return null;
    return { hash: file.content_hash, body: chunk.body };
  } finally {
    db.close();
  }
}

function withoutQuery(text: string): string {
  return text
    .split("\n")
    .filter((line) => !line.startsWith("Query:"))
    .join("\n");
}

describe("search S1", () => {
  it("counts hello world as two cl100k tokens", () => {
    expect(countTokens("hello world")).toBe(2);
  });

  it("packs both function hits under budget 120", async () => {
    const root = await project();
    const result = await search(root, "function", "code", 120);
    expect(result.text).toBe(CASE2);
    expect(countTokens(result.text)).toBe(108);
    expect(result.text).not.toContain(root);
    expect(result.warning).toBeUndefined();
    const { access } = await import("node:fs/promises");
    await expect(access(join(root, ".sdd/handoff.md"))).rejects.toThrow();
  });

  it("demotes the lower hit to a signature at budget 105", async () => {
    const root = await project();
    const result = await search(root, "function", "code", 105);
    expect(result.text).toBe(CASE3);
    expect(countTokens(result.text)).toBe(102);
    expect(result.text).toContain("· signature");
    expect(result.text).not.toContain("return x.trim()");
  });

  it("returns the header only at budget 30 and nothing at budget 19", async () => {
    const root = await project();
    const header = await search(root, "function", "code", 30);
    expect(header.text).toBe(CASE4);
    expect(countTokens(header.text)).toBe(20);
    const empty = await search(root, "function", "code", 19);
    expect(empty.text).toBe("");
    expect(countTokens(empty.text)).toBe(0);
  });

  it("repeats the same stdout when files do not change", async () => {
    const root = await project();
    const first = await search(root, "function", "code", 120);
    const second = await search(root, "function", "code", 120);
    expect(second.text).toBe(first.text);
    const py = await search(root, "alpha_symbol", "code", 200);
    const pyAgain = await search(root, "alpha_symbol", "code", 200);
    expect(py.text).toBe(pyAgain.text);
    expect(py.text).toContain("`src/notes.py` · `alpha_symbol`");
    expect(py.text).toContain("`src/notes.rs` · `alpha_symbol`");
    expect(countTokens(py.text)).toBeLessThanOrEqual(200);
  });

  it("packs the spec heading and the memory heading", async () => {
    const root = await project();
    const specs = await search(root, "AlphaSectionBody", "specs", 200);
    expect(specs.text).toBe(searchText("AlphaSectionBody", "specs", 200, `${ALPHA_SECTION}\n`));
    expect(countTokens(specs.text)).toBe(61);
    const memory = await search(root, "MemoryAlphaBody", "memory", 200);
    expect(memory.text).toBe(searchText("MemoryAlphaBody", "memory", 200, `${MEMORY_ALPHA}\n`));
    expect(countTokens(memory.text)).toBe(58);
  });

  it("keeps secrets and private paths out of search, context, handoff, and the index", async () => {
    const root = await project({ excludePrivate: true });
    const scopes: SearchScope[] = ["code", "specs", "memory"];
    const queries = ["FAKE_BIRTH", "fake-secret", "NESTED_JHD", "nestedHidden", "hiddenSkip"];
    for (const query of queries) {
      for (const scope of scopes) {
        const result = await search(root, query, scope, 200);
        for (const secret of SECRETS) expect(result.text).not.toContain(secret);
        const rest = withoutQuery(result.text);
        expect(rest).not.toContain("nestedHidden");
        expect(rest).not.toContain("hiddenSkip");
        for (const line of result.text.split("\n")) {
          if (!line.startsWith("###")) continue;
          expect(line).not.toContain("nestedHidden");
          expect(line).not.toContain("hiddenSkip");
        }
      }
    }

    const context = await generateCodeContext({
      projectRoot: root,
      query: "FAKE_BIRTH",
      caps: { maxTokensApprox: 200 },
    });
    for (const secret of SECRETS) expect(context.markdown).not.toContain(secret);
    expect(context.markdown).not.toContain("nestedHidden");
    expect(context.markdown).not.toContain("hiddenSkip");

    const config = await loadConfig(root);
    const ctx = await createChange({
      projectRoot: root,
      config,
      title: "function",
      workflowName: "feature",
    });
    await writeFile(
      join(ctx.path, "feature.md"),
      "# Notes\n\nA heading and a body about the catalog.\n",
    );
    const handoffPath = await writeAgentHandoff(root, config, ctx.id, 87);
    const handoff = await readFile(handoffPath, "utf8");
    const start = handoff.indexOf("<!-- retrieved-context:start -->");
    const end = handoff.indexOf("<!-- retrieved-context:end -->");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const between = handoff.slice(start + "<!-- retrieved-context:start -->".length, end);
    expect(between.slice(1, -1)).toBe(SLICE_87);
    expect(handoff).not.toContain("FAKE_BIRTH_RECORD_S1");
    expect(handoff).not.toContain(root);
    expect(handoff).not.toContain("## Code context (product code)");

    const dbBytes = await readFile(join(root, ".sdd/index.db"));
    for (const secret of SECRETS) {
      expect(dbBytes.includes(Buffer.from(secret))).toBe(false);
    }
    const bodies = chunkBodies(root);
    const db = new Database(join(root, ".sdd/index.db"), { readonly: true });
    try {
      const summaries = db.prepare("SELECT summary FROM spec_summaries").all() as {
        summary: string;
      }[];
      for (const secret of [...SECRETS, "nestedHidden", "hiddenSkip"]) {
        for (const body of bodies) expect(body).not.toContain(secret);
        for (const row of summaries) expect(row.summary).not.toContain(secret);
      }
      for (const body of bodies) expect(body).not.toContain(ctx.id);
      const paths = db.prepare("SELECT path FROM files").all() as { path: string }[];
      expect(paths.some((row) => row.path.startsWith(".sdd/"))).toBe(false);
    } finally {
      db.close();
    }
  });

  it("applies gitignore and still finds nested code that is not ignored", async () => {
    const root = await project({ nestCode: true });
    const exclude = await loadExcluder(root, []);
    expect(exclude("src/skip-me.ts")).toBe(true);
    expect(exclude("skip-me.ts")).toBe(true);
    expect(exclude("packages/secret-nest/note.jhd")).toBe(true);
    expect(exclude("other/note.jhd")).toBe(false);

    const shown = await search(root, "nestedShown", "code", 200);
    expect(shown.text).toContain("`packages/secret-nest/shown.ts` · `nestedShown`");
    const hidden = await search(root, "nestedHidden", "code", 200);
    expect(hidden.text.split("\n").some((line) => line.startsWith("###"))).toBe(false);
    expect(hidden.text).not.toContain("packages/secret-nest/hidden.ts");
    expect(withoutQuery(hidden.text)).not.toContain("nestedHidden");
  });

  it("reindexes one changed file and does not rewrite a path outside the list", async () => {
    const root = await project();
    const config = await loadConfig(root);
    const provider = createBuiltinProvider(root, config);
    await provider.index();
    const before = storedFile(root, "src/other.ts");
    const budgetBefore = storedFile(root, "src/budget.ts");
    expect(before).not.toBeNull();

    const budgetPath = join(root, "src/budget.ts");
    await writeFile(budgetPath, `${await readFile(budgetPath, "utf8")}// touched\n`);
    const full = await provider.index();
    expect(full.lastIndexFilesReindexed).toBe(1);
    expect(storedFile(root, "src/other.ts")).toEqual(before);
    expect(storedFile(root, "src/budget.ts")?.hash).not.toBe(budgetBefore?.hash);

    const otherPath = join(root, "src/other.ts");
    await writeFile(otherPath, `${await readFile(otherPath, "utf8")}// other\n`);
    await provider.index(["src/budget.ts"]);
    expect(storedFile(root, "src/other.ts")?.body).toBe(before?.body);

    const absolute = join(root, "src/budget.ts");
    await expect(provider.index([absolute])).rejects.toThrow(
      "Index path must be project-relative.",
    );
    try {
      await provider.index([absolute]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      expect(message).not.toContain(root);
    }
  });

  it("falls back to built-in search when the named provider is missing or throws", async () => {
    const root = await project();
    const yamlPath = join(root, ".sdd/search.yaml");
    const original = await readFile(yamlPath, "utf8");
    await writeFile(yamlPath, original.replace("provider: builtin", "provider: does-not-exist"));
    const missing = await search(root, "function", "code", 120);
    expect(missing.warning).toBe(
      'Search provider "does-not-exist" is unavailable. Using built-in keyword search.',
    );
    expect(missing.text).toBe(CASE2);
    expect(missing.provider).toBe("builtin");

    await writeFile(yamlPath, original.replace("provider: builtin", "provider: broken"));
    registerSearchProvider({
      id: "broken",
      async index() {
        throw new Error("index failed");
      },
      async search() {
        throw new Error("search failed");
      },
      async stats() {
        throw new Error("stats failed");
      },
    });
    const broken = await search(root, "function", "code", 120);
    expect(broken.warning).toBe(
      'Search provider "broken" is unavailable. Using built-in keyword search.',
    );
    expect(broken.text).toContain("`src/budget.ts` · `alphaWidget`");
    expect(broken.provider).toBe("builtin");
  });

  it("rejects an invalid search.yaml before opening a result", async () => {
    const root = await project();
    const yamlPath = join(root, ".sdd/search.yaml");
    await writeFile(yamlPath, (await readFile(yamlPath, "utf8")).replace("k: 20", "k: 0"));
    await expect(loadSearchConfig(root)).rejects.toThrow("search.yaml is invalid");
    await expect(search(root, "function", "code", 120)).rejects.toThrow("search.yaml is invalid");
  });

  it("packs context slices under budgets 87 and 88", async () => {
    const root = await project();
    const tight = await generateCodeContext({
      projectRoot: root,
      query: "function",
      caps: { maxTokensApprox: 87 },
    });
    const marker = "## Slices\n\n";
    const tightBytes = tight.markdown.slice(tight.markdown.indexOf(marker) + marker.length);
    expect(tightBytes).toBe(SLICE_87);
    expect(countTokens(tightBytes)).toBe(82);
    expect(tightBytes).not.toContain("return x.trim()");
    expect(tight.markdown).not.toContain("…(truncated)");
    expect(tight.markdown).not.toContain(root);
    const order = ["# Code context", "## Summary", "## Gaps", "## Slices"];
    let at = -1;
    for (const heading of order) {
      const next = tight.markdown.indexOf(heading);
      expect(next).toBeGreaterThan(at);
      at = next;
    }

    const wide = await generateCodeContext({
      projectRoot: root,
      query: "function",
      caps: { maxTokensApprox: 88 },
    });
    const wideBytes = wide.markdown.slice(wide.markdown.indexOf(marker) + marker.length);
    expect(wideBytes).toBe(SLICE_88);
    expect(countTokens(wideBytes)).toBe(88);
  });
});
